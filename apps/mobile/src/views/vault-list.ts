/**
 * Vault list rendering utilities — icon mapping, subtitle generation,
 * and item processing for the mobile vault list view.
 *
 * Handles all VaultItemType variants including 'identity'.
 */

/** Vault item type discriminant (matches @lockbox/types VaultItemType) */
export type VaultItemType = 'login' | 'note' | 'card' | 'identity';

/** Icon identifiers for each vault item type */
export type VaultItemIcon = 'globe' | 'sticky-note' | 'credit-card' | 'id-card';

/** Processed vault list item ready for display */
export interface VaultListItem {
  id: string;
  name: string;
  type: VaultItemType;
  icon: VaultItemIcon;
  subtitle: string;
  favorite: boolean;
  folderId?: string;
  tags: string[];
}

/** Decrypted item data shape (post-decryption, pre-display) */
export interface DecryptedItemData {
  id: string;
  name: string;
  type: VaultItemType;
  favorite: boolean;
  folderId?: string;
  tags: string[];
  // Login fields
  username?: string;
  uris?: string[];
  // Note fields
  content?: string;
  // Card fields
  cardholderName?: string;
  number?: string;
  brand?: string;
  // Identity fields
  firstName?: string;
  middleName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
}

/**
 * Map a VaultItemType to its display icon identifier.
 * Identity items use 'id-card' to distinguish from login credentials.
 */
export function getItemIcon(type: VaultItemType): VaultItemIcon {
  switch (type) {
    case 'login':
      return 'globe';
    case 'note':
      return 'sticky-note';
    case 'card':
      return 'credit-card';
    case 'identity':
      return 'id-card';
  }
}

/**
 * Generate a human-readable subtitle for a vault list item.
 *
 * - login → username or first URI
 * - note → first 50 chars of content
 * - card → brand + masked last 4 digits
 * - identity → "firstName lastName" or email
 */
export function getItemSubtitle(item: DecryptedItemData): string {
  switch (item.type) {
    case 'login':
      return item.username ?? item.uris?.[0] ?? '';
    case 'note':
      return item.content ? item.content.slice(0, 50) + (item.content.length > 50 ? '…' : '') : '';
    case 'card': {
      const last4 = item.number ? `••••${item.number.slice(-4)}` : '';
      return item.brand ? `${item.brand} ${last4}` : last4;
    }
    case 'identity': {
      const fullName = buildIdentityName(item.firstName, item.middleName, item.lastName);
      return fullName || item.email || item.company || '';
    }
  }
}

/**
 * Build a display name from identity name parts.
 * Filters out undefined/empty parts and joins with spaces.
 */
export function buildIdentityName(
  firstName?: string,
  middleName?: string,
  lastName?: string
): string {
  return [firstName, middleName, lastName].filter(Boolean).join(' ');
}

/**
 * Process a decrypted item into a display-ready VaultListItem.
 */
export function toVaultListItem(item: DecryptedItemData): VaultListItem {
  return {
    id: item.id,
    name: item.name,
    type: item.type,
    icon: getItemIcon(item.type),
    subtitle: getItemSubtitle(item),
    favorite: item.favorite,
    folderId: item.folderId,
    tags: item.tags,
  };
}

/**
 * Process an array of decrypted items into display-ready VaultListItems.
 * Optionally filter by type.
 */
export function processVaultList(
  items: DecryptedItemData[],
  filterType?: VaultItemType
): VaultListItem[] {
  const filtered = filterType ? items.filter((i) => i.type === filterType) : items;
  return filtered.map(toVaultListItem);
}
