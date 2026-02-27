/**
 * Crypto helpers for Lockbox CLI.
 * Thin wrappers that reuse @lockbox/crypto.
 */

import type { KdfConfig } from '@lockbox/types';
import {
  deriveKey,
  makeAuthHash,
  fromBase64,
  decryptUserKey,
  decryptString,
  toUtf8,
} from '@lockbox/crypto';
import { createApi } from './api.js';

/**
 * Derive keys from a master password.
 * Fetches KDF params from API, derives master key via Argon2id,
 * then computes the auth hash for server verification.
 */
export async function deriveKeysFromPassword(
  password: string,
  email: string,
  apiUrl: string
): Promise<{
  masterKey: Uint8Array;
  authHash: string;
  kdfConfig: KdfConfig;
  salt: string;
}> {
  const api = createApi(apiUrl);
  const { kdfConfig, salt } = await api.auth.kdfParams(email);

  const saltBytes = fromBase64(salt);
  const masterKey = await deriveKey(password, saltBytes, kdfConfig);
  const authHash = await makeAuthHash(masterKey, password);

  return { masterKey, authHash, kdfConfig, salt };
}

/**
 * Decrypt the user key from an encrypted user key string using the master key.
 */
export async function decryptUserKeyFromMaster(
  encryptedUserKey: string,
  masterKey: Uint8Array
): Promise<Uint8Array> {
  return decryptUserKey(encryptedUserKey, masterKey);
}

/**
 * Decrypt an encrypted vault item's data field.
 * Returns the parsed JSON content of the vault item.
 */
export async function decryptVaultItem(
  encryptedData: string,
  userKey: Uint8Array,
  itemId: string,
  revisionDate: string
): Promise<Record<string, unknown>> {
  const aad = toUtf8(`${itemId}:${revisionDate}`);
  const aesKey = userKey.slice(0, 32);
  const plaintext = await decryptString(encryptedData, aesKey, aad);
  return JSON.parse(plaintext) as Record<string, unknown>;
}
