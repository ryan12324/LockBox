/**
 * RSA-OAEP key management for E2EE folder sharing.
 * Key pair is generated client-side; private key is AES-256-GCM encrypted with userKey.
 */

import { encryptString, decryptString } from './encryption.js';
import { toBase64, fromBase64, toUtf8 } from './utils.js';

/** Generate an RSA-OAEP-256 key pair for folder key wrapping. */
export async function generateRsaKeyPair(): Promise<{
  publicKey: JsonWebKey;
  privateKey: CryptoKey;
}> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt']
  );
  const publicKey = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  return { publicKey, privateKey: keyPair.privateKey };
}

/** Encrypt RSA private key with the user's AES key for server storage. */
export async function encryptPrivateKey(
  privateKey: CryptoKey,
  userKey: Uint8Array
): Promise<string> {
  const exported = await crypto.subtle.exportKey('pkcs8', privateKey);
  const plain = new Uint8Array(exported);
  // Base64-encode the raw PKCS8 bytes so encryptString can handle it as a string
  const b64 = toBase64(plain);
  const aad = toUtf8('rsa-private-key');
  return encryptString(b64, userKey.slice(0, 32), aad);
}

/** Decrypt RSA private key from server storage. */
export async function decryptPrivateKey(
  encryptedPrivateKey: string,
  userKey: Uint8Array
): Promise<CryptoKey> {
  const aad = toUtf8('rsa-private-key');
  const b64 = await decryptString(encryptedPrivateKey, userKey.slice(0, 32), aad);
  const bytes = fromBase64(b64);
  return crypto.subtle.importKey(
    'pkcs8',
    bytes as Uint8Array<ArrayBuffer>,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['decrypt']
  );
}

/** Import a public key from JWK for encrypting folder keys. */
export async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, [
    'encrypt',
  ]);
}

/** Wrap (encrypt) a folder key with an RSA public key. */
export async function rsaEncrypt(data: Uint8Array, publicKey: CryptoKey): Promise<string> {
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    publicKey,
    data as Uint8Array<ArrayBuffer>
  );
  return btoa(String.fromCharCode(...new Uint8Array(ciphertext)));
}

/** Unwrap (decrypt) a folder key with the user's RSA private key. */
export async function rsaDecrypt(
  base64Ciphertext: string,
  privateKey: CryptoKey
): Promise<Uint8Array> {
  const binary = atob(base64Ciphertext);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const plain = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    bytes as Uint8Array<ArrayBuffer>
  );
  return new Uint8Array(plain);
}
