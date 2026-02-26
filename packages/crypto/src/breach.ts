/**
 * HIBP (Have I Been Pwned) breach checking using k-anonymity.
 *
 * Only the first 5 characters of the SHA-1 hash are sent to the API,
 * so the full password hash is never exposed to the remote service.
 *
 * @see https://haveibeenpwned.com/API/v3#SearchingPwnedPasswordsByRange
 */

import type { BreachCheckResult } from '@lockbox/types';

const HIBP_RANGE_URL = 'https://api.pwnedpasswords.com/range/';
const BATCH_DELAY_MS = 100; // per HIBP rate-limit guidelines

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the SHA-1 hex digest of `input` using the Web Crypto API.
 * Returns a lowercase hex string.
 */
export async function sha1Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const bytes = new Uint8Array(hashBuffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Parse the HIBP range response into a Map of uppercase suffix → count.
 *
 * Each line is formatted as `SUFFIX:COUNT` (e.g. `003D68EB55068C33ACE09247EE4C639306B:3`).
 */
function parseRangeResponse(body: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;
    const suffix = trimmed.substring(0, colonIdx).toUpperCase();
    const count = parseInt(trimmed.substring(colonIdx + 1), 10);
    if (!Number.isNaN(count)) {
      map.set(suffix, count);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check a single password against the HIBP Pwned Passwords database.
 *
 * Uses k-anonymity: only the 5-character SHA-1 prefix is sent over the network.
 */
export async function checkPassword(password: string): Promise<BreachCheckResult> {
  const hex = (await sha1Hex(password)).toUpperCase();
  const prefix = hex.substring(0, 5);
  const suffix = hex.substring(5);

  const response = await fetch(`${HIBP_RANGE_URL}${prefix}`, {
    headers: { 'User-Agent': 'Lockbox-PasswordManager' },
  });

  if (!response.ok) {
    throw new Error(`HIBP API error: ${response.status} ${response.statusText}`);
  }

  const body = await response.text();
  const suffixes = parseRangeResponse(body);
  const count = suffixes.get(suffix) ?? 0;

  return {
    hashPrefix: prefix,
    found: count > 0,
    count,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Check multiple passwords in batch with rate limiting.
 *
 * Inserts a 100 ms delay between successive API calls to respect HIBP guidelines.
 */
export async function checkBatch(
  passwords: Array<{ id: string; password: string }>
): Promise<Map<string, BreachCheckResult>> {
  const results = new Map<string, BreachCheckResult>();

  for (let i = 0; i < passwords.length; i++) {
    const { id, password } = passwords[i];

    // Rate-limit: wait before every call after the first
    if (i > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }

    try {
      const result = await checkPassword(password);
      results.set(id, result);
    } catch {
      // Graceful failure — mark as not found with zero count
      results.set(id, {
        hashPrefix: '',
        found: false,
        count: 0,
        checkedAt: new Date().toISOString(),
      });
    }
  }

  return results;
}
