import { describe, expect, it } from 'vitest';
import { buildWebVaultUrl } from '../../lib/web-vault.js';

describe('web vault links', () => {
  it('opens the requested route on the verified web-vault origin', () => {
    expect(buildWebVaultUrl('https://vault.example.com/login', '/teams')).toBe(
      'https://vault.example.com/teams'
    );
  });

  it('rejects protocol-relative destinations', () => {
    expect(() => buildWebVaultUrl('https://vault.example.com', '//attacker.example')).toThrow(
      'could not open that web vault page'
    );
  });

  it('gives recovery guidance when the stored web-vault address is missing', () => {
    expect(() => buildWebVaultUrl('', '/teams')).toThrow('Reconnect the extension');
  });
});
