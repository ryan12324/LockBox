/**
 * Tests for email alias view utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  SIMPLELOGIN_API_BASE,
  ANONADDY_API_BASE,
  ALIAS_PROVIDERS,
  getProviderName,
  getProviderDocsUrl,
  isValidAliasConfig,
  formatAliasEmail,
} from '../views/email-aliases';

// ─── Constants ────────────────────────────────────────────────────────────────

describe('SIMPLELOGIN_API_BASE', () => {
  it('has correct value', () => {
    expect(SIMPLELOGIN_API_BASE).toBe('https://app.simplelogin.io/api');
  });
});

describe('ANONADDY_API_BASE', () => {
  it('has correct value', () => {
    expect(ANONADDY_API_BASE).toBe('https://app.anonaddy.com/api/v1');
  });
});

describe('ALIAS_PROVIDERS', () => {
  it('has 2 providers', () => {
    expect(ALIAS_PROVIDERS).toHaveLength(2);
  });

  it('includes simplelogin', () => {
    const sl = ALIAS_PROVIDERS.find((p) => p.id === 'simplelogin');
    expect(sl).toBeDefined();
    expect(sl?.name).toBe('SimpleLogin');
    expect(sl?.apiBase).toBe(SIMPLELOGIN_API_BASE);
    expect(sl?.docsUrl).toContain('simplelogin');
  });

  it('includes anonaddy', () => {
    const aa = ALIAS_PROVIDERS.find((p) => p.id === 'anonaddy');
    expect(aa).toBeDefined();
    expect(aa?.name).toBe('AnonAddy');
    expect(aa?.apiBase).toBe(ANONADDY_API_BASE);
    expect(aa?.docsUrl).toContain('addy.io');
  });
});

// ─── getProviderName ──────────────────────────────────────────────────────────

describe('getProviderName', () => {
  it('returns "SimpleLogin" for simplelogin', () => {
    expect(getProviderName('simplelogin')).toBe('SimpleLogin');
  });

  it('returns "AnonAddy" for anonaddy', () => {
    expect(getProviderName('anonaddy')).toBe('AnonAddy');
  });
});

// ─── getProviderDocsUrl ───────────────────────────────────────────────────────

describe('getProviderDocsUrl', () => {
  it('returns SimpleLogin docs URL', () => {
    expect(getProviderDocsUrl('simplelogin')).toBe('https://simplelogin.io/docs/');
  });

  it('returns AnonAddy docs URL', () => {
    expect(getProviderDocsUrl('anonaddy')).toBe('https://addy.io/docs/');
  });
});

// ─── isValidAliasConfig ───────────────────────────────────────────────────────

describe('isValidAliasConfig', () => {
  it('returns true for valid simplelogin config', () => {
    expect(
      isValidAliasConfig({
        provider: 'simplelogin',
        encryptedApiKey: 'encrypted-key-data',
      })
    ).toBe(true);
  });

  it('returns true for valid anonaddy config', () => {
    expect(
      isValidAliasConfig({
        provider: 'anonaddy',
        encryptedApiKey: 'encrypted-key-data',
      })
    ).toBe(true);
  });

  it('returns true for config with optional baseUrl', () => {
    expect(
      isValidAliasConfig({
        provider: 'simplelogin',
        encryptedApiKey: 'encrypted-key-data',
        baseUrl: 'https://custom.simplelogin.io/api',
      })
    ).toBe(true);
  });

  it('returns false when provider is missing', () => {
    expect(isValidAliasConfig({ encryptedApiKey: 'key' })).toBe(false);
  });

  it('returns false when encryptedApiKey is missing', () => {
    expect(isValidAliasConfig({ provider: 'simplelogin' })).toBe(false);
  });

  it('returns false when encryptedApiKey is empty', () => {
    expect(
      isValidAliasConfig({
        provider: 'simplelogin',
        encryptedApiKey: '',
      })
    ).toBe(false);
  });

  it('returns false for empty object', () => {
    expect(isValidAliasConfig({})).toBe(false);
  });

  it('returns false for invalid provider', () => {
    expect(
      isValidAliasConfig({
        provider: 'invalid' as 'simplelogin',
        encryptedApiKey: 'key',
      })
    ).toBe(false);
  });
});

// ─── formatAliasEmail ─────────────────────────────────────────────────────────

describe('formatAliasEmail', () => {
  it('returns short email unchanged', () => {
    expect(formatAliasEmail('user@test.com')).toBe('user@test.com');
  });

  it('returns email at exactly 30 chars unchanged', () => {
    // 30 chars exactly: 21 local + @ + 8 domain = 30
    const email = 'a'.repeat(21) + '@test.com';
    expect(email.length).toBe(30);
    expect(formatAliasEmail(email)).toBe(email);
  });

  it('truncates long email before @', () => {
    const email = 'verylongaliasname1234567890@example.com';
    const result = formatAliasEmail(email);
    expect(result.length).toBeLessThanOrEqual(30);
    expect(result).toContain('…');
    expect(result).toContain('@example.com');
  });

  it('preserves domain in truncated email', () => {
    const email = 'this-is-a-really-long-alias-name@gmail.com';
    const result = formatAliasEmail(email);
    expect(result.endsWith('@gmail.com')).toBe(true);
  });

  it('handles email without @', () => {
    const noAt = 'a'.repeat(40);
    const result = formatAliasEmail(noAt);
    expect(result.length).toBeLessThanOrEqual(30);
    expect(result).toContain('…');
  });

  it('returns empty string for empty input', () => {
    expect(formatAliasEmail('')).toBe('');
  });
});
