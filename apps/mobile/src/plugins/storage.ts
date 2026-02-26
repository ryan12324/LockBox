/**
 * Storage Plugin — TypeScript bridge for native Android Room DB encrypted storage.
 *
 * Stores ONLY encrypted blobs — never decrypted vault data.
 * The Room database is shared with AutofillService (separate process).
 * Each item tracks syncStatus for offline-first operation.
 */

import { registerPlugin } from '@capacitor/core';

/** Sync status for offline-first operation */
export type SyncStatus =
  | 'synced'
  | 'pending_create'
  | 'pending_update'
  | 'pending_delete';

/** Stored vault item (encrypted blob + metadata) */
export interface StoredVaultItem {
  id: string;
  encryptedData: string;
  type: string;
  iv: string;
  folderId?: string;
  tags: string[];
  favorite: boolean;
  revisionDate: string;
  syncStatus: SyncStatus;
}

/** Result from listing stored items */
export interface StorageListResult {
  items: StoredVaultItem[];
}

/** Result from getting a single item */
export interface StorageGetResult {
  item: StoredVaultItem | null;
}

/** Result from getting pending sync items */
export interface StoragePendingResult {
  items: StoredVaultItem[];
}

/** Result from getting the last sync timestamp */
export interface StorageTimestampResult {
  timestamp: string | null;
}

/**
 * StoragePlugin interface — defines the contract between TypeScript and native Kotlin.
 *
 * All data stored is encrypted. The Room DB stores opaque encrypted blobs.
 * syncStatus field enables offline-first: items can be created/updated/deleted
 * while offline, then synced when connectivity returns.
 */
export interface StoragePlugin {
  /** Store or update an encrypted vault item */
  upsertItem(options: {
    id: string;
    encryptedData: string;
    type: string;
    iv: string;
    folderId?: string;
    tags?: string[];
    favorite?: boolean;
    revisionDate: string;
    syncStatus: SyncStatus;
  }): Promise<void>;

  /** Get a single encrypted vault item by ID */
  getItem(options: { id: string }): Promise<StorageGetResult>;

  /** List all encrypted vault items */
  listItems(): Promise<StorageListResult>;

  /** List items with pending sync operations */
  getPendingItems(): Promise<StoragePendingResult>;

  /** Delete an item from local storage */
  deleteItem(options: { id: string }): Promise<void>;

  /** Mark an item's sync status */
  updateSyncStatus(options: {
    id: string;
    syncStatus: SyncStatus;
  }): Promise<void>;

  /** Batch upsert items (used during full sync) */
  batchUpsert(options: { items: Array<{
    id: string;
    encryptedData: string;
    type: string;
    iv: string;
    folderId?: string;
    tags?: string[];
    favorite?: boolean;
    revisionDate: string;
    syncStatus: SyncStatus;
  }> }): Promise<void>;

  /** Store the last successful sync timestamp */
  setLastSyncTimestamp(options: { timestamp: string }): Promise<void>;

  /** Get the last successful sync timestamp */
  getLastSyncTimestamp(): Promise<StorageTimestampResult>;

  /** Clear all stored data (used on logout) */
  clearAll(): Promise<void>;
}

const Storage = registerPlugin<StoragePlugin>('Storage');

export { Storage };
