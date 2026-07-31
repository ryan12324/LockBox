/**
 * Tests for offline sync queue logic.
 * Tests buildPushPayload, mergeSyncResponse, markPushedAsSynced, and performSync.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  buildPushPayload,
  mergeSyncResponse,
  markPushedAsSynced,
  performSync,
  type SyncResponse,
  type SyncVaultItem,
  type SyncSharedFolder,
} from '../offline/sync-queue';
import type { StoragePlugin, StoredVaultItem } from '../plugins/storage';

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeStoredItem(overrides: Partial<StoredVaultItem> = {}): StoredVaultItem {
  return {
    id: 'item-1',
    encryptedData: 'encrypted-blob',
    type: 'login',
    tags: [],
    favorite: false,
    revisionDate: '2024-01-01T00:00:00.000Z',
    baseRevisionDate: '2024-01-01T00:00:00.000Z',
    syncStatus: 'synced',
    ...overrides,
  };
}

function makeSyncItem(overrides: Partial<SyncVaultItem> = {}): SyncVaultItem {
  return {
    id: 'item-1',
    type: 'login',
    encryptedData: 'server-encrypted-blob',
    revisionDate: '2024-06-01T00:00:00.000Z',
    tags: [],
    favorite: false,
    ...overrides,
  };
}

function makeStoragePlugin(overrides: Partial<StoragePlugin> = {}): StoragePlugin {
  return {
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
    ...overrides,
  };
}

// ─── buildPushPayload ─────────────────────────────────────────────────────────

describe('buildPushPayload', () => {
  it('returns empty payload when no pending items', () => {
    const payload = buildPushPayload([]);
    expect(payload).toEqual({ changes: [] });
  });

  it('maps pending_create items to create changes', () => {
    const items = [
      makeStoredItem({ id: 'item-1', syncStatus: 'pending_create' }),
      makeStoredItem({ id: 'item-2', syncStatus: 'pending_create' }),
    ];
    const payload = buildPushPayload(items);
    expect(payload.changes).toHaveLength(2);
    expect(payload.changes[0]).toMatchObject({ operation: 'create', itemId: 'item-1' });
    expect(payload.changes[1]).toMatchObject({ operation: 'create', itemId: 'item-2' });
  });

  it('maps pending_update items to update changes', () => {
    const items = [
      makeStoredItem({
        id: 'item-1',
        syncStatus: 'pending_update',
        revisionDate: '2024-02-01T00:00:00.000Z',
        baseRevisionDate: '2024-01-01T00:00:00.000Z',
      }),
    ];
    const payload = buildPushPayload(items);
    expect(payload.changes).toEqual([
      expect.objectContaining({
        operation: 'update',
        itemId: 'item-1',
        expectedRevisionDate: '2024-01-01T00:00:00.000Z',
      }),
    ]);
  });

  it('maps pending_delete items to delete changes', () => {
    const items = [
      makeStoredItem({ id: 'item-1', syncStatus: 'pending_delete' }),
      makeStoredItem({ id: 'item-2', syncStatus: 'pending_delete' }),
    ];
    const payload = buildPushPayload(items);
    expect(payload.changes).toEqual([
      { operation: 'delete', itemId: 'item-1' },
      { operation: 'delete', itemId: 'item-2' },
    ]);
  });

  it('handles mixed sync statuses', () => {
    const items = [
      makeStoredItem({ id: 'new-item', syncStatus: 'pending_create' }),
      makeStoredItem({ id: 'updated-item', syncStatus: 'pending_update' }),
      makeStoredItem({ id: 'deleted-item', syncStatus: 'pending_delete' }),
    ];
    const payload = buildPushPayload(items);
    expect(payload.changes.map((change) => change.operation)).toEqual([
      'create',
      'update',
      'delete',
    ]);
  });

  it('includes encryptedData in created items', () => {
    const items = [
      makeStoredItem({
        id: 'item-1',
        syncStatus: 'pending_create',
        encryptedData: 'my-encrypted-blob',
        type: 'login',
      }),
    ];
    const payload = buildPushPayload(items);
    expect(payload.changes[0]).toMatchObject({
      operation: 'create',
      itemId: 'item-1',
      encryptedData: 'my-encrypted-blob',
      type: 'login',
    });
  });

  it('sends explicit empty metadata so updates can clear server state', () => {
    const payload = buildPushPayload([
      makeStoredItem({
        id: 'item-1',
        syncStatus: 'pending_update',
        folderId: undefined,
        tags: [],
        favorite: false,
      }),
    ]);
    expect(payload.changes[0]).toMatchObject({ folderId: null, tags: [], favorite: false });
  });

  it('skips synced items (not pending)', () => {
    const items = [
      makeStoredItem({ id: 'item-1', syncStatus: 'synced' }),
    ];
    const payload = buildPushPayload(items);
    expect(payload.changes).toHaveLength(0);
  });
});

// ─── mergeSyncResponse ────────────────────────────────────────────────────────

describe('mergeSyncResponse', () => {
  it('inserts added items as synced', async () => {
    const storage = makeStoragePlugin();
    const response: SyncResponse = {
      added: [makeSyncItem({ id: 'new-item' })],
      modified: [],
      deleted: [],
      folders: [],
      serverTimestamp: '2024-06-01T00:00:00.000Z',
    };

    const result = await mergeSyncResponse(storage, response);

    expect(storage.batchUpsert).toHaveBeenCalledOnce();
    const batchCall = vi.mocked(storage.batchUpsert).mock.calls[0][0];
    expect(batchCall.items[0].id).toBe('new-item');
    expect(batchCall.items[0].syncStatus).toBe('synced');
    expect(result.pulled).toBe(1);
    expect(result.conflicts).toBe(0);
  });

  it('overwrites modified items (server wins)', async () => {
    const storage = makeStoragePlugin({
      getItem: vi.fn().mockResolvedValue({
        item: makeStoredItem({ id: 'item-1', syncStatus: 'synced' }),
      }),
    });
    const response: SyncResponse = {
      added: [],
      modified: [makeSyncItem({ id: 'item-1' })],
      deleted: [],
      folders: [],
      serverTimestamp: '2024-06-01T00:00:00.000Z',
    };

    const result = await mergeSyncResponse(storage, response);

    expect(storage.batchUpsert).toHaveBeenCalledOnce();
    const batchCall = vi.mocked(storage.batchUpsert).mock.calls[0][0];
    expect(batchCall.items[0].id).toBe('item-1');
    expect(batchCall.items[0].syncStatus).toBe('synced');
    expect(result.pulled).toBe(1);
    expect(result.conflicts).toBe(0);
  });
  it('detects conflict when local item has pending changes', async () => {
    const storage = makeStoragePlugin({
      getItem: vi.fn().mockResolvedValue({
        item: makeStoredItem({ id: 'item-1', syncStatus: 'pending_update' }),
      }),
    });
    const response: SyncResponse = {
      added: [],
      modified: [makeSyncItem({ id: 'item-1' })],
      deleted: [],
      folders: [],
      serverTimestamp: '2024-06-01T00:00:00.000Z',
    };

    const result = await mergeSyncResponse(storage, response);

    // Server still wins, but conflict is counted
    expect(result.conflicts).toBe(1);
    expect(storage.batchUpsert).toHaveBeenCalledOnce();
  });
  it('deletes items from local storage', async () => {
    const storage = makeStoragePlugin();
    const response: SyncResponse = {
      added: [],
      modified: [],
      deleted: ['item-to-delete'],
      folders: [],
      serverTimestamp: '2024-06-01T00:00:00.000Z',
    };

    const result = await mergeSyncResponse(storage, response);

    expect(storage.deleteItem).toHaveBeenCalledWith({ id: 'item-to-delete' });
    expect(result.pulled).toBe(1);
  });

  it('updates last sync timestamp', async () => {
    const storage = makeStoragePlugin();
    const response: SyncResponse = {
      added: [],
      modified: [],
      deleted: [],
      folders: [],
      serverTimestamp: '2024-06-01T12:00:00.000Z',
    };

    await mergeSyncResponse(storage, response);

    expect(storage.setLastSyncTimestamp).toHaveBeenCalledWith({
      timestamp: '2024-06-01T12:00:00.000Z',
    });
  });

  it('handles empty response gracefully', async () => {
    const storage = makeStoragePlugin();
    const response: SyncResponse = {
      added: [],
      modified: [],
      deleted: [],
      folders: [],
      serverTimestamp: '2024-06-01T00:00:00.000Z',
    };

    const result = await mergeSyncResponse(storage, response);

    expect(result.pulled).toBe(0);
    expect(result.conflicts).toBe(0);
    expect(storage.batchUpsert).not.toHaveBeenCalled();
    expect(storage.upsertItem).not.toHaveBeenCalled();
    expect(storage.deleteItem).not.toHaveBeenCalled();
  });
});

// ─── markPushedAsSynced ───────────────────────────────────────────────────────

describe('markPushedAsSynced', () => {
  it('marks pending_create items as synced', async () => {
    const storage = makeStoragePlugin();
    const items = [makeStoredItem({ id: 'item-1', syncStatus: 'pending_create' })];

    await markPushedAsSynced(storage, items);

    expect(storage.updateSyncStatus).toHaveBeenCalledWith({
      id: 'item-1',
      syncStatus: 'synced',
    });
  });

  it('marks pending_update items as synced', async () => {
    const storage = makeStoragePlugin();
    const items = [makeStoredItem({ id: 'item-1', syncStatus: 'pending_update' })];

    await markPushedAsSynced(storage, items);

    expect(storage.updateSyncStatus).toHaveBeenCalledWith({
      id: 'item-1',
      syncStatus: 'synced',
    });
  });

  it('deletes pending_delete items from local storage', async () => {
    const storage = makeStoragePlugin();
    const items = [makeStoredItem({ id: 'item-1', syncStatus: 'pending_delete' })];

    await markPushedAsSynced(storage, items);

    expect(storage.deleteItem).toHaveBeenCalledWith({ id: 'item-1' });
    expect(storage.updateSyncStatus).not.toHaveBeenCalled();
  });

  it('handles empty items array', async () => {
    const storage = makeStoragePlugin();
    await markPushedAsSynced(storage, []);
    expect(storage.updateSyncStatus).not.toHaveBeenCalled();
    expect(storage.deleteItem).not.toHaveBeenCalled();
  });
});

// ─── performSync ──────────────────────────────────────────────────────────────

describe('performSync', () => {
  it('pushes pending items and pulls server changes', async () => {
    const pendingItem = makeStoredItem({ id: 'item-1', syncStatus: 'pending_create' });
    const storage = makeStoragePlugin({
      getPendingItems: vi.fn().mockResolvedValue({ items: [pendingItem] }),
      getLastSyncTimestamp: vi.fn().mockResolvedValue({ timestamp: '2024-01-01T00:00:00.000Z' }),
    });

    const pushFn = vi.fn().mockResolvedValue({
      results: [{ itemId: 'item-1', status: 'ok', serverRevisionDate: pendingItem.revisionDate }],
      serverTimestamp: '2024-06-01T00:00:00.000Z',
    });
    const pullFn = vi.fn().mockResolvedValue({
      added: [makeSyncItem({ id: 'server-item' })],
      modified: [],
      deleted: [],
      folders: [],
      serverTimestamp: '2024-06-01T00:00:00.000Z',
    } as SyncResponse);

    const result = await performSync(storage, pushFn, pullFn);

    expect(pushFn).toHaveBeenCalledOnce();
    expect(pullFn).toHaveBeenCalledWith('2024-01-01T00:00:00.000Z');
    expect(result.pushed).toBe(1);
    expect(result.pulled).toBe(1);
    expect(result.timestamp).toBe('2024-06-01T00:00:00.000Z');
  });

  it('keeps conflicted pushes pending and reports the conflict', async () => {
    const pendingItem = makeStoredItem({ id: 'item-1', syncStatus: 'pending_update' });
    const storage = makeStoragePlugin({
      getPendingItems: vi.fn().mockResolvedValue({ items: [pendingItem] }),
    });
    const pushFn = vi.fn().mockResolvedValue({
      results: [
        {
          itemId: 'item-1',
          status: 'conflict',
          serverRevisionDate: '2024-05-01T00:00:00.000Z',
        },
      ],
      serverTimestamp: '2024-06-01T00:00:00.000Z',
    });
    const pullFn = vi.fn().mockResolvedValue({
      added: [],
      modified: [],
      deleted: [],
      folders: [],
      serverTimestamp: '2024-06-01T00:00:00.000Z',
    } as SyncResponse);

    const result = await performSync(storage, pushFn, pullFn);

    expect(result.pushed).toBe(0);
    expect(result.conflicts).toBe(1);
    expect(storage.updateSyncStatus).not.toHaveBeenCalled();
    expect(storage.deleteItem).not.toHaveBeenCalled();
  });

  it('skips push when no pending items', async () => {
    const storage = makeStoragePlugin({
      getPendingItems: vi.fn().mockResolvedValue({ items: [] }),
      getLastSyncTimestamp: vi.fn().mockResolvedValue({ timestamp: null }),
    });

    const pushFn = vi.fn().mockResolvedValue(undefined);
    const pullFn = vi.fn().mockResolvedValue({
      added: [],
      modified: [],
      deleted: [],
      folders: [],
      serverTimestamp: '2024-06-01T00:00:00.000Z',
    } as SyncResponse);

    const result = await performSync(storage, pushFn, pullFn);

    expect(pushFn).not.toHaveBeenCalled();
    expect(pullFn).toHaveBeenCalledWith(undefined); // no since timestamp
    expect(result.pushed).toBe(0);
  });

  it('passes since timestamp to pull function', async () => {
    const storage = makeStoragePlugin({
      getPendingItems: vi.fn().mockResolvedValue({ items: [] }),
      getLastSyncTimestamp: vi.fn().mockResolvedValue({ timestamp: '2024-03-15T10:00:00.000Z' }),
    });

    const pushFn = vi.fn().mockResolvedValue(undefined);
    const pullFn = vi.fn().mockResolvedValue({
      added: [],
      modified: [],
      deleted: [],
      folders: [],
      serverTimestamp: '2024-06-01T00:00:00.000Z',
    } as SyncResponse);

    await performSync(storage, pushFn, pullFn);

    expect(pullFn).toHaveBeenCalledWith('2024-03-15T10:00:00.000Z');
  });

  it('returns sync result with correct counts', async () => {
    const storage = makeStoragePlugin({
      getPendingItems: vi.fn().mockResolvedValue({ items: [] }),
      getLastSyncTimestamp: vi.fn().mockResolvedValue({ timestamp: null }),
    });

    const pushFn = vi.fn().mockResolvedValue(undefined);
    const pullFn = vi.fn().mockResolvedValue({
      added: [makeSyncItem({ id: 'a1' }), makeSyncItem({ id: 'a2' })],
      modified: [makeSyncItem({ id: 'm1' })],
      deleted: ['d1'],
      folders: [],
      serverTimestamp: '2024-06-01T00:00:00.000Z',
    } as SyncResponse);

    const result = await performSync(storage, pushFn, pullFn);

    expect(result.pushed).toBe(0);
    expect(result.pulled).toBe(4); // 2 added + 1 modified + 1 deleted
    expect(result.conflicts).toBe(0);
  });
});

// ─── sharedItems / sharedFolders in sync ─────────────────────────────────────

describe('performSync with shared items', () => {
  it('returns sharedItemsPulled count when server includes shared items', async () => {
    const storage = makeStoragePlugin({
      getPendingItems: vi.fn().mockResolvedValue({ items: [] }),
      getLastSyncTimestamp: vi.fn().mockResolvedValue({ timestamp: null }),
    });

    const pushFn = vi.fn().mockResolvedValue(undefined);
    const pullFn = vi.fn().mockResolvedValue({
      added: [],
      modified: [],
      deleted: [],
      folders: [],
      sharedItems: [
        makeSyncItem({ id: 'shared-1' }),
        makeSyncItem({ id: 'shared-2' }),
        makeSyncItem({ id: 'shared-3' }),
      ],
      sharedFolders: [
        { folderId: 'f1', teamId: 't1', ownerUserId: 'u1', permissionLevel: 'read_write', folderName: 'Shared', createdAt: '2024-01-01T00:00:00.000Z' } satisfies SyncSharedFolder,
      ],
      serverTimestamp: '2024-06-01T00:00:00.000Z',
    } as SyncResponse);

    const result = await performSync(storage, pushFn, pullFn);

    expect(result.sharedItemsPulled).toBe(3);
    expect(result.pushed).toBe(0);
    expect(result.pulled).toBe(0);
  });

  it('returns 0 sharedItemsPulled when server omits shared items', async () => {
    const storage = makeStoragePlugin({
      getPendingItems: vi.fn().mockResolvedValue({ items: [] }),
      getLastSyncTimestamp: vi.fn().mockResolvedValue({ timestamp: null }),
    });

    const pushFn = vi.fn().mockResolvedValue(undefined);
    const pullFn = vi.fn().mockResolvedValue({
      added: [],
      modified: [],
      deleted: [],
      folders: [],
      serverTimestamp: '2024-06-01T00:00:00.000Z',
    } as SyncResponse);

    const result = await performSync(storage, pushFn, pullFn);

    expect(result.sharedItemsPulled).toBe(0);
  });

  it('returns 0 sharedItemsPulled when sharedItems is empty array', async () => {
    const storage = makeStoragePlugin({
      getPendingItems: vi.fn().mockResolvedValue({ items: [] }),
      getLastSyncTimestamp: vi.fn().mockResolvedValue({ timestamp: null }),
    });

    const pushFn = vi.fn().mockResolvedValue(undefined);
    const pullFn = vi.fn().mockResolvedValue({
      added: [],
      modified: [],
      deleted: [],
      folders: [],
      sharedItems: [],
      sharedFolders: [],
      serverTimestamp: '2024-06-01T00:00:00.000Z',
    } as SyncResponse);

    const result = await performSync(storage, pushFn, pullFn);

    expect(result.sharedItemsPulled).toBe(0);
  });
});
