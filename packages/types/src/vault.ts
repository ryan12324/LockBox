/**
 * Vault item types for the lockbox password manager.
 * All vault items are encrypted on the client before transmission to the server.
 */

/** Vault item type discriminant */
export type VaultItemType = 'login' | 'note' | 'card' | 'identity';

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
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  revisionDate: string; // ISO 8601 — used for delta sync and AAD binding
  customFields?: CustomField[];
}

/**
 * Login credential item.
 * Stores username, password, URIs, and optional TOTP secret.
 */
export interface LoginItem extends VaultItem {
  type: 'login';
  username: string;
  password: string;
  uris: string[]; // URLs where this credential applies
  totp?: string; // otpauth:// URI for TOTP generation
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
  number: string; // Full card number (encrypted on client)
  expMonth: string; // MM format
  expYear: string; // YYYY format
  cvv: string; // Card verification value (encrypted on client)
  brand?: string; // Visa, Mastercard, Amex, etc.
}

/**
 * Identity item for storing personal information.
 * Stores name, address, phone, and identification numbers.
 */
export interface IdentityItem extends VaultItem {
  type: 'identity';
  firstName?: string;
  middleName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  company?: string;
  ssn?: string;
  passportNumber?: string;
  licenseNumber?: string;
}

/**
 * Custom field attached to any vault item.
 * Stored inside encryptedData — never visible to server.
 */
export interface CustomField {
  name: string;
  value: string;
  type: 'text' | 'hidden' | 'boolean';
}

/**
 * Encrypted vault item as stored on the server.
 * The server never decrypts encryptedData — it's an opaque blob.
 * AAD binding uses: itemId + revisionDate
 */
export interface EncryptedVaultItem {
  id: string;
  type: VaultItemType;
  encryptedData: string; // Base64-encoded AES-256-GCM ciphertext
  iv: string; // Base64-encoded 96-bit IV
  revisionDate: string; // ISO 8601 — used for delta sync and AAD binding
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
  parentId?: string; // Parent folder ID for nested hierarchies
  createdAt: string; // ISO 8601
}
