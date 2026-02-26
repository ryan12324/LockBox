/**
 * @lockbox/crypto — Zero-knowledge cryptographic primitives for lockbox.
 *
 * Security model:
 * - AES-256-GCM with AAD binding (prevents ciphertext transplant attacks)
 * - Master Password → Argon2id → Master Key → User Key indirection
 * - All operations use native WebCrypto API
 * - Server NEVER sees plaintext vault data
 */
export * from './utils.js';
export * from './encryption.js';
export * from './hkdf.js';
export * from './kdf.js';
export * from './keys.js';
export * from './breach.js';
//# sourceMappingURL=index.js.map