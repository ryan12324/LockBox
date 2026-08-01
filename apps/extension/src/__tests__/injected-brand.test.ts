import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createLockboxBrand,
  getLockboxWordmarkUrl,
  lockboxBrandMarkup,
} from '../../lib/injected-brand.js';

afterEach(() => {
  delete (globalThis as Record<string, unknown>).chrome;
});

describe('injected Authwell branding', () => {
  it('uses the packaged extension wordmark', () => {
    const getURL = vi.fn((path: string) => `chrome-extension://lockbox/${path}`);
    (globalThis as Record<string, unknown>).chrome = { runtime: { getURL } };

    expect(getLockboxWordmarkUrl()).toBe(
      'chrome-extension://lockbox/brand/authwell-logo-horizontal.png'
    );
    expect(getURL).toHaveBeenCalledWith('brand/authwell-logo-horizontal.png');
  });

  it('renders an attributed image for string templates and DOM surfaces', () => {
    expect(lockboxBrandMarkup()).toContain('alt="Authwell"');

    const brand = createLockboxBrand();
    const logo = brand.querySelector('img');
    expect(brand.className).toBe('lockbox-brand');
    expect(logo?.alt).toBe('Authwell');
    expect(logo?.src).toContain('/brand/authwell-logo-horizontal.png');
  });
});
