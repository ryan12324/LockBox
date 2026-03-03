/**
 * Passkey Vault Sync — bidirectional sync between Room DB passkey metadata
 * and the encrypted vault API.
 *
 * Encryption AAD contract: aad = utf8(itemId:revisionDate)
 * encryptedData format: base64(iv).base64(ciphertext+tag)
 */

import { registerPlugin } from '@capacitor/core';
import { encryptString, decryptString, toUtf8 } from '@lockbox/crypto';
import type { PasskeyItem } from '@lockbox/types';
import { Storage } from './plugins/storage.js';
import { buildPushPayload, type SyncResponse, type SyncVaultItem } from './offline/sync-queue.js';

// ─── Passkey Metadata Plugin ──────────────────────────────────────────────────

/** Passkey metadata for Room DB — matches PasskeyMetadataEntity columns. */
export interface PasskeyMetadata {
  credentialId: string;
  rpId: string;
  rpName: string;
  userName: string;
  userDisplayName: string;
  userId: string;
  createdAt: string;
}

/** Capacitor plugin for Room DB passkey_metadata table (maps to PasskeyMetadataDao). */
export interface PasskeyStorePlugin {
  getAllPasskeys(): Promise<{ passkeys: PasskeyMetadata[] }>;
  getPasskeyByCredentialId(options: {
    credentialId: string;
  }): Promise<{ passkey: PasskeyMetadata | null }>;
  upsertPasskey(options: PasskeyMetadata): Promise<void>;
  deletePasskey(options: { credentialId: string }): Promise<void>;
}

const PasskeyStore = registerPlugin<PasskeyStorePlugin>('PasskeyStore');

export { PasskeyStore };

// ─── Sync Result ──────────────────────────────────────────────────────────────

export interface PasskeySyncResult {
  pushed: number;
  pulled: number;
  errors: string[];
}

// ─── Encryption / Decryption ──────────────────────────────────────────────────

/**
 * Encrypt a PasskeyItem for vault storage.
 * AAD = utf8(itemId:revisionDate) — mismatch = silent decryption failure.
 */
export async function encryptPasskeyForVault(
  passkey: PasskeyItem,
  userKey: Uint8Array,
  itemId: string,
  revisionDate: string
): Promise<string> {
  const plaintext = JSON.stringify(passkey);
  const aad = toUtf8(`${itemId}:${revisionDate}`);
  return encryptString(plaintext, userKey.slice(0, 32), aad);
}

/** Decrypt a passkey vault item. Throws on auth failure. */
export async function decryptPasskeyFromVault(
  encryptedData: string,
  userKey: Uint8Array,
  itemId: string,
  revisionDate: string
): Promise<PasskeyItem> {
  const aad = toUtf8(`${itemId}:${revisionDate}`);
  const plaintext = await decryptString(encryptedData, userKey.slice(0, 32), aad);
  return JSON.parse(plaintext) as PasskeyItem;
}

// ─── Push: Local → Vault API ──────────────────────────────────────────────────

export async function syncPasskeysToVault(
  userKey: Uint8Array,
  token: string,
  apiUrl: string
): Promise<PasskeySyncResult> {
  const result: PasskeySyncResult = { pushed: 0, pulled: 0, errors: [] };

  const { items: allPending } = await Storage.getPendingItems();
  const pendingPasskeys = allPending.filter((item) => item.type === 'passkey');

  if (pendingPasskeys.length === 0) {
    return result;
  }

  const payload = buildPushPayload(pendingPasskeys);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${apiUrl}/api/sync/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Push failed with status ${response.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }

  for (const item of pendingPasskeys) {
    try {
      if (item.syncStatus === 'pending_delete') {
        await Storage.deleteItem({ id: item.id });
      } else {
        await Storage.updateSyncStatus({ id: item.id, syncStatus: 'synced' });
      }
      result.pushed++;
    } catch (err) {
      result.errors.push(
        `Failed to mark passkey ${item.id} as synced: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return result;
}

// ─── Pull: Vault API → Local ──────────────────────────────────────────────────

export async function syncPasskeysFromVault(
  userKey: Uint8Array,
  token: string,
  apiUrl: string
): Promise<PasskeySyncResult> {
  const result: PasskeySyncResult = { pushed: 0, pulled: 0, errors: [] };

  const { timestamp: since } = await Storage.getLastSyncTimestamp();
  const qs = since ? `?since=${encodeURIComponent(since)}` : '';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let syncData: SyncResponse;
  try {
    const response = await fetch(`${apiUrl}/api/sync${qs}`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Pull failed with status ${response.status}`);
    }

    syncData = (await response.json()) as SyncResponse;
  } finally {
    clearTimeout(timeout);
  }

  const incomingPasskeys: SyncVaultItem[] = [...syncData.added, ...syncData.modified].filter(
    (item) => item.type === 'passkey'
  );

  for (const item of incomingPasskeys) {
    try {
      const passkey = await decryptPasskeyFromVault(
        item.encryptedData,
        userKey,
        item.id,
        item.revisionDate
      );

      await Storage.upsertItem({
        id: item.id,
        encryptedData: item.encryptedData,
        type: 'passkey',
        tags: item.tags,
        favorite: item.favorite,
        revisionDate: item.revisionDate,
        syncStatus: 'synced',
      });

      // CredentialProviderService queries this table for autofill candidates
      await PasskeyStore.upsertPasskey({
        credentialId: passkey.credentialId,
        rpId: passkey.rpId,
        rpName: passkey.rpName,
        userName: passkey.userName,
        userDisplayName: passkey.userName,
        userId: passkey.userId,
        createdAt: passkey.createdAt,
      });

      result.pulled++;
    } catch (err) {
      result.errors.push(
        `Failed to process passkey ${item.id}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  for (const deletedId of syncData.deleted) {
    try {
      const { item: existing } = await Storage.getItem({ id: deletedId });
      if (existing?.type === 'passkey') {
        // Need credentialId from encrypted data to clean up Room DB
        const passkey = await decryptPasskeyFromVault(
          existing.encryptedData,
          userKey,
          deletedId,
          existing.revisionDate
        );
        await PasskeyStore.deletePasskey({ credentialId: passkey.credentialId });
        await Storage.deleteItem({ id: deletedId });
        result.pulled++;
      }
    } catch {
      // Non-existent or non-passkey items are expected — skip
    }
  }

  return result;
}
