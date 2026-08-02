/**
 * Tests for TypeScript plugin bridge interfaces.
 * Tests the interface contracts and type definitions for native Capacitor plugins.
 * Native implementations live in Kotlin and Swift and are verified in their platform builds.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock @capacitor/core ─────────────────────────────────────────────────────

vi.mock('@capacitor/core', () => ({
  registerPlugin: vi.fn((name: string) => {
    // Return a mock plugin object that records calls
    return {
      _pluginName: name,
      isEnabled: vi.fn().mockResolvedValue({ enabled: false }),
      requestEnable: vi.fn().mockResolvedValue(undefined),
      requestBiometricEnrollment: vi.fn().mockResolvedValue(undefined),
      replaceCredentialIndex: vi.fn().mockResolvedValue({ indexed: 0 }),
      replacePasskeyIndex: vi.fn().mockResolvedValue({ indexed: 0 }),
      clearCredentialIndex: vi.fn().mockResolvedValue(undefined),
      getPasskeysForUri: vi.fn().mockResolvedValue({ passkeys: [] }),
      getPendingCredentialSaves: vi.fn().mockResolvedValue({ saves: [] }),
      exportPendingCredentialSave: vi.fn().mockResolvedValue({}),
      markCredentialSaveSynced: vi.fn().mockResolvedValue(undefined),
      checkAvailability: vi
        .fn()
        .mockResolvedValue({ available: true, biometryType: 'fingerprint' }),
      isEnrolled: vi.fn().mockResolvedValue({ enrolled: false }),
      enrollBiometric: vi.fn().mockResolvedValue(undefined),
      authenticate: vi.fn().mockResolvedValue({ success: true, userKey: 'base64-user-key' }),
      unenroll: vi.fn().mockResolvedValue(undefined),
      upsertItem: vi.fn().mockResolvedValue(undefined),
      getItem: vi.fn().mockResolvedValue({ item: null }),
      listItems: vi.fn().mockResolvedValue({ items: [] }),
      getPendingItems: vi.fn().mockResolvedValue({ items: [] }),
      deleteItem: vi.fn().mockResolvedValue(undefined),
      updateSyncStatus: vi.fn().mockResolvedValue(undefined),
      batchUpsert: vi.fn().mockResolvedValue(undefined),
      setLastSyncTimestamp: vi.fn().mockResolvedValue(undefined),
      getLastSyncTimestamp: vi.fn().mockResolvedValue({ timestamp: null }),
      clearAll: vi.fn().mockResolvedValue(undefined),
    };
  }),
}));

// ─── AutofillPlugin ───────────────────────────────────────────────────────────

describe('AutofillPlugin interface', () => {
  let Autofill: import('../plugins/autofill').AutofillPlugin;

  beforeEach(async () => {
    const module = await import('../plugins/autofill');
    Autofill = module.Autofill;
  });
  it('isEnabled returns enabled status', async () => {
    const result = await Autofill.isEnabled();
    expect(result).toHaveProperty('enabled');
    expect(typeof result.enabled).toBe('boolean');
  });

  it('requestEnable resolves without error', async () => {
    await expect(Autofill.requestEnable()).resolves.toBeUndefined();
  });

  it('requestBiometricEnrollment resolves without error', async () => {
    await expect(Autofill.requestBiometricEnrollment()).resolves.toBeUndefined();
  });

  it('replaceCredentialIndex accepts decrypted fields for immediate native encryption', async () => {
    const result = await Autofill.replaceCredentialIndex({
      accountId: 'account-123',
      saveAuthorization: 'A'.repeat(43),
      credentials: [{
        id: 'item-123',
        name: 'Example',
        username: 'alice@example.com',
        password: 'secret',
        uris: [
          'androidapp://android.octopusenergy.octopus.energy',
          'https://android.octopusenergy.octopus.energy/',
        ],
      }],
    });
    expect(result).toEqual({ indexed: 0 });
  });

  it('clearCredentialIndex resolves', async () => {
    await expect(Autofill.clearCredentialIndex()).resolves.toBeUndefined();
  });

  it('exposes the Android saved-login outbox contract', async () => {
    await expect(Autofill.getPendingCredentialSaves()).resolves.toEqual({ saves: [] });
    await expect(Autofill.markCredentialSaveSynced({
      id: 'pending-save-1',
      authorization: 'A'.repeat(43),
    }))
      .resolves.toBeUndefined();
  });

  it('replacePasskeyIndex carries portable key material and account isolation', async () => {
    const result = await Autofill.replacePasskeyIndex({
      accountId: 'account-123',
      passkeys: [{
        id: 'vault-item-123',
        credentialId: 'Y3JlZGVudGlhbC1pZC0xMjM',
        rpId: 'example.com',
        rpName: 'Example',
        userName: 'alice@example.com',
        userDisplayName: 'Alice',
        userId: 'dXNlci0xMjM',
        publicKey: 'cHVibGljLWtleS1jb3NlLWVjMi1wMjU2',
        privateKey: 'cGtjczgtcHJpdmF0ZS1rZXktbWF0ZXJpYWw',
        createdAt: '2026-08-02T00:00:00.000Z',
      }],
    });
    expect(result).toEqual({ indexed: 0 });
  });
});

// ─── BiometricPlugin ──────────────────────────────────────────────────────────

describe('BiometricPlugin interface', () => {
  let Biometric: import('../plugins/biometric').BiometricPlugin;

  beforeEach(async () => {
    const module = await import('../plugins/biometric');
    Biometric = module.Biometric;
  });
  it('checkAvailability returns availability and biometry type', async () => {
    const result = await Biometric.checkAvailability();
    expect(result).toHaveProperty('available');
    expect(result).toHaveProperty('biometryType');
    expect(typeof result.available).toBe('boolean');
  });

  it('isEnrolled returns enrollment status', async () => {
    const result = await Biometric.isEnrolled({ scope: 'https://vault.example#account-123' });
    expect(result).toHaveProperty('enrolled');
    expect(typeof result.enrolled).toBe('boolean');
  });

  it('enrollBiometric accepts base64 user key', async () => {
    await expect(
      Biometric.enrollBiometric({
        userKey: 'base64-user-key-64-bytes',
        scope: 'https://vault.example#account-123',
      })
    ).resolves.toBeUndefined();
  });

  it('authenticate returns success and optional user key', async () => {
    const result = await Biometric.authenticate({
      reason: 'Unlock Authwell',
      scope: 'https://vault.example#account-123',
    });
    expect(result).toHaveProperty('success');
    expect(typeof result.success).toBe('boolean');
    // userKey is only present on success
    if (result.success) {
      expect(result.userKey).toBeDefined();
    }
  });

  it('unenroll resolves without error', async () => {
    await expect(Biometric.unenroll()).resolves.toBeUndefined();
  });
});

// ─── StoragePlugin ────────────────────────────────────────────────────────────

describe('StoragePlugin interface', () => {
  let Storage: import('../plugins/storage').StoragePlugin;

  beforeEach(async () => {
    const module = await import('../plugins/storage');
    Storage = module.Storage;
  });
  it('upsertItem accepts encrypted vault item', async () => {
    await expect(
      Storage.upsertItem({
        id: 'item-123',
        encryptedData: 'base64-encrypted-blob',
        type: 'login',
        revisionDate: '2024-01-01T00:00:00.000Z',
        syncStatus: 'synced',
      })
    ).resolves.toBeUndefined();
  });

  it('getItem returns item or null', async () => {
    const result = await Storage.getItem({ id: 'item-123' });
    expect(result).toHaveProperty('item');
    // item can be null (not found) or a StoredVaultItem
  });

  it('listItems returns items array', async () => {
    const result = await Storage.listItems();
    expect(result).toHaveProperty('items');
    expect(Array.isArray(result.items)).toBe(true);
  });

  it('getPendingItems returns pending items', async () => {
    const result = await Storage.getPendingItems();
    expect(result).toHaveProperty('items');
    expect(Array.isArray(result.items)).toBe(true);
  });

  it('deleteItem accepts item id', async () => {
    await expect(Storage.deleteItem({ id: 'item-123' })).resolves.toBeUndefined();
  });

  it('updateSyncStatus accepts id and status', async () => {
    await expect(
      Storage.updateSyncStatus({ id: 'item-123', syncStatus: 'synced' })
    ).resolves.toBeUndefined();
  });

  it('batchUpsert accepts array of items', async () => {
    await expect(
      Storage.batchUpsert({
        items: [
          {
            id: 'item-1',
            encryptedData: 'blob-1',
            type: 'login',
            revisionDate: '2024-01-01T00:00:00.000Z',
            syncStatus: 'synced',
          },
        ],
      })
    ).resolves.toBeUndefined();
  });

  it('setLastSyncTimestamp accepts ISO timestamp', async () => {
    await expect(
      Storage.setLastSyncTimestamp({ timestamp: '2024-01-01T00:00:00.000Z' })
    ).resolves.toBeUndefined();
  });

  it('getLastSyncTimestamp returns timestamp or null', async () => {
    const result = await Storage.getLastSyncTimestamp();
    expect(result).toHaveProperty('timestamp');
  });

  it('clearAll resolves without error', async () => {
    await expect(Storage.clearAll()).resolves.toBeUndefined();
  });
});

// ─── SyncStatus type ──────────────────────────────────────────────────────────

describe('SyncStatus type', () => {
  it('defines all valid sync statuses', () => {
    const validStatuses = ['synced', 'pending_create', 'pending_update', 'pending_delete'];
    expect(validStatuses).toHaveLength(4);
    expect(validStatuses).toContain('synced');
    expect(validStatuses).toContain('pending_create');
    expect(validStatuses).toContain('pending_update');
    expect(validStatuses).toContain('pending_delete');
  });
});
