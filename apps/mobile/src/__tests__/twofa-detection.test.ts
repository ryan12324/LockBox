/**
 * Tests for 2FA detection view utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  CACHE_EXPIRY_MS,
  parseTwoFaDirectory,
  checkSiteAgainstEntries,
  extractDomainFromUri,
  checkLoginItemsFor2fa,
  type TwoFaEntry,
} from '../views/twofa-detection';

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeEntries(): Record<string, TwoFaEntry> {
  return {
    'github.com': {
      methods: ['totp', 'sms', 'u2f'],
      documentation:
        'https://docs.github.com/en/authentication/securing-your-account-with-two-factor-authentication-2fa',
      name: 'GitHub',
      domain: 'github.com',
    },
    'google.com': {
      methods: ['totp', 'sms', 'phone', 'u2f'],
      name: 'Google',
      domain: 'google.com',
    },
    'example.com': {
      methods: ['totp'],
      name: 'Example',
      domain: 'example.com',
    },
  };
}

// ─── CACHE_EXPIRY_MS ──────────────────────────────────────────────────────────

describe('CACHE_EXPIRY_MS', () => {
  it('is 24 hours in milliseconds', () => {
    expect(CACHE_EXPIRY_MS).toBe(24 * 60 * 60 * 1000);
  });
});

// ─── parseTwoFaDirectory ──────────────────────────────────────────────────────

describe('parseTwoFaDirectory', () => {
  it('parses entries with method boolean flags', () => {
    const raw: Array<[string, Record<string, unknown>]> = [
      ['GitHub', { domain: 'github.com', totp: true, sms: true, name: 'GitHub' }],
    ];
    const result = parseTwoFaDirectory(raw);
    expect(result['github.com']).toBeDefined();
    expect(result['github.com'].methods).toContain('totp');
    expect(result['github.com'].methods).toContain('sms');
    expect(result['github.com'].name).toBe('GitHub');
  });

  it('parses entries with tfa array field', () => {
    const raw: Array<[string, Record<string, unknown>]> = [
      ['Service', { domain: 'service.com', tfa: ['totp', 'email'], name: 'Service' }],
    ];
    const result = parseTwoFaDirectory(raw);
    expect(result['service.com'].methods).toContain('totp');
    expect(result['service.com'].methods).toContain('email');
  });

  it('combines boolean flags and tfa array without duplicates', () => {
    const raw: Array<[string, Record<string, unknown>]> = [
      ['Service', { domain: 'service.com', totp: true, tfa: ['totp', 'sms'], name: 'Service' }],
    ];
    const result = parseTwoFaDirectory(raw);
    const totpCount = result['service.com'].methods.filter((m) => m === 'totp').length;
    expect(totpCount).toBe(1);
    expect(result['service.com'].methods).toContain('sms');
  });

  it('skips entries without domain', () => {
    const raw: Array<[string, Record<string, unknown>]> = [
      ['NoDomain', { totp: true, name: 'NoDomain' }],
    ];
    const result = parseTwoFaDirectory(raw);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('skips entries with no methods', () => {
    const raw: Array<[string, Record<string, unknown>]> = [
      ['NoMethods', { domain: 'nomethods.com', name: 'NoMethods' }],
    ];
    const result = parseTwoFaDirectory(raw);
    expect(result['nomethods.com']).toBeUndefined();
  });

  it('falls back to tuple name when data.name is missing', () => {
    const raw: Array<[string, Record<string, unknown>]> = [
      ['FallbackName', { domain: 'fallback.com', totp: true }],
    ];
    const result = parseTwoFaDirectory(raw);
    expect(result['fallback.com'].name).toBe('FallbackName');
  });

  it('handles documentation field', () => {
    const raw: Array<[string, Record<string, unknown>]> = [
      ['WithDocs', { domain: 'docs.com', totp: true, documentation: 'https://docs.com/2fa' }],
    ];
    const result = parseTwoFaDirectory(raw);
    expect(result['docs.com'].documentation).toBe('https://docs.com/2fa');
  });

  it('handles all method keys', () => {
    const raw: Array<[string, Record<string, unknown>]> = [
      [
        'AllMethods',
        {
          domain: 'all.com',
          totp: true,
          sms: true,
          email: true,
          phone: true,
          hardware: true,
          proprietary: true,
          u2f: true,
        },
      ],
    ];
    const result = parseTwoFaDirectory(raw);
    expect(result['all.com'].methods).toHaveLength(7);
  });

  it('handles empty input', () => {
    expect(parseTwoFaDirectory([])).toEqual({});
  });

  it('skips malformed items', () => {
    const raw = [
      'not-an-array' as unknown as [string, Record<string, unknown>],
      [42] as unknown as [string, Record<string, unknown>],
    ];
    const result = parseTwoFaDirectory(raw);
    expect(Object.keys(result)).toHaveLength(0);
  });
});

// ─── checkSiteAgainstEntries ──────────────────────────────────────────────────

describe('checkSiteAgainstEntries', () => {
  const entries = makeEntries();

  it('finds direct domain match', () => {
    const result = checkSiteAgainstEntries('github.com', entries);
    expect(result.supports2fa).toBe(true);
    expect(result.methods).toContain('totp');
    expect(result.siteName).toBe('GitHub');
    expect(result.documentation).toBeDefined();
  });

  it('strips www. prefix', () => {
    const result = checkSiteAgainstEntries('www.github.com', entries);
    expect(result.supports2fa).toBe(true);
    expect(result.siteName).toBe('GitHub');
  });

  it('is case-insensitive', () => {
    const result = checkSiteAgainstEntries('GitHub.COM', entries);
    expect(result.supports2fa).toBe(true);
  });

  it('matches parent domain for subdomains', () => {
    const result = checkSiteAgainstEntries('app.github.com', entries);
    expect(result.supports2fa).toBe(true);
    expect(result.siteName).toBe('GitHub');
  });

  it('returns false for unknown domain', () => {
    const result = checkSiteAgainstEntries('unknown-site.org', entries);
    expect(result.supports2fa).toBe(false);
    expect(result.methods).toHaveLength(0);
  });

  it('returns false for empty domain', () => {
    const result = checkSiteAgainstEntries('', entries);
    expect(result.supports2fa).toBe(false);
  });
});

// ─── extractDomainFromUri ─────────────────────────────────────────────────────

describe('extractDomainFromUri', () => {
  it('extracts domain from https URL', () => {
    expect(extractDomainFromUri('https://github.com/login')).toBe('github.com');
  });

  it('extracts domain from http URL', () => {
    expect(extractDomainFromUri('http://example.com')).toBe('example.com');
  });

  it('extracts domain with subdomain', () => {
    expect(extractDomainFromUri('https://app.github.com/settings')).toBe('app.github.com');
  });

  it('extracts domain with port', () => {
    expect(extractDomainFromUri('https://localhost:3000')).toBe('localhost');
  });

  it('returns null for invalid URL', () => {
    expect(extractDomainFromUri('not-a-url')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractDomainFromUri('')).toBeNull();
  });
});

// ─── checkLoginItemsFor2fa ────────────────────────────────────────────────────

describe('checkLoginItemsFor2fa', () => {
  const entries = makeEntries();

  it('checks items with URIs against entries', () => {
    const items = [{ uris: ['https://github.com/login'] }, { uris: ['https://unknown.org'] }];
    const results = checkLoginItemsFor2fa(items, entries);
    expect(results).toHaveLength(1);
    expect(results[0].index).toBe(0);
    expect(results[0].result.supports2fa).toBe(true);
  });

  it('skips items without URIs', () => {
    const items = [{}, { uris: [] }, { uris: ['https://github.com'] }];
    const results = checkLoginItemsFor2fa(items, entries);
    expect(results).toHaveLength(1);
    expect(results[0].index).toBe(2);
  });

  it('returns empty array when no matches', () => {
    const items = [{ uris: ['https://unknown.org'] }, { uris: ['https://nope.net'] }];
    const results = checkLoginItemsFor2fa(items, entries);
    expect(results).toHaveLength(0);
  });

  it('only returns first matching URI per item', () => {
    const items = [{ uris: ['https://github.com', 'https://google.com'] }];
    const results = checkLoginItemsFor2fa(items, entries);
    expect(results).toHaveLength(1);
  });

  it('handles items with invalid URIs', () => {
    const items = [{ uris: ['not-a-url', 'https://github.com'] }];
    const results = checkLoginItemsFor2fa(items, entries);
    expect(results).toHaveLength(1);
    expect(results[0].result.supports2fa).toBe(true);
  });

  it('returns empty array for empty items', () => {
    expect(checkLoginItemsFor2fa([], entries)).toHaveLength(0);
  });
});
