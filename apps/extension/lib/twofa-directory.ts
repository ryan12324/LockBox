/**
 * 2FA Directory integration for Lockbox extension.
 * Fetches and caches 2fa.directory data to detect sites supporting 2FA.
 * Cache expires after 24 hours.
 */

const CACHE_KEY = 'twofa-directory-cache';
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Single entry from 2fa.directory API v3. */
export interface TwoFaEntry {
  methods: string[];
  documentation?: string;
  name: string;
  domain: string;
}

/** Result of checking a domain against 2fa.directory. */
export interface TwoFaCheckResult {
  supports2fa: boolean;
  methods: string[];
  documentation?: string;
  siteName?: string;
}

/** Cached directory structure stored in browser.storage.local. */
interface CachedDirectory {
  timestamp: number;
  entries: Record<string, TwoFaEntry>;
}

/**
 * Fetch 2fa.directory data and cache it in extension storage.
 * Returns cached data if still valid (< 24h old).
 */
export async function fetchTwoFaDirectory(): Promise<Record<string, TwoFaEntry>> {
  // Check cache first
  const cached = await getCachedDirectory();
  if (cached) return cached;

  try {
    const res = await fetch('https://2fa.directory/api/v3/tfa.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const raw = (await res.json()) as Array<[string, Record<string, unknown>]>;

    // Parse the array-of-arrays format into a domain-keyed map
    const entries: Record<string, TwoFaEntry> = {};
    for (const item of raw) {
      if (!Array.isArray(item) || item.length < 2) continue;
      const data = item[1] as Record<string, unknown>;
      const domain = (data.domain as string) ?? '';
      if (!domain) continue;

      const methods: string[] = [];
      const methodKeys = ['totp', 'sms', 'email', 'phone', 'hardware', 'proprietary', 'u2f'];
      for (const key of methodKeys) {
        if (data[key] === true || (typeof data[key] === 'string' && data[key])) {
          methods.push(key);
        }
      }
      // Also check tfa array
      if (Array.isArray(data.tfa)) {
        for (const m of data.tfa) {
          if (typeof m === 'string' && !methods.includes(m)) {
            methods.push(m);
          }
        }
      }

      if (methods.length === 0) continue;

      entries[domain] = {
        methods,
        documentation: (data.documentation as string) ?? undefined,
        name: (data.name as string) ?? (item[0] as string) ?? domain,
        domain,
      };
    }

    // Store in cache
    await setCachedDirectory(entries);
    return entries;
  } catch (err) {
    console.error('[Lockbox] Failed to fetch 2fa.directory:', err);
    return {};
  }
}

/**
 * Check if a domain supports 2FA.
 * Normalizes domain (strips www, checks parent domains).
 */
export async function checkSite(domain: string): Promise<TwoFaCheckResult> {
  const entries = await fetchTwoFaDirectory();
  return checkSiteAgainstEntries(domain, entries);
}

/**
 * Pure function to check a domain against pre-loaded entries.
 * Useful for testing without fetching.
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

/** Retrieve cached directory if not expired. */
async function getCachedDirectory(): Promise<Record<string, TwoFaEntry> | null> {
  try {
    const result = await chrome.storage.local.get(CACHE_KEY);
    const cached = result[CACHE_KEY] as CachedDirectory | undefined;
    if (!cached) return null;

    const age = Date.now() - cached.timestamp;
    if (age > CACHE_EXPIRY_MS) {
      // Cache expired
      await chrome.storage.local.remove(CACHE_KEY);
      return null;
    }

    return cached.entries;
  } catch {
    return null;
  }
}

/** Store directory in cache with current timestamp. */
async function setCachedDirectory(entries: Record<string, TwoFaEntry>): Promise<void> {
  const cached: CachedDirectory = {
    timestamp: Date.now(),
    entries,
  };
  await chrome.storage.local.set({ [CACHE_KEY]: cached });
}
