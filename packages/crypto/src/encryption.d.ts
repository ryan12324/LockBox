/**
 * AES-256-GCM encryption/decryption using native WebCrypto API.
 * All operations use a fresh random 96-bit IV per encryption.
 * AAD (Additional Authenticated Data) binding is supported and recommended:
 * callers should pass `itemId + revisionDate` as AAD to prevent ciphertext transplant attacks.
 */
/**
 * Encrypt plaintext bytes with AES-256-GCM.
 * Returns ciphertext (with 16-byte auth tag appended by WebCrypto) and the IV used.
 */
export declare function encrypt(plaintext: Uint8Array, key: Uint8Array, aad?: Uint8Array): Promise<{
    ciphertext: Uint8Array;
    iv: Uint8Array;
}>;
/**
 * Decrypt AES-256-GCM ciphertext (with auth tag appended).
 * Throws if authentication fails (wrong key, wrong AAD, or tampered ciphertext).
 */
export declare function decrypt(ciphertext: Uint8Array, key: Uint8Array, iv: Uint8Array, aad?: Uint8Array): Promise<Uint8Array>;
/**
 * Encrypt a UTF-8 string and return a compact string representation.
 * Format: `base64(iv).base64(ciphertext+tag)`
 * AAD is recommended: pass `itemId + revisionDate` to bind ciphertext to its context.
 */
export declare function encryptString(plaintext: string, key: Uint8Array, aad?: Uint8Array): Promise<string>;
/**
 * Decrypt a string produced by `encryptString`.
 * Throws if authentication fails.
 */
export declare function decryptString(encrypted: string, key: Uint8Array, aad?: Uint8Array): Promise<string>;
//# sourceMappingURL=encryption.d.ts.map