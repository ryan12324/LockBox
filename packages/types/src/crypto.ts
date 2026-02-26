/**
 * Cryptographic types for the lockbox password manager.
 * Follows the Bitwarden model: Master Password → Master Key → User Key indirection.
 */

/**
 * Key derivation function configuration.
 * Specifies which KDF algorithm and parameters to use.
 */
export interface KdfConfig {
  type: 'argon2id' | 'pbkdf2';
  iterations: number;
  memory?: number; // Argon2id only — memory in KiB
  parallelism?: number; // Argon2id only — parallelism factor
}

/**
 * Master key derived from master password.
 * 32 bytes (256 bits) of cryptographic material.
 * Never stored to disk — kept in memory only.
 * Used to:
 * 1. Derive auth hash (PBKDF2(masterKey, password, 1))
 * 2. Encrypt user key (AES-256-GCM)
 * 3. Derive sub-keys via HKDF
 */
export type MasterKey = Uint8Array;

/**
 * User key derived from master key.
 * 64 bytes (512 bits) of cryptographic material.
 * Used to encrypt/decrypt vault items.
 * Stored encrypted on server (encryptedUserKey).
 * Never stored to disk in plaintext — kept in memory only.
 */
export type UserKey = Uint8Array;

/**
 * Encrypted user key as stored on the server.
 * Base64-encoded AES-256-GCM ciphertext of the user key.
 * Encrypted with master key.
 * Client decrypts after login using master key.
 */
export type EncryptedUserKey = string;

/**
 * Derived key material from master key via HKDF.
 * Used for sub-key derivation (e.g., separate keys for different purposes).
 * 32 bytes (256 bits) of cryptographic material.
 */
export type DerivedKeyMaterial = Uint8Array;

/**
 * Emergency kit for password recovery.
 * Generated at registration and downloaded as PDF by user.
 * Contains recovery key that can restore vault access if master password is lost.
 */
export interface EmergencyKit {
  recoveryKey: string; // Base32-encoded 256-bit random key
  createdAt: string; // ISO 8601
  email: string;
}
