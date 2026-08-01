import type { VaultItem } from '@lockbox/types';
import type { IconName } from '@lockbox/design';

export type Tab = 'site' | 'vault' | 'more';

export type ViewState =
  | { view: 'tabs' }
  | { view: 'detail'; item: VaultItem }
  | { view: 'add' }
  | { view: 'edit'; item: VaultItem }
  | { view: 'health'; filterBreached?: boolean }
  | { view: 'trash' }
  | { view: 'settings' }
  | { view: 'history'; item: VaultItem };

export async function sendMessage<T>(message: object): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

export async function refreshItemFromServer(itemId: string): Promise<VaultItem> {
  const response = await sendMessage<{
    success: boolean;
    item?: VaultItem;
    error?: string;
  }>({ type: 'refresh-item', itemId });
  if (!response.success || !response.item) {
    throw new Error(response.error || 'Could not refresh this item.');
  }
  return response.item;
}

export const typeIcon = (type: string): IconName =>
  ({
    login: 'key',
    note: 'note',
    card: 'credit-card',
    identity: 'id',
    passkey: 'fingerprint',
    document: 'file-description',
  } satisfies Record<string, IconName>)[type] ?? 'file';

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
