/**
 * Vault item types for the lockbox password manager.
 * All vault items are encrypted on the client before transmission to the server.
 */
/** Vault item type discriminant */
export type VaultItemType = 'login' | 'note' | 'card';
/**
 * Base vault item with common fields.
 * All vault items extend this type.
 */
export interface VaultItem {
    id: string;
    type: VaultItemType;
    name: string;
    folderId?: string;
    tags: string[];
    favorite: boolean;
    createdAt: string;
    updatedAt: string;
    revisionDate: string;
}
/**
 * Login credential item.
 * Stores username, password, URIs, and optional TOTP secret.
 */
export interface LoginItem extends VaultItem {
    type: 'login';
    username: string;
    password: string;
    uris: string[];
    totp?: string;
}
/**
 * Secure note item.
 * Stores arbitrary encrypted text content.
 */
export interface SecureNoteItem extends VaultItem {
    type: 'note';
    content: string;
}
/**
 * Payment card item.
 * Stores credit/debit card information.
 */
export interface CardItem extends VaultItem {
    type: 'card';
    cardholderName: string;
    number: string;
    expMonth: string;
    expYear: string;
    cvv: string;
    brand?: string;
}
/**
 * Encrypted vault item as stored on the server.
 * The server never decrypts encryptedData — it's an opaque blob.
 * AAD binding uses: itemId + revisionDate
 */
export interface EncryptedVaultItem {
    id: string;
    type: VaultItemType;
    encryptedData: string;
    iv: string;
    revisionDate: string;
    folderId?: string;
    tags: string[];
    favorite: boolean;
}
/**
 * Folder for organizing vault items.
 * Supports nested folder hierarchies via parentId.
 */
export interface Folder {
    id: string;
    name: string;
    parentId?: string;
    createdAt: string;
}
//# sourceMappingURL=vault.d.ts.map