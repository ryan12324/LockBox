import type { VaultItem } from '@lockbox/types';

export type Tab = 'site' | 'vault' | 'shared' | 'generator' | 'totp';

export type ViewState =
  | { view: 'tabs' }
  | { view: 'detail'; item: VaultItem }
  | { view: 'add' }
  | { view: 'edit'; item: VaultItem }
  | { view: 'health'; filterBreached?: boolean }
  | { view: 'ai-settings' }
  | { view: 'chat' }
  | { view: 'hw-keys' }
  | { view: 'qr-sync' }
  | { view: 'trash' }
  | { view: 'settings' }
  | { view: 'emergency' }
  | { view: 'history'; item: VaultItem };

export async function sendMessage<T>(message: object): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

export const typeIcon = (type: string) =>
  ({ login: '🔑', note: '📝', card: '💳', identity: '📛', passkey: '🔑', document: '📄' })[type] ??
  '📄';

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
