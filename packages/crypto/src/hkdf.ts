/**
 * HKDF-SHA-256 sub-key derivation using native WebCrypto API.
 * RFC 5869 compliant.
 */

import { toUtf8 } from './utils.js';

/**
 * Derive a sub-key from a master key using HKDF-SHA-256.
 * @param masterKey - The input key material (32 bytes recommended)
 * @param info - Context string to bind the derived key to its purpose
 * @param length - Output key length in bytes (default: 32)
 * @param salt - Optional salt (defaults to zero-filled bytes of hash length)
 */
export async function deriveSubKey(
  masterKey: Uint8Array,
  info: string,
  length = 32,
  salt?: Uint8Array,
): Promise<Uint8Array> {
  const ikm = await crypto.subtle.importKey('raw', masterKey as Uint8Array<ArrayBuffer>, { name: 'HKDF' }, false, [
    'deriveBits',
  ]);

  const infoBytes = toUtf8(info);
  const saltBytes = salt ?? new Uint8Array(32); // default: 32 zero bytes

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: saltBytes as Uint8Array<ArrayBuffer>,
      info: infoBytes as Uint8Array<ArrayBuffer>,
    },
    ikm,
    length * 8,
  );

  return new Uint8Array(derivedBits);
}
