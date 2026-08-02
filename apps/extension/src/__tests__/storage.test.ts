import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getInlineAutofillPreferences,
  inlineAutofillEnabledForHost,
  normalizeAutofillHost,
  setInlineAutofillEnabled,
  setInlineAutofillForHost,
} from '../../lib/storage.js';

describe('inline autofill preferences', () => {
  let stored: Record<string, unknown>;

  beforeEach(() => {
    stored = {};
    (globalThis as Record<string, unknown>).chrome = {
      storage: {
        local: {
          get: vi.fn(async (keys: string | string[]) => {
            const requested = Array.isArray(keys) ? keys : [keys];
            return Object.fromEntries(
              requested.filter((key) => key in stored).map((key) => [key, stored[key]]),
            );
          }),
          set: vi.fn(async (values: Record<string, unknown>) => {
            Object.assign(stored, values);
          }),
        },
      },
    };
  });

  it('defaults inline autofill to enabled', async () => {
    await expect(getInlineAutofillPreferences()).resolves.toEqual({
      enabled: true,
      disabledHosts: [],
    });
  });

  it('normalizes URLs and www hostnames consistently', () => {
    expect(normalizeAutofillHost(' HTTPS://WWW.Example.com/login ')).toBe('example.com');
    expect(normalizeAutofillHost('www.Example.com.')).toBe('example.com');
    expect(normalizeAutofillHost('chrome://settings')).toBe('');
    expect(normalizeAutofillHost('not a host')).toBe('');
  });

  it('persists global and per-site choices without losing other disabled sites', async () => {
    await setInlineAutofillEnabled(false);
    await setInlineAutofillForHost('https://www.example.com/login', false);
    await setInlineAutofillForHost('accounts.example.net', false);
    await setInlineAutofillForHost('example.com', true);

    await expect(getInlineAutofillPreferences()).resolves.toEqual({
      enabled: false,
      disabledHosts: ['accounts.example.net'],
    });
  });

  it('combines the global and site-specific setting', () => {
    const preferences = { enabled: true, disabledHosts: ['blocked.example'] };
    expect(inlineAutofillEnabledForHost(preferences, 'https://allowed.example/login')).toBe(true);
    expect(inlineAutofillEnabledForHost(preferences, 'https://blocked.example/login')).toBe(false);
    expect(inlineAutofillEnabledForHost({ ...preferences, enabled: false }, 'allowed.example')).toBe(
      false,
    );
  });
});
