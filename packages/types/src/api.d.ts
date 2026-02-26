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
    authHash: string;
    encryptedUserKey: string;
    kdfConfig: KdfConfig;
    salt: string;
}
/**
 * User login request.
 * Client sends email and auth hash.
 * Server verifies auth hash against stored Argon2id hash.
 */
export interface LoginRequest {
    email: string;
    authHash: string;
}
/**
 * User login response.
 * Server returns session token and user data needed for client-side decryption.
 */
export interface LoginResponse {
    token: string;
    user: {
        id: string;
        email: string;
        kdfConfig: KdfConfig;
        salt: string;
        encryptedUserKey: string;
    };
}
/**
 * Vault sync request.
 * Client sends last known server timestamp to request delta changes.
 */
export interface SyncRequest {
    lastSyncTimestamp?: string;
}
/**
 * Vault sync response.
 * Server returns delta changes: added items, modified items, deleted item IDs.
 */
export interface SyncResponse {
    added: EncryptedVaultItem[];
    modified: EncryptedVaultItem[];
    deleted: string[];
    folders: Folder[];
    serverTimestamp: string;
}
/**
 * Vault item creation request.
 * Client sends encrypted data and metadata.
 */
export interface VaultItemCreateRequest {
    type: VaultItemType;
    encryptedData: string;
    iv: string;
    folderId?: string;
    tags?: string[];
    favorite?: boolean;
}
/**
 * Vault item update request.
 * Client sends updated encrypted data and metadata.
 */
export interface VaultItemUpdateRequest {
    encryptedData: string;
    iv: string;
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
    currentAuthHash: string;
    newAuthHash: string;
    newEncryptedUserKey: string;
    newKdfConfig: KdfConfig;
    newSalt: string;
}
//# sourceMappingURL=api.d.ts.map