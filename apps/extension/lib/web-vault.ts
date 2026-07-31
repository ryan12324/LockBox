import { getWebBaseUrl } from './storage.js';

const WEB_VAULT_UNAVAILABLE =
  'Your web vault address is unavailable. Reconnect the extension and try again.';

export function buildWebVaultUrl(webBaseUrl: string, path: string): string {
  if (!webBaseUrl) throw new Error(WEB_VAULT_UNAVAILABLE);
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error('Lockbox could not open that web vault page.');
  }

  try {
    const base = new URL(webBaseUrl);
    const destination = new URL(path, `${base.origin}/`);

    if (destination.origin !== base.origin) {
      throw new Error('Unexpected web vault origin.');
    }

    return destination.toString();
  } catch {
    throw new Error(WEB_VAULT_UNAVAILABLE);
  }
}

export async function openWebVault(path: string): Promise<void> {
  const webBaseUrl = await getWebBaseUrl();
  const url = buildWebVaultUrl(webBaseUrl, path);

  try {
    await chrome.tabs.create({ url });
  } catch {
    throw new Error('Lockbox could not open the web vault. Copy its address into a new tab.');
  }
}
