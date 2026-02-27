/**
 * 2FA directory integration for Lockbox mobile.
 * Fetches and caches 2fa.directory data to detect sites supporting 2FA.
 * Uses in-memory cache instead of chrome.storage.local.
 * Cache expires after 24 hours.
 */

/** Cache expiry duration in milliseconds (24 hours) */
export const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000;

/** Single entry from 2fa.directory API v3 */
export interface TwoFaEntry {
  methods: string[];
  documentation?: string;
  name: string;
  domain: string;
}

/** Result of checking a domain against 2fa.directory */
export interface TwoFaCheckResult {
  supports2fa: boolean;
  methods: string[];
  documentation?: string;
  siteName?: string;
}

/**
 * Parse 2fa.directory v3 format into a domain-keyed map.
 * Input is an array of [name, data] tuples as returned by the API.
 * Checks for totp, sms, email, phone, hardware, proprietary, u2f methods
 * and also the tfa array field.
 * Skips entries with no methods or no domain.
 */
export function parseTwoFaDirectory(
  raw: Array<[string, Record<string, unknown>]>
): Record<string, TwoFaEntry> {
  const entries: Record<string, TwoFaEntry> = {};

  for (const item of raw) {
    if (!Array.isArray(item) || item.length < 2) continue;
    const data = item[1];
    const domain = typeof data['domain'] === 'string' ? data['domain'] : '';
    if (!domain) continue;

    const methods: string[] = [];
    const methodKeys = ['totp', 'sms', 'email', 'phone', 'hardware', 'proprietary', 'u2f'];
    for (const key of methodKeys) {
      if (data[key] === true || (typeof data[key] === 'string' && data[key])) {
        methods.push(key);
      }
    }

    // Also check tfa array
    if (Array.isArray(data['tfa'])) {
      for (const m of data['tfa']) {
        if (typeof m === 'string' && !methods.includes(m)) {
          methods.push(m);
        }
      }
    }

    if (methods.length === 0) continue;

    entries[domain] = {
      methods,
      documentation: typeof data['documentation'] === 'string' ? data['documentation'] : undefined,
      name:
        typeof data['name'] === 'string'
          ? data['name']
          : typeof item[0] === 'string'
            ? item[0]
            : domain,
      domain,
    };
  }

  return entries;
}

/**
 * Check if a domain supports 2FA against pre-loaded entries.
 * Normalizes domain (strips www., lowercases) and tries parent domain
 * matching (e.g., app.github.com → github.com).
 */
export function checkSiteAgainstEntries(
  domain: string,
  entries: Record<string, TwoFaEntry>
): TwoFaCheckResult {
  const normalized = domain.replace(/^www\./, '').toLowerCase();

  // Direct match
  if (entries[normalized]) {
    const entry = entries[normalized];
    return {
      supports2fa: true,
      methods: entry.methods,
      documentation: entry.documentation,
      siteName: entry.name,
    };
  }

  // Try parent domain (e.g., app.github.com → github.com)
  const parts = normalized.split('.');
  if (parts.length > 2) {
    const parent = parts.slice(1).join('.');
    if (entries[parent]) {
      const entry = entries[parent];
      return {
        supports2fa: true,
        methods: entry.methods,
        documentation: entry.documentation,
        siteName: entry.name,
      };
    }
  }

  return { supports2fa: false, methods: [] };
}

/**
 * Fetch 2fa.directory data with in-memory cache support.
 * Returns cached data if within CACHE_EXPIRY_MS.
 * Fetches from https://2fa.directory/api/v3/tfa.json on cache miss.
 */
export async function fetchTwoFaDirectory(
  cache?: { entries: Record<string, TwoFaEntry>; timestamp: number } | null
): Promise<{ entries: Record<string, TwoFaEntry>; timestamp: number }> {
  // Return cached if still valid
  if (cache) {
    const age = Date.now() - cache.timestamp;
    if (age < CACHE_EXPIRY_MS) {
      return cache;
    }
  }

  try {
    const res = await fetch('https://2fa.directory/api/v3/tfa.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const raw = (await res.json()) as Array<[string, Record<string, unknown>]>;
    const entries = parseTwoFaDirectory(raw);

    return { entries, timestamp: Date.now() };
  } catch (err) {
    console.error('[Lockbox] Failed to fetch 2fa.directory:', err);
    return { entries: cache?.entries ?? {}, timestamp: cache?.timestamp ?? 0 };
  }
}

/**
 * Extract domain from a URL string for matching against 2fa.directory.
 * Returns null if the URL cannot be parsed.
 */
export function extractDomainFromUri(uri: string): string | null {
  try {
    const url = new URL(uri);
    return url.hostname || null;
  } catch {
    return null;
  }
}

/**
 * Batch check login items for 2FA support.
 * Returns an array of results with the item index and check result
 * for each item that has at least one URI matching a 2FA-supported site.
 */
export function checkLoginItemsFor2fa(
  items: Array<{ uris?: string[] }>,
  entries: Record<string, TwoFaEntry>
): Array<{ index: number; result: TwoFaCheckResult }> {
  const results: Array<{ index: number; result: TwoFaCheckResult }> = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.uris || item.uris.length === 0) continue;

    for (const uri of item.uris) {
      const domain = extractDomainFromUri(uri);
      if (!domain) continue;

      const result = checkSiteAgainstEntries(domain, entries);
      if (result.supports2fa) {
        results.push({ index: i, result });
        break; // One match per item is sufficient
      }
    }
  }

  return results;
}
