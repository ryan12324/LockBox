/**
 * ECDH P-256 key exchange for ephemeral device sync channels.
 * Derives a shared AES-256-GCM key via ECDH + HKDF for QR-based pairing.
 */

import { toBase64, fromBase64 } from './utils.js';

const IV_LENGTH = 12; // 96 bits

/**
 * Generate an ECDH P-256 key pair.
 * Returns both keys as base64-encoded SPKI (public) and PKCS8 (private).
 */
export async function generateEcdhKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
  const keyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ]);

  const publicKeyBuf = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const privateKeyBuf = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

  return {
    publicKey: toBase64(new Uint8Array(publicKeyBuf)),
    privateKey: toBase64(new Uint8Array(privateKeyBuf)),
  };
}

/**
 * Derive a shared AES-256 key from an ECDH key exchange.
 * Performs ECDH deriveBits → HKDF-SHA-256 to produce a 256-bit AES key.
 * @param privateKeyB64 - Base64-encoded PKCS8 private key
 * @param publicKeyB64 - Base64-encoded SPKI public key of the peer
 * @returns 32-byte shared secret suitable for AES-256-GCM
 */
export async function deriveSharedSecret(
  privateKeyB64: string,
  publicKeyB64: string
): Promise<Uint8Array> {
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    fromBase64(privateKeyB64) as Uint8Array<ArrayBuffer>,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits']
  );

  const publicKey = await crypto.subtle.importKey(
    'spki',
    fromBase64(publicKeyB64) as Uint8Array<ArrayBuffer>,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  // ECDH → 256 raw shared bits
  const rawBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: publicKey },
    privateKey,
    256
  );

  // HKDF stretch into a proper AES-256 key
  const ikm = await crypto.subtle.importKey('raw', rawBits, { name: 'HKDF' }, false, [
    'deriveBits',
  ]);

  const info = new TextEncoder().encode('lockbox-device-sync');
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32) as Uint8Array<ArrayBuffer>,
      info: info as Uint8Array<ArrayBuffer>,
    },
    ikm,
    256
  );

  return new Uint8Array(derivedBits);
}

/**
 * Encrypt data with a shared secret using AES-256-GCM.
 * Returns the project-standard format: `base64(iv).base64(ciphertext+tag)`
 */
export async function encryptWithSharedSecret(
  data: Uint8Array,
  sharedSecret: Uint8Array
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const key = await crypto.subtle.importKey(
    'raw',
    sharedSecret as Uint8Array<ArrayBuffer>,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as Uint8Array<ArrayBuffer> },
    key,
    data as Uint8Array<ArrayBuffer>
  );

  return `${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`;
}

/**
 * Decrypt data encrypted by `encryptWithSharedSecret`.
 * Expects format: `base64(iv).base64(ciphertext+tag)`
 */
export async function decryptWithSharedSecret(
  encrypted: string,
  sharedSecret: Uint8Array
): Promise<Uint8Array> {
  const dotIndex = encrypted.indexOf('.');
  if (dotIndex === -1) throw new Error('Invalid encrypted string format: missing "."');

  const iv = fromBase64(encrypted.slice(0, dotIndex));
  const ciphertext = fromBase64(encrypted.slice(dotIndex + 1));

  const key = await crypto.subtle.importKey(
    'raw',
    sharedSecret as Uint8Array<ArrayBuffer>,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as Uint8Array<ArrayBuffer> },
    key,
    ciphertext as Uint8Array<ArrayBuffer>
  );

  return new Uint8Array(plaintext);
}
