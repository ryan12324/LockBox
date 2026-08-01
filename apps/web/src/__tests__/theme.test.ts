import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyStoredTheme,
  getStoredThemePreference,
  startThemeSync,
} from '../lib/theme.js';

const SETTINGS_STORAGE_KEY = 'lockbox-settings';

function mockSystemTheme(initiallyDark: boolean) {
  let matches = initiallyDark;
  const listeners = new Set<() => void>();
  const mediaQuery = {
    get matches() {
      return matches;
    },
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: (_type: string, listener: () => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: () => void) => {
      listeners.delete(listener);
    },
    addListener: (listener: () => void) => {
      listeners.add(listener);
    },
    removeListener: (listener: () => void) => {
      listeners.delete(listener);
    },
    dispatchEvent: () => true,
  } as unknown as MediaQueryList;

  vi.stubGlobal('matchMedia', vi.fn(() => mediaQuery));

  return {
    setDark(dark: boolean) {
      matches = dark;
      listeners.forEach((listener) => listener());
    },
  };
}

describe('theme preference', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the OS theme before the settings page is opened', () => {
    mockSystemTheme(true);

    applyStoredTheme();

    expect(getStoredThemePreference()).toBe('system');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('keeps explicit light and dark preferences independent of the OS', () => {
    mockSystemTheme(true);
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ theme: 'light' }));
    applyStoredTheme();
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ theme: 'dark' }));
    applyStoredTheme();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('follows live OS changes only while System is selected', () => {
    const systemTheme = mockSystemTheme(false);
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ theme: 'system' }));
    const stop = startThemeSync();

    systemTheme.setDark(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ theme: 'light' }));
    applyStoredTheme();
    systemTheme.setDark(false);
    systemTheme.setDark(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    stop();
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ theme: 'system' }));
    systemTheme.setDark(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
