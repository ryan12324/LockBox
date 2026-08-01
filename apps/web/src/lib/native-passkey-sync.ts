import type { PasskeyItem, VaultItem } from '@lockbox/types';
import { ApiError, api } from './api.js';
import { encryptVaultItem } from './crypto.js';
import {
  exportPendingNativePasskey,
  getPendingNativePasskeys,
  markNativePasskeySynced,
} from './native-autofill.js';

export interface NativePasskeySyncResult {
  addedItems: PasskeyItem[];
  syncedCount: number;
  remainingCount: number;
}

interface NativePasskeySyncOptions {
  items: VaultItem[];
  existingItemIds: string[];
  token: string;
  userKey: Uint8Array;
}

/**
 * Drain Android's biometric-gated passkey outbox into the encrypted vault.
 * The native row is acknowledged only after upload, or after its stable item ID
 * is confirmed to already exist. Failures remain locally usable and retryable.
 */
export async function syncPendingNativePasskeys({
  items,
  existingItemIds,
  token,
  userKey,
}: NativePasskeySyncOptions): Promise<NativePasskeySyncResult> {
  const pending = await getPendingNativePasskeys();
  const knownItemIds = new Set(existingItemIds);
  const knownCredentialIds = new Set(
    items
      .filter((item): item is PasskeyItem => item.type === 'passkey')
      .map((item) => item.credentialId)
  );
  const addedItems: PasskeyItem[] = [];
  let syncedCount = 0;
  let remainingCount = 0;

  for (let index = 0; index < pending.length; index += 1) {
    const metadata = pending[index];

    if (
      knownItemIds.has(metadata.vaultItemId) ||
      knownCredentialIds.has(metadata.credentialId)
    ) {
      await markNativePasskeySynced(metadata.credentialId, metadata.vaultItemId);
      syncedCount += 1;
      continue;
    }

    let exported;
    try {
      exported = await exportPendingNativePasskey(metadata.credentialId);
    } catch {
      // A biometric cancellation is an intentional "not now". Avoid stacking
      // more prompts and leave this and all later records in the durable outbox.
      remainingCount += pending.length - index;
      break;
    }

    const revisionDate = new Date().toISOString();
    const item: PasskeyItem = {
      id: exported.vaultItemId,
      type: 'passkey',
      name: `${exported.rpName} passkey`,
      rpId: exported.rpId,
      rpName: exported.rpName,
      userId: exported.userId,
      userName: exported.userName,
      credentialId: exported.credentialId,
      publicKey: exported.publicKey,
      privateKey: exported.privateKey,
      counter: 0,
      transports: ['internal'],
      tags: ['passkey'],
      favorite: false,
      createdAt: exported.createdAt,
      updatedAt: revisionDate,
      revisionDate,
    };
    const encryptedData = await encryptVaultItem(
      item,
      userKey,
      item.id,
      item.revisionDate
    );

    try {
      await api.vault.createItem(
        {
          id: item.id,
          type: item.type,
          encryptedData,
          tags: item.tags,
          favorite: item.favorite,
          revisionDate: item.revisionDate,
        },
        token
      );
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 409) {
        remainingCount += pending.length - index;
        break;
      }

      // Upload may have succeeded while the acknowledgement was interrupted.
      // Confirm the stable ID before treating a conflict as success.
      const latest = await api.vault.list(token);
      if (!latest.items.some((existing) => existing.id === item.id)) {
        remainingCount += pending.length - index;
        break;
      }
    }

    // If this acknowledgement fails, the next unlock observes the stable ID and
    // completes it without creating a duplicate.
    await markNativePasskeySynced(item.credentialId, item.id).catch(() => {});
    knownItemIds.add(item.id);
    knownCredentialIds.add(item.credentialId);
    addedItems.push(item);
    syncedCount += 1;
  }

  return { addedItems, syncedCount, remainingCount };
}
