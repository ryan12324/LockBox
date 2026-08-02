import {
  isAndroidAppUri,
  normalizeLoginUriForStorage,
  type LoginItem,
  type VaultItem,
} from '@lockbox/types';
import { ApiError, api } from './api.js';
import { encryptVaultItem } from './crypto.js';
import {
  deriveNativeCredentialSaveAuthorization,
  exportPendingNativeCredentialSave,
  getPendingNativeCredentialSaves,
  markNativeCredentialSaveSynced,
} from './native-autofill.js';

export interface NativeCredentialSaveSyncResult {
  changedItems: LoginItem[];
  syncedCount: number;
  remainingCount: number;
}

interface NativeCredentialSaveSyncOptions {
  items: VaultItem[];
  existingItemIds: string[];
  accountId: string;
  token: string;
  userKey: Uint8Array;
}

/**
 * Drain Android AutoFill saves into the encrypted vault after a normal vault unlock.
 * A stable native ID makes new-login retries idempotent; password changes update
 * an existing login only when both its target and username match.
 */
export async function syncPendingNativeCredentialSaves({
  items,
  existingItemIds,
  accountId,
  token,
  userKey,
}: NativeCredentialSaveSyncOptions): Promise<NativeCredentialSaveSyncResult> {
  const pending = await getPendingNativeCredentialSaves();
  if (pending.length === 0) {
    return { changedItems: [], syncedCount: 0, remainingCount: 0 };
  }
  const authorization = await deriveNativeCredentialSaveAuthorization(userKey, accountId);
  const knownItemIds = new Set(existingItemIds);
  const currentItems = [...items];
  const changedItems: LoginItem[] = [];
  let syncedCount = 0;
  let remainingCount = 0;

  for (let index = 0; index < pending.length; index += 1) {
    const metadata = pending[index];

    if (knownItemIds.has(metadata.id)) {
      await markNativeCredentialSaveSynced(metadata.id, authorization).catch(() => {});
      syncedCount += 1;
      continue;
    }

    let exported;
    try {
      exported = await exportPendingNativeCredentialSave(metadata.id, authorization);
    } catch {
      // Keep this and later saves durable if authorization or local decryption fails.
      remainingCount += pending.length - index;
      break;
    }

    const matchingIndex = currentItems.findIndex((item) => {
      if (item.type !== 'login') return false;
      const login = item as LoginItem;
      return (
        login.username === exported.username &&
        login.uris.some((uri) => targetsMatch(uri, exported.uri))
      );
    });
    const matching = matchingIndex >= 0 ? currentItems[matchingIndex] as LoginItem : null;

    if (matching?.password === exported.password) {
      await markNativeCredentialSaveSynced(metadata.id, authorization).catch(() => {});
      syncedCount += 1;
      continue;
    }

    const revisionDate = new Date().toISOString();
    const item: LoginItem = matching
      ? {
          ...matching,
          password: exported.password,
          updatedAt: revisionDate,
          revisionDate,
        }
      : {
          id: exported.id,
          type: 'login',
          name: exported.name,
          username: exported.username,
          password: exported.password,
          uris: [normalizeLoginUriForStorage(exported.uri)],
          tags: [],
          favorite: false,
          createdAt: exported.createdAt,
          updatedAt: revisionDate,
          revisionDate,
        };
    const encryptedData = await encryptVaultItem(item, userKey, item.id, item.revisionDate);

    try {
      if (matching) {
        await api.vault.updateItem(
          item.id,
          {
            encryptedData,
            folderId: item.folderId,
            tags: item.tags,
            favorite: item.favorite,
            revisionDate: item.revisionDate,
            expectedRevisionDate: matching.revisionDate,
          },
          token
        );
      } else {
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
      }
    } catch (error) {
      if (!matching && error instanceof ApiError && error.status === 409) {
        const latest = await api.vault.list(token);
        if (latest.items.some((candidate) => candidate.id === item.id)) {
          await markNativeCredentialSaveSynced(metadata.id, authorization).catch(() => {});
          knownItemIds.add(item.id);
          syncedCount += 1;
          continue;
        }
      }
      remainingCount += pending.length - index;
      break;
    }

    await markNativeCredentialSaveSynced(metadata.id, authorization).catch(() => {});
    knownItemIds.add(item.id);
    if (matchingIndex >= 0) currentItems[matchingIndex] = item;
    else currentItems.push(item);
    changedItems.push(item);
    syncedCount += 1;
  }

  return { changedItems, syncedCount, remainingCount };
}

function targetsMatch(left: string, right: string): boolean {
  const leftTarget = canonicalTarget(left);
  const rightTarget = canonicalTarget(right);
  return leftTarget !== null && leftTarget === rightTarget;
}

function canonicalTarget(value: string): string | null {
  const input = normalizeLoginUriForStorage(value);
  if (isAndroidAppUri(input)) return input.toLowerCase();
  try {
    const uri = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `https://${input}`);
    if (uri.protocol !== 'https:' && uri.protocol !== 'http:') return null;
    return uri.hostname.toLowerCase();
  } catch {
    return null;
  }
}
