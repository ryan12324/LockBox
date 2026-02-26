/**
 * Tests for vault item encryption/decryption helpers.
 * Verifies AAD binding, round-trip correctness, and key slicing.
 */

import { describe, it, expect } from 'vitest';
import { encryptVaultItem, decryptVaultItem } from '../lib/crypto.js';
import type { VaultItem, LoginItem } from '@lockbox/types';

function makeTestKey(): Uint8Array {
  // 64-byte user key (first 32 bytes used for AES-256)
  return new Uint8Array(64).fill(0x42);
}

function makeTestItem(): LoginItem {
  const now = new Date().toISOString();
  return {
    id: 'test-item-id',
    type: 'login',
    name: 'Test Login',
    username: 'user@example.com',
    password: 's3cr3t_p@ssw0rd',
    uris: ['https://example.com'],
    totp: undefined,
    tags: ['work'],
    favorite: false,
    createdAt: now,
    updatedAt: now,
    revisionDate: now,
  };
}

describe('encryptVaultItem / decryptVaultItem', () => {
  it('round-trips a login item correctly', async () => {
    const userKey = makeTestKey();
    const item = makeTestItem();
    const itemId = item.id;
    const revisionDate = item.revisionDate;

    const encrypted = await encryptVaultItem(item, userKey, itemId, revisionDate);
    expect(typeof encrypted).toBe('string');
    expect(encrypted.length).toBeGreaterThan(0);

    const decrypted = await decryptVaultItem(encrypted, userKey, itemId, revisionDate);
    expect(decrypted.name).toBe(item.name);
    expect(decrypted.type).toBe('login');
    const login = decrypted as LoginItem;
    expect(login.username).toBe(item.username);
    expect(login.password).toBe(item.password);
    expect(login.uris).toEqual(item.uris);
    expect(login.tags).toEqual(item.tags);
  });

  it('produces different ciphertext each call (random IV)', async () => {
    const userKey = makeTestKey();
    const item = makeTestItem();

    const enc1 = await encryptVaultItem(item, userKey, item.id, item.revisionDate);
    const enc2 = await encryptVaultItem(item, userKey, item.id, item.revisionDate);

    // Different IVs → different ciphertext
    expect(enc1).not.toBe(enc2);
  });

  it('decryption fails with wrong itemId (AAD mismatch)', async () => {
    const userKey = makeTestKey();
    const item = makeTestItem();

    const encrypted = await encryptVaultItem(item, userKey, item.id, item.revisionDate);

    await expect(
      decryptVaultItem(encrypted, userKey, 'wrong-item-id', item.revisionDate)
    ).rejects.toThrow();
  });

  it('decryption fails with wrong revisionDate (AAD mismatch)', async () => {
    const userKey = makeTestKey();
    const item = makeTestItem();

    const encrypted = await encryptVaultItem(item, userKey, item.id, item.revisionDate);

    await expect(
      decryptVaultItem(encrypted, userKey, item.id, '2000-01-01T00:00:00.000Z')
    ).rejects.toThrow();
  });

  it('decryption fails with wrong key', async () => {
    const userKey = makeTestKey();
    const wrongKey = new Uint8Array(64).fill(0x99);
    const item = makeTestItem();

    const encrypted = await encryptVaultItem(item, userKey, item.id, item.revisionDate);

    await expect(
      decryptVaultItem(encrypted, wrongKey, item.id, item.revisionDate)
    ).rejects.toThrow();
  });

  it('uses only first 32 bytes of 64-byte user key', async () => {
    // Two keys with same first 32 bytes but different last 32 bytes
    const key1 = new Uint8Array(64);
    key1.fill(0x42, 0, 32);
    key1.fill(0x11, 32, 64);

    const key2 = new Uint8Array(64);
    key2.fill(0x42, 0, 32);
    key2.fill(0x99, 32, 64); // different second half

    const item = makeTestItem();
    const encrypted = await encryptVaultItem(item, key1, item.id, item.revisionDate);

    // Should decrypt successfully with key2 (same first 32 bytes)
    const decrypted = await decryptVaultItem(encrypted, key2, item.id, item.revisionDate);
    expect(decrypted.name).toBe(item.name);
  });

  it('preserves all vault item fields through round-trip', async () => {
    const userKey = makeTestKey();
    const now = new Date().toISOString();
    const item: VaultItem = {
      id: 'full-test-id',
      type: 'login',
      name: 'Full Test',
      folderId: 'folder-123',
      tags: ['tag1', 'tag2'],
      favorite: true,
      createdAt: now,
      updatedAt: now,
      revisionDate: now,
      username: 'testuser',
      password: 'testpass',
      uris: ['https://a.com', 'https://b.com'],
      totp: 'otpauth://totp/Example?secret=JBSWY3DPEHPK3PXP',
    } as LoginItem;

    const encrypted = await encryptVaultItem(item, userKey, item.id, item.revisionDate);
    const decrypted = await decryptVaultItem(encrypted, userKey, item.id, item.revisionDate);

    expect(decrypted.folderId).toBe('folder-123');
    expect(decrypted.tags).toEqual(['tag1', 'tag2']);
    expect(decrypted.favorite).toBe(true);
    const login = decrypted as LoginItem;
    expect(login.totp).toBe('otpauth://totp/Example?secret=JBSWY3DPEHPK3PXP');
    expect(login.uris).toHaveLength(2);
  });
});
