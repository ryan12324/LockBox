import type { LoginItem, VaultItem } from '@lockbox/types';
import type { ImportDuplicate, ImportRecord } from './types.js';

function normalizeText(value: string | undefined): string {
  return (value ?? '').normalize('NFKC').trim().toLocaleLowerCase();
}

function normalizeUri(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname === '/') url.pathname = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return normalizeText(trimmed).replace(/\/$/, '');
  }
}

export function vaultItemFingerprint(item: VaultItem): string {
  if (item.type === 'login') {
    const login = item as LoginItem;
    return [
      'login',
      normalizeText(item.name),
      normalizeText(login.username),
      normalizeUri(login.uris[0]),
    ].join('\u001f');
  }
  return [item.type, normalizeText(item.name)].join('\u001f');
}

/** Finds existing-vault and within-file duplicates without inspecting passwords. */
export function findImportDuplicates(
  records: readonly ImportRecord[],
  existingItems: readonly VaultItem[],
): ImportDuplicate[] {
  const existingByFingerprint = new Map<string, string>();
  for (const item of existingItems) {
    // Secure notes do not expose enough non-secret identity data for a safe
    // automatic match. Importing an extra copy is preferable to skipping a
    // distinct note that happens to share a name.
    if (item.type !== 'login') continue;
    existingByFingerprint.set(vaultItemFingerprint(item), item.id);
  }

  const firstSourceByFingerprint = new Map<string, string>();
  const duplicates: ImportDuplicate[] = [];
  for (const record of records) {
    if (record.item.type !== 'login') continue;
    const fingerprint = vaultItemFingerprint(record.item);
    const existingItemId = existingByFingerprint.get(fingerprint);
    const duplicateSourceId = firstSourceByFingerprint.get(fingerprint);
    if (existingItemId || duplicateSourceId) {
      duplicates.push({ sourceId: record.sourceId, existingItemId, duplicateSourceId });
    } else {
      firstSourceByFingerprint.set(fingerprint, record.sourceId);
    }
  }
  return duplicates;
}
