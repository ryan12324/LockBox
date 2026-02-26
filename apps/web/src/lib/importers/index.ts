/**
 * Import format auto-detection and parsing.
 * Supports: Bitwarden, Chrome, Firefox, 1Password, LastPass, KeePass CSV formats.
 */

import type { LoginItem, VaultItem } from '@lockbox/types';

export type ImportFormat =
  | 'bitwarden'
  | 'chrome'
  | 'firefox'
  | 'onepassword'
  | 'lastpass'
  | 'keepass'
  | 'unknown';

/** Parse CSV text into rows (handles quoted fields with commas). */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.trim().split('\n');

  for (const line of lines) {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current);
    rows.push(fields);
  }

  return rows;
}

/** Detect import format from CSV headers. */
export function detectFormat(headers: string[]): ImportFormat {
  const h = headers.map((s) => s.toLowerCase().trim());

  if (h.includes('login_username') && h.includes('login_password')) return 'bitwarden';
  if (h.includes('username') && h.includes('password') && h.includes('url') && h.length <= 5)
    return 'chrome';
  if (h.includes('httpRealm') || h.includes('httprealm')) return 'firefox';
  if (h.includes('title') && h.includes('url') && h.includes('username') && h.includes('password') && h.length <= 6)
    return 'onepassword';
  if (h.includes('grouping') || h.includes('totp')) return 'lastpass';
  if (h.includes('username') && h.includes('title') && h.includes('group')) return 'keepass';

  return 'unknown';
}

function makeLoginItem(
  name: string,
  username: string,
  password: string,
  url?: string,
  totp?: string,
  notes?: string,
): LoginItem {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    type: 'login',
    name: name || 'Imported Item',
    username,
    password,
    uris: url ? [url] : [],
    totp,
    tags: [],
    favorite: false,
    createdAt: now,
    updatedAt: now,
    revisionDate: now,
  };
}

/** Parse Bitwarden CSV export. */
export function parseBitwarden(text: string): VaultItem[] {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.toLowerCase().trim());
  const idx = (name: string) => headers.indexOf(name);

  return rows.slice(1).map((row) => {
    const name = row[idx('name')] ?? '';
    const username = row[idx('login_username')] ?? '';
    const password = row[idx('login_password')] ?? '';
    const url = row[idx('login_uri')] ?? '';
    const totp = row[idx('login_totp')] ?? undefined;
    return makeLoginItem(name, username, password, url, totp || undefined);
  });
}

/** Parse Chrome CSV export. */
export function parseChrome(text: string): VaultItem[] {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.toLowerCase().trim());
  const idx = (name: string) => headers.indexOf(name);

  return rows.slice(1).map((row) => {
    const name = row[idx('name')] ?? '';
    const url = row[idx('url')] ?? '';
    const username = row[idx('username')] ?? '';
    const password = row[idx('password')] ?? '';
    return makeLoginItem(name || url, username, password, url);
  });
}

/** Parse Firefox CSV export. */
export function parseFirefox(text: string): VaultItem[] {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.toLowerCase().trim());
  const idx = (name: string) => headers.indexOf(name);

  return rows.slice(1).map((row) => {
    const url = row[idx('url')] ?? '';
    const username = row[idx('username')] ?? '';
    const password = row[idx('password')] ?? '';
    return makeLoginItem(url, username, password, url);
  });
}

/** Parse 1Password CSV export. */
export function parseOnePassword(text: string): VaultItem[] {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.toLowerCase().trim());
  const idx = (name: string) => headers.indexOf(name);

  return rows.slice(1).map((row) => {
    const name = row[idx('title')] ?? '';
    const url = row[idx('url')] ?? '';
    const username = row[idx('username')] ?? '';
    const password = row[idx('password')] ?? '';
    return makeLoginItem(name, username, password, url);
  });
}

/** Parse LastPass CSV export. */
export function parseLastPass(text: string): VaultItem[] {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.toLowerCase().trim());
  const idx = (name: string) => headers.indexOf(name);

  return rows.slice(1).map((row) => {
    const name = row[idx('name')] ?? '';
    const url = row[idx('url')] ?? '';
    const username = row[idx('username')] ?? '';
    const password = row[idx('password')] ?? '';
    const totp = row[idx('totp')] ?? undefined;
    return makeLoginItem(name, username, password, url, totp || undefined);
  });
}

/** Parse KeePass CSV export. */
export function parseKeePass(text: string): VaultItem[] {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.toLowerCase().trim());
  const idx = (name: string) => headers.indexOf(name);

  return rows.slice(1).map((row) => {
    const name = row[idx('title')] ?? '';
    const url = row[idx('url')] ?? '';
    const username = row[idx('username')] ?? '';
    const password = row[idx('password')] ?? '';
    return makeLoginItem(name, username, password, url);
  });
}

/** Auto-detect format and parse CSV. */
export function parseImport(text: string, format?: ImportFormat): VaultItem[] {
  const rows = parseCSV(text);
  if (rows.length < 1) return [];

  const detected = format ?? detectFormat(rows[0]);

  switch (detected) {
    case 'bitwarden':
      return parseBitwarden(text);
    case 'chrome':
      return parseChrome(text);
    case 'firefox':
      return parseFirefox(text);
    case 'onepassword':
      return parseOnePassword(text);
    case 'lastpass':
      return parseLastPass(text);
    case 'keepass':
      return parseKeePass(text);
    default:
      return parseBitwarden(text); // fallback
  }
}

/** Export vault items to Bitwarden-compatible CSV. */
export function exportToBitwardenCSV(items: VaultItem[]): string {
  const headers = [
    'folder',
    'favorite',
    'type',
    'name',
    'notes',
    'fields',
    'reprompt',
    'login_uri',
    'login_username',
    'login_password',
    'login_totp',
  ];

  const rows = items.map((item) => {
    if (item.type === 'login') {
      const login = item as LoginItem;
      return [
        '',
        item.favorite ? '1' : '0',
        'login',
        item.name,
        '',
        '',
        '0',
        login.uris[0] ?? '',
        login.username,
        login.password,
        login.totp ?? '',
      ];
    }
    return ['', item.favorite ? '1' : '0', item.type, item.name, '', '', '0', '', '', '', ''];
  });

  const escape = (s: string) => (s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [headers.join(','), ...rows.map((r) => r.map(escape).join(','))];
  return lines.join('\n');
}
