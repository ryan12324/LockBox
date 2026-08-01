import { describe, expect, it } from 'vitest';
import type { EncryptedVaultItem, LoginItem } from '@lockbox/types';
import { validateFreshVaultItem } from '../lib/vault-freshness.js';

const encrypted: EncryptedVaultItem = {
  id: 'item-1',
  type: 'login',
  encryptedData: 'opaque',
  revisionDate: '2026-08-01T12:00:00.000Z',
  folderId: null,
  tags: [],
  favorite: false,
  createdAt: '2026-08-01T10:00:00.000Z',
  deletedAt: null,
};

const decrypted: LoginItem = {
  id: 'item-1',
  type: 'login',
  name: 'Example',
  username: 'fresh-user',
  password: 'fresh-password',
  uris: ['https://example.com'],
  tags: [],
  favorite: false,
  createdAt: encrypted.createdAt,
  updatedAt: encrypted.revisionDate,
  revisionDate: encrypted.revisionDate,
};

describe('fresh vault item validation', () => {
  it('accepts a decrypted item bound to the requested server revision', () => {
    expect(validateFreshVaultItem('item-1', encrypted, decrypted)).toBe(decrypted);
  });

  it('rejects deleted server rows', () => {
    expect(() =>
      validateFreshVaultItem('item-1', { ...encrypted, deletedAt: encrypted.revisionDate }, decrypted)
    ).toThrow('deleted');
  });

  it('rejects a mismatched decrypted revision instead of accepting stale plaintext', () => {
    expect(() =>
      validateFreshVaultItem('item-1', encrypted, {
        ...decrypted,
        revisionDate: '2026-07-31T12:00:00.000Z',
      })
    ).toThrow('server metadata');
  });
});
