/**
 * Type guard functions for vault items.
 * Use discriminant checking (type field) to narrow union types.
 */

import type { VaultItem, LoginItem, SecureNoteItem, CardItem } from './vault';

/**
 * Type guard to check if a vault item is a login item.
 * @param item - The vault item to check
 * @returns true if the item is a LoginItem
 */
export function isLoginItem(item: VaultItem): item is LoginItem {
  return item.type === 'login';
}

/**
 * Type guard to check if a vault item is a secure note item.
 * @param item - The vault item to check
 * @returns true if the item is a SecureNoteItem
 */
export function isSecureNoteItem(item: VaultItem): item is SecureNoteItem {
  return item.type === 'note';
}

/**
 * Type guard to check if a vault item is a card item.
 * @param item - The vault item to check
 * @returns true if the item is a CardItem
 */
export function isCardItem(item: VaultItem): item is CardItem {
  return item.type === 'card';
}
