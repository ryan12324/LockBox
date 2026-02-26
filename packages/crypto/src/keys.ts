/**
 * Key management following the Bitwarden model:
 * Master Password → Argon2id → Master Key (32 bytes)
 *   → encryptUserKey(userKey, masterKey) → EncryptedUserKey (stored on server)
 *   → makeAuthHash(masterKey, password) → AuthHash (sent to server for verification)
 *
 * User Key (64 bytes) is the actual vault encryption key.
 * Master Key is derived fresh on each login and never stored.
 */

import { encryptString, decryptString } from './encryption.js';
import { toBase64, fromBase64, toUtf8 } from './utils.js';

/**
 * Generate a new random User Key (64 bytes).
 * This key encrypts/decrypts all vault items.
 * Generated once at registration; re-used across password changes.
 */
export function generateUserKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(64));
}

/**
 * Encrypt the User Key with the Master Key for server storage.
 * Returns a compact string: `base64(iv).base64(ciphertext+tag)`
 * The Master Key is used as the AES-256-GCM encryption key.
 */
export async function encryptUserKey(
  userKey: Uint8Array,
  masterKey: Uint8Array,
): Promise<string> {
  // Use only first 32 bytes of masterKey for AES-256 (masterKey may be 32 or 64 bytes)
  const aesKey = masterKey.slice(0, 32);
  return encryptString(toBase64(userKey), aesKey);
}

/**
 * Decrypt the User Key using the Master Key.
 * Reverses `encryptUserKey`.
 */
export async function decryptUserKey(
  encryptedUserKey: string,
  masterKey: Uint8Array,
): Promise<Uint8Array> {
  const aesKey = masterKey.slice(0, 32);
  const userKeyB64 = await decryptString(encryptedUserKey, aesKey);
  return fromBase64(userKeyB64);
}

/**
 * Derive the authentication hash sent to the server during login/registration.
 * Uses one additional PBKDF2 iteration: PBKDF2(base64(masterKey), password, 1)
 * The server stores this hash and verifies it — it NEVER sees the master key itself.
 *
 * Security note: The server cannot derive the master key from the auth hash
 * because the hash is derived FROM the master key (not the password directly).
 */
export async function makeAuthHash(
  masterKey: Uint8Array,
  password: string,
): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    toUtf8(toBase64(masterKey)) as Uint8Array<ArrayBuffer>,
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: toUtf8(password) as Uint8Array<ArrayBuffer>,
      iterations: 1,
    },
    keyMaterial,
    256,
  );

  return toBase64(new Uint8Array(derivedBits));
}

/**
 * Generate a random recovery key for the emergency kit.
 * Returns a base32-encoded 256-bit (32-byte) random key.
 * Formatted in groups of 4 characters separated by dashes for readability.
 */
export function generateRecoveryKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

  // Encode bytes to base32
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      output += base32Chars[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += base32Chars[(value << (5 - bits)) & 31];
  }

  // Format in groups of 4 separated by dashes (e.g. ABCD-EFGH-...)
  return output.match(/.{1,4}/g)?.join('-') ?? output;
}
