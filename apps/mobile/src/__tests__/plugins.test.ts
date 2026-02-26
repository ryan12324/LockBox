/**
 * Tests for TypeScript plugin bridge interfaces.
 * Tests the interface contracts and type definitions for native Capacitor plugins.
 * The actual native implementations are in Kotlin and tested via Android instrumentation tests.
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
      getCredentialsForUri: vi.fn().mockResolvedValue({ credentials: [] }),
      saveCredential: vi.fn().mockResolvedValue(undefined),
      removeCredential: vi.fn().mockResolvedValue(undefined),
      checkAvailability: vi.fn().mockResolvedValue({ available: true, biometryType: 'fingerprint' }),
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

  it('getCredentialsForUri returns credentials array', async () => {
    const result = await Autofill.getCredentialsForUri({ uri: 'https://example.com' });
    expect(result).toHaveProperty('credentials');
    expect(Array.isArray(result.credentials)).toBe(true);
  });

  it('saveCredential accepts encrypted data', async () => {
    await expect(
      Autofill.saveCredential({
        id: 'item-123',
        encryptedData: 'base64-encrypted-blob',
        uri: 'https://example.com',
      })
    ).resolves.toBeUndefined();
  });

  it('removeCredential accepts item id', async () => {
    await expect(
      Autofill.removeCredential({ id: 'item-123' })
    ).resolves.toBeUndefined();
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
    const result = await Biometric.isEnrolled();
    expect(result).toHaveProperty('enrolled');
    expect(typeof result.enrolled).toBe('boolean');
  });

  it('enrollBiometric accepts base64 user key', async () => {
    await expect(
      Biometric.enrollBiometric({ userKey: 'base64-user-key-64-bytes' })
    ).resolves.toBeUndefined();
  });

  it('authenticate returns success and optional user key', async () => {
    const result = await Biometric.authenticate({ reason: 'Unlock Lockbox' });
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
  it('defines all valid sync statuses', async () => {
    const { } = await import('../plugins/storage');
    const validStatuses = ['synced', 'pending_create', 'pending_update', 'pending_delete'];
    expect(validStatuses).toHaveLength(4);
    expect(validStatuses).toContain('synced');
    expect(validStatuses).toContain('pending_create');
    expect(validStatuses).toContain('pending_update');
    expect(validStatuses).toContain('pending_delete');
  });
});
