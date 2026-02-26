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
}

/** Encrypted vault item from server */
export interface SyncVaultItem {
  id: string;
  type: string;
  encryptedData: string;
  iv: string;
  revisionDate: string;
  folderId?: string;
  tags: string[];
  favorite: boolean;
}

/** Folder from server */
export interface SyncFolder {
  id: string;
  name: string;
  parentId?: string;
  createdAt: string;
}

/** Push payload for pending changes */
export interface PushPayload {
  created: Array<{
    id: string;
    type: string;
    encryptedData: string;
    iv: string;
    folderId?: string;
    tags?: string[];
    favorite?: boolean;
  }>;
  updated: Array<{
    id: string;
    encryptedData: string;
    iv: string;
    folderId?: string;
    tags?: string[];
    favorite?: boolean;
  }>;
  deleted: string[];
}

/** Sync result returned to the caller */
export interface SyncResult {
  pushed: number;
  pulled: number;
  conflicts: number;
  timestamp: string;
}

/**
 * Build a push payload from locally pending items.
 * Groups items by their syncStatus into created, updated, and deleted arrays.
 */
export function buildPushPayload(pendingItems: StoredVaultItem[]): PushPayload {
  const created: PushPayload['created'] = [];
  const updated: PushPayload['updated'] = [];
  const deleted: string[] = [];

  for (const item of pendingItems) {
    switch (item.syncStatus) {
      case 'pending_create':
        created.push({
          id: item.id,
          type: item.type,
          encryptedData: item.encryptedData,
          iv: item.iv,
          folderId: item.folderId,
          tags: item.tags.length > 0 ? item.tags : undefined,
          favorite: item.favorite || undefined,
        });
        break;
      case 'pending_update':
        updated.push({
          id: item.id,
          encryptedData: item.encryptedData,
          iv: item.iv,
          folderId: item.folderId,
          tags: item.tags.length > 0 ? item.tags : undefined,
          favorite: item.favorite || undefined,
        });
        break;
      case 'pending_delete':
        deleted.push(item.id);
        break;
    }
  }

  return { created, updated, deleted };
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
      iv: item.iv,
      folderId: item.folderId,
      tags: item.tags,
      favorite: item.favorite,
      revisionDate: item.revisionDate,
      syncStatus: 'synced' as SyncStatus,
    }));
    await storage.batchUpsert({ items });
    pulled += response.added.length;
  }

  // Process modified items — check for conflicts then overwrite
  for (const serverItem of response.modified) {
    const localResult = await storage.getItem({ id: serverItem.id });
    const localItem = localResult.item;

    if (localItem && localItem.syncStatus !== 'synced') {
      // Conflict: local has pending changes, server also modified
      // Resolution: server wins (last-write-wins)
      conflicts++;
    }

    await storage.upsertItem({
      id: serverItem.id,
      encryptedData: serverItem.encryptedData,
      type: serverItem.type,
      iv: serverItem.iv,
      folderId: serverItem.folderId,
      tags: serverItem.tags,
      favorite: serverItem.favorite,
      revisionDate: serverItem.revisionDate,
      syncStatus: 'synced',
    });
    pulled++;
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
): Promise<void> {
  for (const item of pendingItems) {
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
  pushFn: (payload: PushPayload) => Promise<void>,
  pullFn: (since?: string) => Promise<SyncResponse>,
): Promise<SyncResult> {
  // Step 1: Get pending local changes
  const pendingResult = await storage.getPendingItems();
  const pendingItems = pendingResult.items;

  let pushed = 0;

  // Step 2: Push pending changes (if any)
  if (pendingItems.length > 0) {
    const payload = buildPushPayload(pendingItems);
    await pushFn(payload);
    await markPushedAsSynced(storage, pendingItems);
    pushed = pendingItems.length;
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
    conflicts,
    timestamp: response.serverTimestamp,
  };
}
