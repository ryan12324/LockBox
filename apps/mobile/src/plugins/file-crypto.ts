/**
 * File Crypto — AES-256-GCM encrypt/decrypt for file attachments.
 *
 * Ported from apps/web/src/lib/file-crypto.ts for mobile use.
 * Follows the lockbox AAD contract:
 *   - AAD = utf8(itemId:revisionDate)
 *   - encryptedData = base64(iv).base64(ciphertext+tag)
 *   - IV = 12 bytes (96 bits) of cryptographically random data
 *
 * Uses WebCrypto API (available in Capacitor WebView).
 * NEVER stores decrypted files in app storage.
 */

import { toBase64, fromBase64, toUtf8 } from '@lockbox/crypto';

/** IV length in bytes (96 bits for AES-GCM) */
const IV_LENGTH = 12;

/**
 * Encrypt a file buffer with AES-256-GCM.
 * Returns base64(iv).base64(ciphertext+tag) format matching the lockbox encryptedData contract.
 *
 * @param data - Raw file bytes to encrypt
 * @param key - 256-bit AES key (raw bytes or CryptoKey)
 * @param aad - Additional authenticated data (typically "itemId:revisionDate")
 */
export async function encryptFile(
  data: ArrayBuffer,
  key: Uint8Array | CryptoKey,
  aad: string
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  let cryptoKey: CryptoKey;

  if (key instanceof CryptoKey) {
    cryptoKey = key;
  } else {
    cryptoKey = await crypto.subtle.importKey('raw', key.slice(0, 32), { name: 'AES-GCM' }, false, [
      'encrypt',
    ]);
  }

  const aadBytes = toUtf8(aad);

  const ciphertextBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: new Uint8Array(aadBytes),
    },
    cryptoKey,
    data
  );

  const ciphertext = new Uint8Array(ciphertextBuffer);
  return `${toBase64(iv)}.${toBase64(ciphertext)}`;
}

/**
 * Decrypt a file buffer produced by `encryptFile`.
 * Parses base64(iv).base64(ciphertext+tag) format and returns raw plaintext bytes.
 *
 * @param encryptedData - Encrypted file in "base64(iv).base64(ciphertext+tag)" format
 * @param key - 256-bit AES key (raw bytes or CryptoKey)
 * @param aad - Additional authenticated data (must match what was used during encryption)
 */
export async function decryptFile(
  encryptedData: string,
  key: Uint8Array | CryptoKey,
  aad: string
): Promise<ArrayBuffer> {
  const dotIndex = encryptedData.indexOf('.');
  if (dotIndex === -1) throw new Error('Invalid encrypted file format: missing "."');

  const iv = fromBase64(encryptedData.slice(0, dotIndex));
  const ciphertext = fromBase64(encryptedData.slice(dotIndex + 1));
  const aadBytes = toUtf8(aad);

  let cryptoKey: CryptoKey;

  if (key instanceof CryptoKey) {
    cryptoKey = key;
  } else {
    cryptoKey = await crypto.subtle.importKey('raw', key.slice(0, 32), { name: 'AES-GCM' }, false, [
      'decrypt',
    ]);
  }

  const plaintextBuffer = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: new Uint8Array(iv),
      additionalData: new Uint8Array(aadBytes),
    },
    cryptoKey,
    new Uint8Array(ciphertext)
  );

  return plaintextBuffer;
}
