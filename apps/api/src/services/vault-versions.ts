import { asc, eq, sql } from 'drizzle-orm';
import type { Database } from '../db/index.js';
import { vaultItems, vaultItemVersions } from '../db/schema.js';

type VaultItemRecord = typeof vaultItems.$inferSelect;

/** Build a version insert that snapshots ciphertext and its duplicated metadata together. */
export function insertVaultVersion(
  db: Database,
  item: VaultItemRecord,
  createdAt: string
) {
  return db.insert(vaultItemVersions).values({
    id: crypto.randomUUID(),
    itemId: item.id,
    userId: item.userId,
    encryptedData: item.encryptedData,
    revisionDate: item.revisionDate,
    folderId: item.folderId,
    tags: item.tags,
    favorite: item.favorite ?? 0,
    createdAt,
  });
}

/** Retain only the newest versions after an update transaction commits. */
export async function trimVaultVersions(db: Database, itemId: string, limit = 10) {
  const versionCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(vaultItemVersions)
    .where(eq(vaultItemVersions.itemId, itemId))
    .get();
  const excess = Math.max(0, Number(versionCount?.count ?? 0) - limit);
  if (excess === 0) return;

  const oldest = await db
    .select({ id: vaultItemVersions.id })
    .from(vaultItemVersions)
    .where(eq(vaultItemVersions.itemId, itemId))
    .orderBy(asc(vaultItemVersions.createdAt))
    .limit(excess);
  for (const version of oldest) {
    await db.delete(vaultItemVersions).where(eq(vaultItemVersions.id, version.id));
  }
}
