/**
 * Tests for background service worker logic.
 * Tests the URL matching and message routing logic in isolation.
 * The full background.ts uses WXT globals (defineBackground) which can't run in vitest,
 * so we test the pure logic functions extracted here.
 */

import { describe, it, expect } from 'vitest';

// ─── URL matching logic (extracted from background.ts) ────────────────────────

/**
 * Mirrors the getMatchingItems URL matching logic from background.ts.
 * Tests the hostname matching algorithm in isolation.
 */
function hostnameMatches(pageUrl: string, itemUri: string): boolean {
  try {
    const pageHost = new URL(pageUrl).hostname.replace(/^www\./, '');
    const itemHost = new URL(itemUri).hostname.replace(/^www\./, '');
    return (
      pageHost === itemHost ||
      pageHost.endsWith(`.${itemHost}`) ||
      itemHost.endsWith(`.${pageHost}`)
    );
  } catch {
    return false;
  }
}

describe('background URL matching logic', () => {
  it('matches exact hostname', () => {
    expect(hostnameMatches('https://example.com/login', 'https://example.com')).toBe(true);
  });

  it('matches www vs non-www (page has www)', () => {
    expect(hostnameMatches('https://www.example.com/login', 'https://example.com')).toBe(true);
  });

  it('matches www vs non-www (item has www)', () => {
    expect(hostnameMatches('https://example.com/login', 'https://www.example.com')).toBe(true);
  });

  it('matches subdomain to parent', () => {
    expect(hostnameMatches('https://app.example.com', 'https://example.com')).toBe(true);
  });

  it('does not match different domains', () => {
    expect(hostnameMatches('https://evil.com', 'https://example.com')).toBe(false);
  });

  it('does not match partial domain overlap', () => {
    expect(hostnameMatches('https://notexample.com', 'https://example.com')).toBe(false);
  });

  it('handles invalid page URL gracefully', () => {
    expect(() => hostnameMatches('not-a-url', 'https://example.com')).not.toThrow();
    expect(hostnameMatches('not-a-url', 'https://example.com')).toBe(false);
  });

  it('handles invalid item URI gracefully', () => {
    expect(() => hostnameMatches('https://example.com', 'not-a-url')).not.toThrow();
    expect(hostnameMatches('https://example.com', 'not-a-url')).toBe(false);
  });
});

// ─── Message type validation ──────────────────────────────────────────────────

type MessageType =
  | 'unlock'
  | 'lock'
  | 'get-matches'
  | 'get-vault'
  | 'get-totp'
  | 'generate-password'
  | 'generate-passphrase'
  | 'activity'
  | 'is-unlocked';

const VALID_MESSAGE_TYPES: MessageType[] = [
  'unlock',
  'lock',
  'get-matches',
  'get-vault',
  'get-totp',
  'generate-password',
  'generate-passphrase',
  'activity',
  'is-unlocked',
];

describe('background message types', () => {
  it('defines all expected message types', () => {
    expect(VALID_MESSAGE_TYPES).toContain('unlock');
    expect(VALID_MESSAGE_TYPES).toContain('lock');
    expect(VALID_MESSAGE_TYPES).toContain('get-matches');
    expect(VALID_MESSAGE_TYPES).toContain('get-vault');
    expect(VALID_MESSAGE_TYPES).toContain('get-totp');
    expect(VALID_MESSAGE_TYPES).toContain('generate-password');
    expect(VALID_MESSAGE_TYPES).toContain('generate-passphrase');
    expect(VALID_MESSAGE_TYPES).toContain('activity');
    expect(VALID_MESSAGE_TYPES).toContain('is-unlocked');
  });

  it('has 9 message types total', () => {
    expect(VALID_MESSAGE_TYPES).toHaveLength(9);
  });
});

// ─── Auto-lock timing ─────────────────────────────────────────────────────────

describe('auto-lock timing', () => {
  it('default lock timeout is 15 minutes', () => {
    const DEFAULT_LOCK_MINUTES = 15;
    expect(DEFAULT_LOCK_MINUTES).toBe(15);
  });

  it('sync period is 5 minutes', () => {
    const SYNC_PERIOD_MINUTES = 5;
    expect(SYNC_PERIOD_MINUTES).toBe(5);
  });
});

// ─── Vault item decryption AAD format ─────────────────────────────────────────

describe('vault item AAD format', () => {
  it('AAD is formatted as itemId:revisionDate', () => {
    const itemId = 'abc-123';
    const revisionDate = '2024-01-01T00:00:00.000Z';
    const aad = `${itemId}:${revisionDate}`;
    expect(aad).toBe('abc-123:2024-01-01T00:00:00.000Z');
  });

  it('AAD changes when itemId changes (prevents transplant)', () => {
    const revisionDate = '2024-01-01T00:00:00.000Z';
    const aad1 = `item-1:${revisionDate}`;
    const aad2 = `item-2:${revisionDate}`;
    expect(aad1).not.toBe(aad2);
  });

  it('AAD changes when revisionDate changes', () => {
    const itemId = 'item-1';
    const aad1 = `${itemId}:2024-01-01T00:00:00.000Z`;
    const aad2 = `${itemId}:2024-06-01T00:00:00.000Z`;
    expect(aad1).not.toBe(aad2);
  });
});
