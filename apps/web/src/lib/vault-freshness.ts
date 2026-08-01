import type { EncryptedVaultItem, VaultItem } from '@lockbox/types';
import { api } from './api.js';
import { decryptVaultItem } from './crypto.js';

export function validateFreshVaultItem(
  itemId: string,
  encryptedItem: EncryptedVaultItem,
  decryptedItem: VaultItem
): VaultItem {
  if (encryptedItem.deletedAt) throw new Error('This vault item was deleted on the server.');
  if (
    encryptedItem.id !== itemId ||
    decryptedItem.id !== encryptedItem.id ||
    decryptedItem.type !== encryptedItem.type ||
    decryptedItem.revisionDate !== encryptedItem.revisionDate
  ) {
    throw new Error('The latest vault item did not match its server metadata.');
  }
  return decryptedItem;
}

/** Fetch and decrypt one item without ever falling back to a cached plaintext. */
export async function fetchFreshVaultItem(
  itemId: string,
  token: string,
  userKey: Uint8Array
): Promise<VaultItem> {
  const { item: encryptedItem } = await api.vault.getItem(itemId, token);
  if (encryptedItem.deletedAt) throw new Error('This vault item was deleted on the server.');
  const decryptedItem = await decryptVaultItem(
    encryptedItem.encryptedData,
    userKey,
    encryptedItem.id,
    encryptedItem.revisionDate
  );
  return validateFreshVaultItem(itemId, encryptedItem, decryptedItem);
}
