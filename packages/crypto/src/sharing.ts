/**
 * Folder key management and share link crypto.
 * Per-folder AES-256 key, RSA-OAEP wrapped per member.
 * Share links use HKDF to derive encKey + authToken + shareId from a single secret.
 */

import { rsaEncrypt, rsaDecrypt } from './rsa.js';
import { encryptString, decryptString } from './encryption.js';
import { toUtf8 } from './utils.js';

// ─── Folder Keys ────────────────────────────────────────────────

/** Generate a random 32-byte AES folder key. */
export function generateFolderKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

/** Wrap a folder key with an RSA public key (one copy per team member). */
export async function wrapFolderKey(folderKey: Uint8Array, publicKey: CryptoKey): Promise<string> {
  return rsaEncrypt(folderKey, publicKey);
}

/** Unwrap a folder key with the user's RSA private key. */
export async function unwrapFolderKey(
  encryptedFolderKey: string,
  privateKey: CryptoKey
): Promise<Uint8Array> {
  return rsaDecrypt(encryptedFolderKey, privateKey);
}

// ─── Shared Item Encryption ─────────────────────────────────────

/** Encrypt data for a shared folder using the folder key. AAD = utf8(itemId:revisionDate). */
export async function encryptSharedItem(
  plaintext: string,
  folderKey: Uint8Array,
  itemId: string,
  revisionDate: string
): Promise<string> {
  const aad = toUtf8(`${itemId}:${revisionDate}`);
  return encryptString(plaintext, folderKey, aad);
}

/** Decrypt data from a shared folder using the folder key. */
export async function decryptSharedItem(
  ciphertext: string,
  folderKey: Uint8Array,
  itemId: string,
  revisionDate: string
): Promise<string> {
  const aad = toUtf8(`${itemId}:${revisionDate}`);
  return decryptString(ciphertext, folderKey, aad);
}

// ─── Share Links ────────────────────────────────────────────────

/** Generate a 32-byte random share secret. */
export function generateShareSecret(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

/** Derive encKey (32B), authToken (16B), and shareId (hex) from a share secret via HKDF. */
export async function deriveShareComponents(secret: Uint8Array): Promise<{
  encKey: Uint8Array;
  authToken: Uint8Array;
  shareId: string;
}> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    secret as Uint8Array<ArrayBuffer>,
    'HKDF',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32) as Uint8Array<ArrayBuffer>,
      info: new TextEncoder().encode('lockbox-share-link-v1') as Uint8Array<ArrayBuffer>,
    },
    keyMaterial,
    (32 + 16 + 16) * 8
  );
  const derived = new Uint8Array(bits);
  const encKey = derived.slice(0, 32);
  const authToken = derived.slice(32, 48);
  const shareIdBytes = derived.slice(48, 64);
  const shareId = Array.from(shareIdBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return { encKey, authToken, shareId };
}

/** Encrypt an item for a share link. Uses encKey with shareId as AAD context. */
export async function encryptForShareLink(
  plaintext: string,
  encKey: Uint8Array,
  shareId: string
): Promise<string> {
  const aad = toUtf8(`${shareId}:share-link`);
  return encryptString(plaintext, encKey, aad);
}

/** Decrypt an item from a share link. */
export async function decryptFromShareLink(
  ciphertext: string,
  encKey: Uint8Array,
  shareId: string
): Promise<string> {
  const aad = toUtf8(`${shareId}:share-link`);
  return decryptString(ciphertext, encKey, aad);
}

/** Hash an auth token for server-side storage (SHA-256, hex). */
export async function hashShareToken(authToken: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', authToken as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Base64url-encode a share secret for URL fragments. */
export function encodeShareSecret(secret: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < secret.length; i++) binary += String.fromCharCode(secret[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Base64url-decode a share secret from URL fragments. */
export function decodeShareSecret(encoded: string): Uint8Array {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
