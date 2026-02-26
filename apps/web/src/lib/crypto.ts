/**
 * Vault item encryption/decryption helpers.
 * Wraps @lockbox/crypto for vault-specific use cases.
 * AAD = itemId + revisionDate (prevents ciphertext transplant attacks).
 */

import { encryptString, decryptString, toUtf8 } from '@lockbox/crypto';
import type { VaultItem } from '@lockbox/types';

/**
 * Encrypt a vault item's data for server storage.
 * Returns an opaque base64 string.
 */
export async function encryptVaultItem(
  item: VaultItem,
  userKey: Uint8Array,
  itemId: string,
  revisionDate: string,
): Promise<string> {
  const plaintext = JSON.stringify(item);
  const aad = toUtf8(`${itemId}:${revisionDate}`);
  return encryptString(plaintext, userKey.slice(0, 32), aad);
}

/**
 * Decrypt a vault item from server storage.
 * Throws if authentication fails (wrong key, wrong AAD, or tampered data).
 */
export async function decryptVaultItem(
  encryptedData: string,
  userKey: Uint8Array,
  itemId: string,
  revisionDate: string,
): Promise<VaultItem> {
  const aad = toUtf8(`${itemId}:${revisionDate}`);
  const plaintext = await decryptString(encryptedData, userKey.slice(0, 32), aad);
  return JSON.parse(plaintext) as VaultItem;
}
