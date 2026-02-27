/**
 * Emergency access cryptographic helpers.
 * Wraps the grantor's encrypted userKey with the grantee's RSA public key
 * for secure emergency key recovery.
 */

import { importPublicKey, rsaEncrypt, rsaDecrypt } from './rsa.js';

/**
 * Encrypt the grantor's userKey with the grantee's RSA public key.
 * The result can only be decrypted by the grantee's private key.
 *
 * @param userKey - The grantor's raw userKey bytes
 * @param granteePublicKey - The grantee's RSA-OAEP public key (JWK)
 * @returns Base64-encoded RSA-OAEP ciphertext
 */
export async function wrapUserKeyForEmergency(
  userKey: Uint8Array,
  granteePublicKey: JsonWebKey
): Promise<string> {
  const publicKey = await importPublicKey(granteePublicKey);
  return rsaEncrypt(userKey, publicKey);
}

/**
 * Decrypt the grantor's userKey using the grantee's RSA private key.
 *
 * @param encryptedUserKey - Base64-encoded RSA-OAEP ciphertext from the grant
 * @param granteePrivateKey - The grantee's RSA-OAEP private key (CryptoKey)
 * @returns The grantor's raw userKey bytes
 */
export async function unwrapUserKeyFromEmergency(
  encryptedUserKey: string,
  granteePrivateKey: CryptoKey
): Promise<Uint8Array> {
  return rsaDecrypt(encryptedUserKey, granteePrivateKey);
}
