/**
 * Offline Sync Queue — manages offline-first vault synchronization.
 *
 * Architecture:
 * - All vault operations go to local Room DB first (via StoragePlugin)
 * - Items are tagged with syncStatus: synced | pending_create | pending_update | pending_delete
 * - When network is available, pending items are pushed to server
 * - Server responses (SyncResponse) are merged into local DB
 * - Conflict resolution: server wins (last-write-wins by revisionDate)
 */

import type { SyncStatus, StoragePlugin, StoredVaultItem } from '../plugins/storage';

/** Server sync response shape (matches @lockbox/types SyncResponse) */
export interface SyncResponse {
  added: SyncVaultItem[];
  modified: SyncVaultItem[];
  deleted: string[];
  folders: SyncFolder[];
  serverTimestamp: string;
  sharedItems?: SyncVaultItem[];
  sharedFolders?: SyncSharedFolder[];
}

/** Encrypted vault item from server */
export interface SyncVaultItem {
  id: string;
  type: string;
  encryptedData: string;
  revisionDate: string;
  folderId?: string | null;
  tags: string[] | string | null;
  favorite: boolean | number;
}

/** Folder from server */
export interface SyncFolder {
  id: string;
  name: string;
  parentId?: string;
  createdAt: string;
}

/** Shared folder metadata from server */
export interface SyncSharedFolder {
  folderId: string;
  teamId: string;
  ownerUserId: string;
  permissionLevel: string;
  folderName: string;
  createdAt: string;
}

/** Push payload for pending changes */
export interface PushPayload {
  changes: Array<{
    operation: 'create' | 'update' | 'delete';
    itemId: string;
    type?: string;
    encryptedData?: string;
    folderId?: string | null;
    tags?: string[];
    favorite?: boolean;
    revisionDate?: string;
    expectedRevisionDate?: string;
  }>;
}

export interface PushResponse {
  results: Array<{
    itemId: string;
    status: 'ok' | 'conflict';
    serverRevisionDate: string;
  }>;
  serverTimestamp: string;
}

/** Sync result returned to the caller */
export interface SyncResult {
  pushed: number;
  pulled: number;
  conflicts: number;
  timestamp: string;
  sharedItemsPulled: number;
}

/**
 * Build a push payload from locally pending items.
 * Converts local sync states to the API's ordered `changes` contract.
 */
export function buildPushPayload(pendingItems: StoredVaultItem[]): PushPayload {
  const changes: PushPayload['changes'] = [];

  for (const item of pendingItems) {
    switch (item.syncStatus) {
      case 'pending_create':
        changes.push({
          operation: 'create',
          itemId: item.id,
          type: item.type,
          encryptedData: item.encryptedData,
          folderId: item.folderId ?? null,
          tags: item.tags,
          favorite: item.favorite,
          revisionDate: item.revisionDate,
        });
        break;
      case 'pending_update':
        changes.push({
          operation: 'update',
          itemId: item.id,
          encryptedData: item.encryptedData,
          folderId: item.folderId ?? null,
          tags: item.tags,
          favorite: item.favorite,
          revisionDate: item.revisionDate,
          expectedRevisionDate: item.baseRevisionDate ?? undefined,
        });
        break;
      case 'pending_delete':
        changes.push({ operation: 'delete', itemId: item.id });
        break;
    }
  }

  return { changes };
}

function normalizeTags(tags: SyncVaultItem['tags']): string[] {
  if (Array.isArray(tags)) return tags.filter((tag): tag is string => typeof tag === 'string');
  if (typeof tags !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(tags);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === 'string')
      : [];
  } catch {
    return [];
  }
}

/**
 * Merge a server SyncResponse into local storage.
 * - Added items are inserted with syncStatus='synced'
 * - Modified items overwrite local (server wins on conflict)
 * - Deleted items are removed from local storage
 *
 * Returns count of conflicts detected (local pending vs server modified).
 */
export async function mergeSyncResponse(
  storage: StoragePlugin,
  response: SyncResponse,
): Promise<{ pulled: number; conflicts: number }> {
  let pulled = 0;
  let conflicts = 0;

  // Process added items — insert as synced
  if (response.added.length > 0) {
    const items = response.added.map((item) => ({
      id: item.id,
      encryptedData: item.encryptedData,
      type: item.type,
      folderId: item.folderId,
      tags: normalizeTags(item.tags),
      favorite: item.favorite === true || item.favorite === 1,
      revisionDate: item.revisionDate,
      baseRevisionDate: item.revisionDate,
      syncStatus: 'synced' as SyncStatus,
    }));
    await storage.batchUpsert({ items });
    pulled += response.added.length;
  }

  // Process modified items — check for conflicts then batch overwrite
  if (response.modified.length > 0) {
    // Parallel conflict detection: fetch all local items at once
    const localResults = await Promise.all(
      response.modified.map((item) => storage.getItem({ id: item.id }))
    );

    for (let i = 0; i < response.modified.length; i++) {
      const localItem = localResults[i].item;
      if (localItem && localItem.syncStatus !== 'synced') {
        // Conflict: local has pending changes, server also modified
        // Resolution: server wins (last-write-wins)
        conflicts++;
      }
    }

    // Batch upsert all modified items as synced
    await storage.batchUpsert({
      items: response.modified.map((serverItem) => ({
        id: serverItem.id,
        encryptedData: serverItem.encryptedData,
        type: serverItem.type,
        folderId: serverItem.folderId,
        tags: normalizeTags(serverItem.tags),
        favorite: serverItem.favorite === true || serverItem.favorite === 1,
        revisionDate: serverItem.revisionDate,
        baseRevisionDate: serverItem.revisionDate,
        syncStatus: 'synced' as SyncStatus,
      })),
    });
    pulled += response.modified.length;
  }

  // Process deleted items — remove from local
  for (const deletedId of response.deleted) {
    await storage.deleteItem({ id: deletedId });
    pulled++;
  }

  // Update last sync timestamp
  await storage.setLastSyncTimestamp({ timestamp: response.serverTimestamp });

  return { pulled, conflicts };
}

/**
 * Mark all pushed items as synced after successful push.
 */
export async function markPushedAsSynced(
  storage: StoragePlugin,
  pendingItems: StoredVaultItem[],
  successfulItemIds = new Set(pendingItems.map((item) => item.id)),
): Promise<void> {
  for (const item of pendingItems) {
    if (!successfulItemIds.has(item.id)) continue;
    if (item.syncStatus === 'pending_delete') {
      // Actually delete locally after server confirms
      await storage.deleteItem({ id: item.id });
    } else {
      await storage.updateSyncStatus({ id: item.id, syncStatus: 'synced' });
    }
  }
}

/**
 * Full sync orchestration.
 *
 * 1. Get pending local changes
 * 2. Push pending changes to server (if any)
 * 3. Pull server changes since last sync
 * 4. Merge server response into local DB
 * 5. Update last sync timestamp
 *
 * @param storage - StoragePlugin instance for local DB access
 * @param pushFn - Function to push local changes to server
 * @param pullFn - Function to pull server changes (takes optional since timestamp)
 */
export async function performSync(
  storage: StoragePlugin,
  pushFn: (payload: PushPayload) => Promise<PushResponse>,
  pullFn: (since?: string) => Promise<SyncResponse>,
): Promise<SyncResult> {
  // Step 1: Get pending local changes
  const pendingResult = await storage.getPendingItems();
  const pendingItems = pendingResult.items;

  let pushed = 0;
  let pushConflicts = 0;

  // Step 2: Push pending changes (if any)
  if (pendingItems.length > 0) {
    const payload = buildPushPayload(pendingItems);
    const pushResponse = await pushFn(payload);
    const successfulItemIds = new Set(
      pushResponse.results
        .filter((result) => result.status === 'ok')
        .map((result) => result.itemId)
    );
    await markPushedAsSynced(storage, pendingItems, successfulItemIds);
    pushed = successfulItemIds.size;
    pushConflicts = pushResponse.results.filter((result) => result.status === 'conflict').length;
  }

  // Step 3: Pull server changes
  const timestampResult = await storage.getLastSyncTimestamp();
  const since = timestampResult.timestamp ?? undefined;
  const response = await pullFn(since);

  // Step 4: Merge server response
  const { pulled, conflicts } = await mergeSyncResponse(storage, response);

  return {
    pushed,
    pulled,
    conflicts: conflicts + pushConflicts,
    sharedItemsPulled: (response.sharedItems ?? []).length,
    timestamp: response.serverTimestamp,
  };
}
