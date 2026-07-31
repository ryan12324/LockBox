import { folders, vaultItems, vaultItemVersions } from '../db/schema.js';
import type { EncryptedVaultItem, Folder, VaultItemType, VaultItemVersion } from '@lockbox/types';

type StoredVaultItem = typeof vaultItems.$inferSelect;
type StoredFolder = typeof folders.$inferSelect;
type StoredVaultItemVersion = typeof vaultItemVersions.$inferSelect;

function parseTags(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === 'string')
      : [];
  } catch {
    return [];
  }
}

/** Convert D1-specific encodings to the public API representation. */
export function serializeVaultItem(item: StoredVaultItem): EncryptedVaultItem {
  return {
    id: item.id,
    type: item.type as VaultItemType,
    encryptedData: item.encryptedData,
    revisionDate: item.revisionDate,
    folderId: item.folderId,
    tags: parseTags(item.tags),
    favorite: item.favorite === 1,
    createdAt: item.createdAt,
    deletedAt: item.deletedAt,
  };
}

/** Keep ownership and D1 integer encodings out of the public folder shape. */
export function serializeFolder(folder: StoredFolder): Folder {
  return {
    id: folder.id,
    name: folder.name,
    ...(folder.parentId ? { parentId: folder.parentId } : {}),
    travelSafe: folder.travelSafe === 1,
    createdAt: folder.createdAt,
  };
}

/** Serialize the authenticated metadata that belongs to a historical ciphertext. */
export function serializeVaultVersion(version: StoredVaultItemVersion): VaultItemVersion {
  return {
    id: version.id,
    itemId: version.itemId,
    encryptedData: version.encryptedData,
    revisionDate: version.revisionDate,
    folderId: version.folderId,
    tags: parseTags(version.tags),
    favorite: version.favorite === 1,
    createdAt: version.createdAt,
  };
}
