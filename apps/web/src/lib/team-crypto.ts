/**
 * Client-side crypto helpers for team sharing and share links.
 * Wraps @lockbox/crypto primitives for use in the web vault.
 */

import {
  generateRsaKeyPair,
  encryptPrivateKey,
  decryptPrivateKey,
  importPublicKey,
  generateFolderKey,
  wrapFolderKey,
  unwrapFolderKey,
  encryptSharedItem,
  decryptSharedItem,
  generateShareSecret,
  deriveShareComponents,
  encryptForShareLink,
  decryptFromShareLink,
  hashShareToken,
  encodeShareSecret,
  decodeShareSecret,
} from '@lockbox/crypto';
import type { VaultItem } from '@lockbox/types';

// ─── RSA Key Pair Management ───────────────────────────────────

/**
 * Generate and encrypt an RSA key pair for E2EE sharing.
 * Returns the public key as JWK JSON string and the encrypted private key.
 */
export async function createKeyPair(userKey: Uint8Array): Promise<{
  publicKey: string;
  encryptedPrivateKey: string;
}> {
  const { publicKey, privateKey } = await generateRsaKeyPair();
  const encryptedPrivateKey = await encryptPrivateKey(privateKey, userKey);
  return {
    publicKey: JSON.stringify(publicKey),
    encryptedPrivateKey,
  };
}

/**
 * Decrypt the user's RSA private key from server storage.
 */
export async function unlockPrivateKey(
  encryptedPrivateKey: string,
  userKey: Uint8Array
): Promise<CryptoKey> {
  return decryptPrivateKey(encryptedPrivateKey, userKey);
}

/**
 * Import a team member's public key for encrypting folder keys.
 */
export async function loadPublicKey(publicKeyJson: string): Promise<CryptoKey> {
  const jwk: JsonWebKey = JSON.parse(publicKeyJson);
  return importPublicKey(jwk);
}

// ─── Folder Key Management ─────────────────────────────────────

/**
 * Create a new folder key and wrap it for each team member.
 * Returns the raw folder key and wrapped copies for each member.
 */
export async function createFolderKeyForMembers(
  memberPublicKeys: Array<{ userId: string; publicKey: CryptoKey }>
): Promise<{
  folderKey: Uint8Array;
  memberKeys: Array<{ userId: string; encryptedFolderKey: string }>;
}> {
  const folderKey = generateFolderKey();
  const memberKeys = await Promise.all(
    memberPublicKeys.map(async ({ userId, publicKey }) => ({
      userId,
      encryptedFolderKey: await wrapFolderKey(folderKey, publicKey),
    }))
  );
  return { folderKey, memberKeys };
}

/**
 * Decrypt a folder key using the user's RSA private key.
 */
export async function decryptFolderKey(
  encryptedFolderKey: string,
  privateKey: CryptoKey
): Promise<Uint8Array> {
  return unwrapFolderKey(encryptedFolderKey, privateKey);
}

// ─── Shared Item Encryption ────────────────────────────────────

/**
 * Encrypt a vault item for a shared folder.
 * Uses the folder key with AAD binding: utf8(itemId:revisionDate).
 */
export async function encryptItemForFolder(
  item: VaultItem,
  folderKey: Uint8Array,
  itemId: string,
  revisionDate: string
): Promise<string> {
  return encryptSharedItem(JSON.stringify(item), folderKey, itemId, revisionDate);
}

/**
 * Decrypt a vault item from a shared folder.
 */
export async function decryptFolderItem(
  encryptedData: string,
  folderKey: Uint8Array,
  itemId: string,
  revisionDate: string
): Promise<VaultItem> {
  const json = await decryptSharedItem(encryptedData, folderKey, itemId, revisionDate);
  return JSON.parse(json) as VaultItem;
}

// ─── Share Link Helpers ────────────────────────────────────────

/**
 * Create a share link: generate secret, derive components, encrypt item.
 * Returns everything needed to create the link on the server and build the URL.
 */
export async function createShareLink(
  item: VaultItem,
  itemName: string
): Promise<{
  shareId: string;
  encryptedItem: string;
  tokenHash: string;
  shareUrl: string;
  shareSecret: string;
}> {
  void itemName; // reserved for future use (e.g. share link metadata)
  const secret = generateShareSecret();
  const { encKey, authToken, shareId } = await deriveShareComponents(secret);
  const encryptedItem = await encryptForShareLink(JSON.stringify(item), encKey, shareId);
  const tokenHash = await hashShareToken(authToken);
  const encodedSecret = encodeShareSecret(secret);

  return {
    shareId,
    encryptedItem,
    tokenHash,
    shareUrl: `/share/${shareId}#${encodedSecret}`,
    shareSecret: encodedSecret,
  };
}

/**
 * Redeem a share link: decode secret from URL fragment, derive components, decrypt item.
 */
export async function redeemShareLink(
  encodedSecret: string,
  encryptedItem: string,
  shareId: string
): Promise<VaultItem> {
  const secret = decodeShareSecret(encodedSecret);
  const { encKey } = await deriveShareComponents(secret);
  const json = await decryptFromShareLink(encryptedItem, encKey, shareId);
  return JSON.parse(json) as VaultItem;
}

/**
 * Derive auth token from share secret for API authentication.
 * Returns base64-encoded token for Bearer header.
 */
export async function getShareAuthToken(encodedSecret: string): Promise<string> {
  const secret = decodeShareSecret(encodedSecret);
  const { authToken } = await deriveShareComponents(secret);
  let binary = '';
  for (let i = 0; i < authToken.length; i++) binary += String.fromCharCode(authToken[i]);
  return btoa(binary);
}
