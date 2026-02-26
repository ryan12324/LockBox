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

describe('E2E: ItemPanel save → API round-trip → Vault decrypt', () => {
  it('simulates the exact production create+load flow', async () => {
    // Simulate the full flow:
    // 1. ItemPanel.handleSave encrypts an item
    // 2. Sends to server (we simulate with JSON round-trip)
    // 3. Server stores values
    // 4. Vault.loadVault fetches + decrypts
    const userKey = makeTestKey();
    const now = new Date().toISOString();
    const itemId = crypto.randomUUID();

    // ─── Step 1: ItemPanel.handleSave builds the vault item ───
    const vaultItem: LoginItem = {
      id: itemId,
      type: 'login',
      name: 'My Login',
      username: 'testuser',
      password: 'testpass123',
      uris: ['https://example.com'],
      totp: undefined,
      tags: [],
      favorite: false,
      createdAt: now,
      updatedAt: now,
      revisionDate: now,
    };

    // ─── Step 2: Encrypt with AAD ───
    const encryptedData = await encryptVaultItem(vaultItem, userKey, itemId, now);

    // ─── Step 3: Simulate API call — serialize to JSON (as fetch would) ───
    const requestBody = JSON.stringify({
      id: itemId,
      type: 'login',
      encryptedData,
      folderId: undefined,
      tags: [],
      favorite: false,
      revisionDate: now,
    });

    // ─── Step 4: Server receives, stores, returns ───
    const serverBody = JSON.parse(requestBody);
    const serverNow = new Date().toISOString(); // server's own timestamp
    const storedItem = {
      id: (serverBody.id as string) || crypto.randomUUID(),
      userId: 'user-123',
      type: serverBody.type,
      encryptedData: serverBody.encryptedData,
      folderId: serverBody.folderId ?? null,
      tags: serverBody.tags ? JSON.stringify(serverBody.tags) : null,
      favorite: serverBody.favorite ? 1 : 0,
      revisionDate: (serverBody.revisionDate as string) || serverNow,
      createdAt: serverNow,
      deletedAt: null,
    };

    // ─── Step 5: Vault.loadVault fetches items (simulate JSON round-trip) ───
    const apiResponse = JSON.parse(JSON.stringify({ items: [storedItem], folders: [] }));
    const item = apiResponse.items[0];

    // ─── Step 6: Decrypt — exactly as Vault.tsx does ───
    const decrypted = await decryptVaultItem(
      item.encryptedData,
      userKey,
      item.id,
      item.revisionDate,
    );

    expect(decrypted.name).toBe('My Login');
    expect((decrypted as LoginItem).username).toBe('testuser');
    expect((decrypted as LoginItem).password).toBe('testpass123');
  });

  it('simulates key derivation round-trip (register → unlock)', async () => {
    const { generateUserKey, encryptUserKey, decryptUserKey, deriveKey, toBase64, fromBase64 } = await import('@lockbox/crypto');


    const password = 'my-test-password-123';
    const kdfConfig = { type: 'argon2id' as const, iterations: 3, memory: 65536, parallelism: 4 };

    // ─── Registration ───
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const saltB64 = toBase64(salt);
    const masterKey1 = await deriveKey(password, salt, kdfConfig);
    const userKey1 = generateUserKey();
    const encryptedUserKey = await encryptUserKey(userKey1, masterKey1);

    // ─── Simulate server storage → JSON round-trip ───
    const serverStored = JSON.parse(JSON.stringify({
      encryptedUserKey,
      kdfConfig,
      salt: saltB64,
    }));

    // ─── Login / Unlock — re-derive keys from stored data ───
    const salt2 = fromBase64(serverStored.salt);
    const masterKey2 = await deriveKey(password, salt2, serverStored.kdfConfig);
    const userKey2 = await decryptUserKey(serverStored.encryptedUserKey, masterKey2);

    // Keys must match
    expect(userKey1.length).toBe(userKey2.length);
    expect(Array.from(userKey1)).toEqual(Array.from(userKey2));

    // ─── Now verify vault item encrypt/decrypt works across key derivation ───
    const now = new Date().toISOString();
    const itemId = crypto.randomUUID();
    const item: LoginItem = {
      id: itemId,
      type: 'login',
      name: 'Cross-session Test',
      username: 'user',
      password: 'pass',
      uris: [],
      tags: [],
      favorite: false,
      createdAt: now,
      updatedAt: now,
      revisionDate: now,
    };

    // Encrypt with original key
    const encrypted = await encryptVaultItem(item, userKey1, itemId, now);

    // Decrypt with re-derived key
    const decrypted = await decryptVaultItem(encrypted, userKey2, itemId, now);
    expect(decrypted.name).toBe('Cross-session Test');
  });
});
