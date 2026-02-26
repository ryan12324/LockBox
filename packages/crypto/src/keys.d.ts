/**
 * Key management following the Bitwarden model:
 * Master Password → Argon2id → Master Key (32 bytes)
 *   → encryptUserKey(userKey, masterKey) → EncryptedUserKey (stored on server)
 *   → makeAuthHash(masterKey, password) → AuthHash (sent to server for verification)
 *
 * User Key (64 bytes) is the actual vault encryption key.
 * Master Key is derived fresh on each login and never stored.
 */
/**
 * Generate a new random User Key (64 bytes).
 * This key encrypts/decrypts all vault items.
 * Generated once at registration; re-used across password changes.
 */
export declare function generateUserKey(): Uint8Array;
/**
 * Encrypt the User Key with the Master Key for server storage.
 * Returns a compact string: `base64(iv).base64(ciphertext+tag)`
 * The Master Key is used as the AES-256-GCM encryption key.
 */
export declare function encryptUserKey(userKey: Uint8Array, masterKey: Uint8Array): Promise<string>;
/**
 * Decrypt the User Key using the Master Key.
 * Reverses `encryptUserKey`.
 */
export declare function decryptUserKey(encryptedUserKey: string, masterKey: Uint8Array): Promise<Uint8Array>;
/**
 * Derive the authentication hash sent to the server during login/registration.
 * Uses one additional PBKDF2 iteration: PBKDF2(base64(masterKey), password, 1)
 * The server stores this hash and verifies it — it NEVER sees the master key itself.
 *
 * Security note: The server cannot derive the master key from the auth hash
 * because the hash is derived FROM the master key (not the password directly).
 */
export declare function makeAuthHash(masterKey: Uint8Array, password: string): Promise<string>;
/**
 * Generate a random recovery key for the emergency kit.
 * Returns a base32-encoded 256-bit (32-byte) random key.
 * Formatted in groups of 4 characters separated by dashes for readability.
 */
export declare function generateRecoveryKey(): string;
//# sourceMappingURL=keys.d.ts.map