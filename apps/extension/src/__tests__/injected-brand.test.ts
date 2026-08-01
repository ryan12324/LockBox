import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createLockboxBrand,
  getLockboxWordmarkUrl,
  lockboxBrandMarkup,
} from '../../lib/injected-brand.js';

afterEach(() => {
  delete (globalThis as Record<string, unknown>).chrome;
});

describe('injected Lockbox branding', () => {
  it('uses the packaged extension wordmark', () => {
    const getURL = vi.fn((path: string) => `chrome-extension://lockbox/${path}`);
    (globalThis as Record<string, unknown>).chrome = { runtime: { getURL } };

    expect(getLockboxWordmarkUrl()).toBe(
      'chrome-extension://lockbox/brand/lockbox-logo-horizontal.png'
    );
    expect(getURL).toHaveBeenCalledWith('brand/lockbox-logo-horizontal.png');
  });

  it('renders an attributed image for string templates and DOM surfaces', () => {
    expect(lockboxBrandMarkup()).toContain('alt="Lockbox"');

    const brand = createLockboxBrand();
    const logo = brand.querySelector('img');
    expect(brand.className).toBe('lockbox-brand');
    expect(logo?.alt).toBe('Lockbox');
    expect(logo?.src).toContain('/brand/lockbox-logo-horizontal.png');
  });
});
