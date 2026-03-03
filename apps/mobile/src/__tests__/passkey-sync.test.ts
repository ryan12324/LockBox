import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StoredVaultItem, StoragePlugin } from '../plugins/storage';
import type { SyncResponse, SyncVaultItem } from '../offline/sync-queue';
import type { PasskeyItem } from '@lockbox/types';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockPasskeyStore = vi.hoisted(() => ({
  getAllPasskeys: vi.fn(),
  getPasskeyByCredentialId: vi.fn(),
  upsertPasskey: vi.fn(),
  deletePasskey: vi.fn(),
}));

const mockStorage = vi.hoisted(() => ({
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
}));

const mockEncryptString = vi.hoisted(() => vi.fn());
const mockDecryptString = vi.hoisted(() => vi.fn());
const mockToUtf8 = vi.hoisted(() => vi.fn());

vi.mock('@capacitor/core', () => ({
  registerPlugin: vi.fn(() => mockPasskeyStore),
}));

vi.mock('../plugins/storage', () => ({
  Storage: mockStorage,
}));

vi.mock('@lockbox/crypto', () => ({
  encryptString: mockEncryptString,
  decryptString: mockDecryptString,
  toUtf8: mockToUtf8,
}));

import {
  encryptPasskeyForVault,
  decryptPasskeyFromVault,
  syncPasskeysToVault,
  syncPasskeysFromVault,
  type PasskeySyncResult,
} from '../passkey-sync';

// ─── Test Data ────────────────────────────────────────────────────────────────

const TEST_USER_KEY = new Uint8Array(64).fill(0xab);
const TEST_TOKEN = 'test-bearer-token';
const TEST_API_URL = 'https://api.lockbox.dev';

function makePasskeyItem(overrides: Partial<PasskeyItem> = {}): PasskeyItem {
  return {
    id: 'pk-item-1',
    type: 'passkey',
    name: 'GitHub (user@example.com)',
    tags: [],
    favorite: false,
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-01-15T10:00:00.000Z',
    revisionDate: '2024-01-15T10:00:00.000Z',
    rpId: 'github.com',
    rpName: 'GitHub',
    userId: 'dXNlci0x',
    userName: 'user@example.com',
    credentialId: 'Y3JlZC0xMjM',
    publicKey: 'cHVibGljLWtleS0x',
    counter: 0,
    transports: ['internal'],
    ...overrides,
  };
}

function makeStoredPasskeyItem(overrides: Partial<StoredVaultItem> = {}): StoredVaultItem {
  return {
    id: 'pk-item-1',
    encryptedData: 'iv-base64.ciphertext-base64',
    type: 'passkey',
    tags: [],
    favorite: false,
    revisionDate: '2024-01-15T10:00:00.000Z',
    syncStatus: 'pending_create',
    ...overrides,
  };
}

function makeSyncVaultItem(overrides: Partial<SyncVaultItem> = {}): SyncVaultItem {
  return {
    id: 'pk-item-1',
    type: 'passkey',
    encryptedData: 'server-iv.server-ciphertext',
    revisionDate: '2024-06-01T00:00:00.000Z',
    tags: [],
    favorite: false,
    ...overrides,
  };
}

function makeSyncResponse(overrides: Partial<SyncResponse> = {}): SyncResponse {
  return {
    added: [],
    modified: [],
    deleted: [],
    folders: [],
    serverTimestamp: '2024-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function mockFetchResponse(body: unknown, ok = true, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      status,
      json: vi.fn().mockResolvedValue(body),
    })
  );
}

// ─── encryptPasskeyForVault ───────────────────────────────────────────────────

describe('encryptPasskeyForVault', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEncryptString.mockResolvedValue('encrypted-result');
    mockToUtf8.mockImplementation((str: string) => new TextEncoder().encode(str));
  });

  it('calls encryptString with JSON-serialized passkey and correct AAD', async () => {
    const passkey = makePasskeyItem();
    const itemId = 'item-abc';
    const revisionDate = '2024-01-15T10:00:00.000Z';

    const result = await encryptPasskeyForVault(passkey, TEST_USER_KEY, itemId, revisionDate);

    expect(result).toBe('encrypted-result');
    expect(mockEncryptString).toHaveBeenCalledWith(
      JSON.stringify(passkey),
      TEST_USER_KEY.slice(0, 32),
      new TextEncoder().encode(`${itemId}:${revisionDate}`)
    );
  });

  it('uses only first 32 bytes of userKey', async () => {
    const passkey = makePasskeyItem();
    await encryptPasskeyForVault(passkey, TEST_USER_KEY, 'id', 'date');

    const keyArg = mockEncryptString.mock.calls[0][1] as Uint8Array;
    expect(keyArg.length).toBe(32);
  });

  it('constructs AAD as utf8(itemId:revisionDate)', async () => {
    const passkey = makePasskeyItem();
    await encryptPasskeyForVault(passkey, TEST_USER_KEY, 'my-id', '2024-06-01T00:00:00.000Z');

    expect(mockToUtf8).toHaveBeenCalledWith('my-id:2024-06-01T00:00:00.000Z');
  });
});

// ─── decryptPasskeyFromVault ──────────────────────────────────────────────────

describe('decryptPasskeyFromVault', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToUtf8.mockImplementation((str: string) => new TextEncoder().encode(str));
  });

  it('calls decryptString with correct AAD and parses result as PasskeyItem', async () => {
    const passkey = makePasskeyItem();
    mockDecryptString.mockResolvedValue(JSON.stringify(passkey));

    const result = await decryptPasskeyFromVault(
      'encrypted-data',
      TEST_USER_KEY,
      'item-abc',
      '2024-01-15T10:00:00.000Z'
    );

    expect(result).toEqual(passkey);
    expect(mockDecryptString).toHaveBeenCalledWith(
      'encrypted-data',
      TEST_USER_KEY.slice(0, 32),
      new TextEncoder().encode('item-abc:2024-01-15T10:00:00.000Z')
    );
  });

  it('throws when decryptString fails', async () => {
    mockDecryptString.mockRejectedValue(new Error('Authentication failed'));

    await expect(decryptPasskeyFromVault('bad-data', TEST_USER_KEY, 'id', 'date')).rejects.toThrow(
      'Authentication failed'
    );
  });

  it('throws on invalid JSON', async () => {
    mockDecryptString.mockResolvedValue('not-valid-json');

    await expect(decryptPasskeyFromVault('data', TEST_USER_KEY, 'id', 'date')).rejects.toThrow();
  });
});

// ─── syncPasskeysToVault ──────────────────────────────────────────────────────

describe('syncPasskeysToVault', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.getPendingItems.mockResolvedValue({ items: [] });
    mockFetchResponse({});
  });

  it('returns empty result when no pending passkeys', async () => {
    mockStorage.getPendingItems.mockResolvedValue({ items: [] });

    const result = await syncPasskeysToVault(TEST_USER_KEY, TEST_TOKEN, TEST_API_URL);

    expect(result.pushed).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('filters out non-passkey pending items', async () => {
    mockStorage.getPendingItems.mockResolvedValue({
      items: [
        makeStoredPasskeyItem({ id: 'login-1', type: 'login', syncStatus: 'pending_create' }),
        makeStoredPasskeyItem({ id: 'note-1', type: 'note', syncStatus: 'pending_update' }),
      ],
    });

    const result = await syncPasskeysToVault(TEST_USER_KEY, TEST_TOKEN, TEST_API_URL);

    expect(result.pushed).toBe(0);
  });

  it('pushes pending_create passkey items to API', async () => {
    const pendingItem = makeStoredPasskeyItem({
      id: 'pk-1',
      syncStatus: 'pending_create',
      encryptedData: 'enc-data-1',
    });
    mockStorage.getPendingItems.mockResolvedValue({ items: [pendingItem] });
    mockFetchResponse({});

    const result = await syncPasskeysToVault(TEST_USER_KEY, TEST_TOKEN, TEST_API_URL);

    expect(result.pushed).toBe(1);
    expect(fetch).toHaveBeenCalledWith(
      `${TEST_API_URL}/api/sync/push`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${TEST_TOKEN}`,
        }),
      })
    );

    const fetchBody = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(fetchBody.created).toHaveLength(1);
    expect(fetchBody.created[0].id).toBe('pk-1');
    expect(fetchBody.created[0].type).toBe('passkey');
  });

  it('marks pushed items as synced', async () => {
    const pendingItem = makeStoredPasskeyItem({ id: 'pk-1', syncStatus: 'pending_create' });
    mockStorage.getPendingItems.mockResolvedValue({ items: [pendingItem] });
    mockFetchResponse({});

    await syncPasskeysToVault(TEST_USER_KEY, TEST_TOKEN, TEST_API_URL);

    expect(mockStorage.updateSyncStatus).toHaveBeenCalledWith({
      id: 'pk-1',
      syncStatus: 'synced',
    });
  });

  it('deletes locally when pushing pending_delete', async () => {
    const deleteItem = makeStoredPasskeyItem({ id: 'pk-del', syncStatus: 'pending_delete' });
    mockStorage.getPendingItems.mockResolvedValue({ items: [deleteItem] });
    mockFetchResponse({});

    const result = await syncPasskeysToVault(TEST_USER_KEY, TEST_TOKEN, TEST_API_URL);

    expect(result.pushed).toBe(1);
    expect(mockStorage.deleteItem).toHaveBeenCalledWith({ id: 'pk-del' });
    expect(mockStorage.updateSyncStatus).not.toHaveBeenCalled();
  });

  it('handles mixed pending statuses', async () => {
    mockStorage.getPendingItems.mockResolvedValue({
      items: [
        makeStoredPasskeyItem({ id: 'pk-new', syncStatus: 'pending_create' }),
        makeStoredPasskeyItem({ id: 'pk-upd', syncStatus: 'pending_update' }),
        makeStoredPasskeyItem({ id: 'pk-del', syncStatus: 'pending_delete' }),
      ],
    });
    mockFetchResponse({});

    const result = await syncPasskeysToVault(TEST_USER_KEY, TEST_TOKEN, TEST_API_URL);

    expect(result.pushed).toBe(3);
    expect(mockStorage.updateSyncStatus).toHaveBeenCalledTimes(2);
    expect(mockStorage.deleteItem).toHaveBeenCalledTimes(1);
  });

  it('throws on API failure', async () => {
    mockStorage.getPendingItems.mockResolvedValue({
      items: [makeStoredPasskeyItem({ syncStatus: 'pending_create' })],
    });
    mockFetchResponse({}, false, 500);

    await expect(syncPasskeysToVault(TEST_USER_KEY, TEST_TOKEN, TEST_API_URL)).rejects.toThrow(
      'Push failed with status 500'
    );
  });

  it('records per-item errors when marking synced fails', async () => {
    mockStorage.getPendingItems.mockResolvedValue({
      items: [makeStoredPasskeyItem({ id: 'pk-err', syncStatus: 'pending_create' })],
    });
    mockFetchResponse({});
    mockStorage.updateSyncStatus.mockRejectedValueOnce(new Error('DB write error'));

    const result = await syncPasskeysToVault(TEST_USER_KEY, TEST_TOKEN, TEST_API_URL);

    expect(result.pushed).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('pk-err');
    expect(result.errors[0]).toContain('DB write error');
  });
});

// ─── syncPasskeysFromVault ────────────────────────────────────────────────────

describe('syncPasskeysFromVault', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.getLastSyncTimestamp.mockResolvedValue({ timestamp: null });
    mockToUtf8.mockImplementation((str: string) => new TextEncoder().encode(str));
    mockPasskeyStore.upsertPasskey.mockResolvedValue(undefined);
    mockPasskeyStore.deletePasskey.mockResolvedValue(undefined);
  });

  it('pulls passkey items and stores in both StoragePlugin and Room DB', async () => {
    const passkey = makePasskeyItem({ credentialId: 'cred-abc' });
    const syncItem = makeSyncVaultItem({ id: 'pk-srv-1', type: 'passkey' });
    mockFetchResponse(makeSyncResponse({ added: [syncItem] }));
    mockDecryptString.mockResolvedValue(JSON.stringify(passkey));

    const result = await syncPasskeysFromVault(TEST_USER_KEY, TEST_TOKEN, TEST_API_URL);

    expect(result.pulled).toBe(1);

    expect(mockStorage.upsertItem).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'pk-srv-1',
        type: 'passkey',
        syncStatus: 'synced',
        encryptedData: syncItem.encryptedData,
      })
    );

    expect(mockPasskeyStore.upsertPasskey).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialId: 'cred-abc',
        rpId: 'github.com',
        rpName: 'GitHub',
        userName: 'user@example.com',
      })
    );
  });

  it('filters for passkey type only', async () => {
    const loginItem = makeSyncVaultItem({ id: 'login-1', type: 'login' });
    const passkeyItem = makeSyncVaultItem({ id: 'pk-1', type: 'passkey' });
    const noteItem = makeSyncVaultItem({ id: 'note-1', type: 'note' });
    mockFetchResponse(makeSyncResponse({ added: [loginItem, passkeyItem, noteItem] }));

    const passkey = makePasskeyItem();
    mockDecryptString.mockResolvedValue(JSON.stringify(passkey));

    const result = await syncPasskeysFromVault(TEST_USER_KEY, TEST_TOKEN, TEST_API_URL);

    expect(result.pulled).toBe(1);
    expect(mockDecryptString).toHaveBeenCalledOnce();
  });

  it('processes both added and modified passkeys', async () => {
    const addedItem = makeSyncVaultItem({ id: 'pk-add', type: 'passkey' });
    const modifiedItem = makeSyncVaultItem({ id: 'pk-mod', type: 'passkey' });
    mockFetchResponse(makeSyncResponse({ added: [addedItem], modified: [modifiedItem] }));

    const passkey = makePasskeyItem();
    mockDecryptString.mockResolvedValue(JSON.stringify(passkey));

    const result = await syncPasskeysFromVault(TEST_USER_KEY, TEST_TOKEN, TEST_API_URL);

    expect(result.pulled).toBe(2);
    expect(mockStorage.upsertItem).toHaveBeenCalledTimes(2);
    expect(mockPasskeyStore.upsertPasskey).toHaveBeenCalledTimes(2);
  });

  it('uses since timestamp for delta sync', async () => {
    mockStorage.getLastSyncTimestamp.mockResolvedValue({
      timestamp: '2024-03-15T10:00:00.000Z',
    });
    mockFetchResponse(makeSyncResponse());

    await syncPasskeysFromVault(TEST_USER_KEY, TEST_TOKEN, TEST_API_URL);

    const fetchUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(fetchUrl).toContain('?since=');
    expect(fetchUrl).toContain(encodeURIComponent('2024-03-15T10:00:00.000Z'));
  });

  it('omits since parameter on first sync', async () => {
    mockStorage.getLastSyncTimestamp.mockResolvedValue({ timestamp: null });
    mockFetchResponse(makeSyncResponse());

    await syncPasskeysFromVault(TEST_USER_KEY, TEST_TOKEN, TEST_API_URL);

    const fetchUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(fetchUrl).toBe(`${TEST_API_URL}/api/sync`);
  });

  it('handles decryption errors per-item without aborting', async () => {
    const goodItem = makeSyncVaultItem({ id: 'pk-good', type: 'passkey' });
    const badItem = makeSyncVaultItem({ id: 'pk-bad', type: 'passkey' });
    mockFetchResponse(makeSyncResponse({ added: [badItem, goodItem] }));

    const passkey = makePasskeyItem();
    mockDecryptString
      .mockRejectedValueOnce(new Error('Decryption failed'))
      .mockResolvedValueOnce(JSON.stringify(passkey));

    const result = await syncPasskeysFromVault(TEST_USER_KEY, TEST_TOKEN, TEST_API_URL);

    expect(result.pulled).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('pk-bad');
    expect(result.errors[0]).toContain('Decryption failed');
  });

  it('handles deleted passkey items — cleans up Room DB', async () => {
    const storedItem = makeStoredPasskeyItem({
      id: 'pk-del',
      type: 'passkey',
      syncStatus: 'synced',
    });
    mockStorage.getItem.mockResolvedValue({ item: storedItem });
    mockFetchResponse(makeSyncResponse({ deleted: ['pk-del'] }));

    const passkey = makePasskeyItem({ credentialId: 'cred-to-delete' });
    mockDecryptString.mockResolvedValue(JSON.stringify(passkey));

    const result = await syncPasskeysFromVault(TEST_USER_KEY, TEST_TOKEN, TEST_API_URL);

    expect(result.pulled).toBe(1);
    expect(mockPasskeyStore.deletePasskey).toHaveBeenCalledWith({
      credentialId: 'cred-to-delete',
    });
    expect(mockStorage.deleteItem).toHaveBeenCalledWith({ id: 'pk-del' });
  });

  it('skips deleted items that are not passkeys', async () => {
    mockStorage.getItem.mockResolvedValue({
      item: makeStoredPasskeyItem({ id: 'login-del', type: 'login' }),
    });
    mockFetchResponse(makeSyncResponse({ deleted: ['login-del'] }));

    const result = await syncPasskeysFromVault(TEST_USER_KEY, TEST_TOKEN, TEST_API_URL);

    expect(result.pulled).toBe(0);
    expect(mockPasskeyStore.deletePasskey).not.toHaveBeenCalled();
  });

  it('skips deleted items that do not exist locally', async () => {
    mockStorage.getItem.mockResolvedValue({ item: null });
    mockFetchResponse(makeSyncResponse({ deleted: ['pk-unknown'] }));

    const result = await syncPasskeysFromVault(TEST_USER_KEY, TEST_TOKEN, TEST_API_URL);

    expect(result.pulled).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('returns empty result on empty sync response', async () => {
    mockFetchResponse(makeSyncResponse());

    const result = await syncPasskeysFromVault(TEST_USER_KEY, TEST_TOKEN, TEST_API_URL);

    expect(result.pushed).toBe(0);
    expect(result.pulled).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('throws on API failure', async () => {
    mockFetchResponse({}, false, 401);

    await expect(syncPasskeysFromVault(TEST_USER_KEY, TEST_TOKEN, TEST_API_URL)).rejects.toThrow(
      'Pull failed with status 401'
    );
  });

  it('sends correct auth header', async () => {
    mockFetchResponse(makeSyncResponse());

    await syncPasskeysFromVault(TEST_USER_KEY, TEST_TOKEN, TEST_API_URL);

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${TEST_TOKEN}`,
        }),
      })
    );
  });
});
