/**
 * API request and response types for the lockbox backend.
 */

import type { EncryptedVaultItem, Folder, VaultItemType } from './vault';
import type { KdfConfig } from './crypto';

/**
 * User registration request.
 * Client sends the auth hash (derived from master key) and encrypted user key.
 * Server never sees the master password or master key.
 */
export interface RegisterRequest {
  email: string;
  authHash: string; // Base64-encoded PBKDF2(masterKey, password, 1)
  encryptedUserKey: string; // Base64-encoded AES-256-GCM encrypted user key
  kdfConfig: KdfConfig; // KDF parameters used to derive master key
  salt: string; // Base64-encoded salt for KDF
}

/**
 * User login request.
 * Client sends email and auth hash.
 * Server verifies auth hash against stored Argon2id hash.
 */
export interface LoginRequest {
  email: string;
  authHash: string; // Base64-encoded PBKDF2(masterKey, password, 1)
}

/**
 * User login response.
 * Server returns session token and user data needed for client-side decryption.
 */
export interface LoginResponse {
  token: string; // Session token for Authorization header
  user: {
    id: string;
    email: string;
    kdfConfig: KdfConfig;
    salt: string; // Base64-encoded
    encryptedUserKey: string; // Base64-encoded — client decrypts with master key
  };
}

/**
 * Vault sync request.
 * Client sends last known server timestamp to request delta changes.
 */
export interface SyncRequest {
  lastSyncTimestamp?: string; // ISO 8601 — if omitted, full sync
}

/**
 * Vault sync response.
 * Server returns delta changes: added items, modified items, deleted item IDs.
 */
export interface SyncResponse {
  added: EncryptedVaultItem[];
  modified: EncryptedVaultItem[];
  deleted: string[]; // Item IDs that were deleted
  folders: Folder[];
  serverTimestamp: string; // ISO 8601 — client stores for next sync
}

/**
 * Vault item creation request.
 * Client sends encrypted data and metadata.
 */
export interface VaultItemCreateRequest {
  type: VaultItemType;
  encryptedData: string; // Base64-encoded AES-256-GCM ciphertext
  iv: string; // Base64-encoded 96-bit IV
  folderId?: string;
  tags?: string[];
  favorite?: boolean;
}

/**
 * Vault item update request.
 * Client sends updated encrypted data and metadata.
 */
export interface VaultItemUpdateRequest {
  encryptedData: string; // Base64-encoded AES-256-GCM ciphertext
  iv: string; // Base64-encoded 96-bit IV
  folderId?: string;
  tags?: string[];
  favorite?: boolean;
}

/**
 * Password change request.
 * Client sends current auth hash and new auth hash with new encrypted user key.
 * Server verifies current auth hash, then updates user record.
 */
export interface ChangePasswordRequest {
  currentAuthHash: string; // Base64-encoded PBKDF2(masterKey, password, 1)
  newAuthHash: string; // Base64-encoded PBKDF2(newMasterKey, newPassword, 1)
  newEncryptedUserKey: string; // Base64-encoded AES-256-GCM encrypted new user key
  newKdfConfig: KdfConfig;
  newSalt: string; // Base64-encoded
}
