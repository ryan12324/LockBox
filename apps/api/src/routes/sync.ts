/**
 * Delta sync routes — GET /api/sync and POST /api/sync/push.
 * Returns encrypted vault items as opaque blobs — server never decrypts.
 */

import { Hono } from 'hono';
import { eq, and, gte, sql } from 'drizzle-orm';
import { createDb } from '../db/index.js';
import { vaultItems, folders, users, sharedFolders, sharedFolderKeys, teamMembers } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import { VALID_TYPES } from './vault.js';
import { serializeFolder, serializeVaultItem } from '../services/vault-serialization.js';
import { insertVaultVersion, trimVaultVersions } from '../services/vault-versions.js';

type Bindings = { DB: D1Database };
type Variables = { userId: string };

export const syncRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const MAX_SYNC_CHANGES = 500;
const MAX_ENCRYPTED_ITEM_LENGTH = 900_000;

function isValidRevisionDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isValidEncryptedData(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 3 || value.length > MAX_ENCRYPTED_ITEM_LENGTH) {
    return false;
  }
  const parts = value.split('.');
  return parts.length === 2 && parts.every((part) => part.length > 0);
}

function isValidItemId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
}

function isValidTags(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 100 &&
    value.every((tag) => typeof tag === 'string' && tag.length <= 100)
  );
}

function hasValidMetadata(change: {
  folderId?: unknown;
  tags?: unknown;
  favorite?: unknown;
}): boolean {
  return (
    (change.folderId === undefined ||
      change.folderId === null ||
      typeof change.folderId === 'string') &&
    (change.tags === undefined || isValidTags(change.tags)) &&
    (change.favorite === undefined || typeof change.favorite === 'boolean')
  );
}

syncRoutes.use('*', authMiddleware);

// ─── GET /api/sync ────────────────────────────────────────────────────────────

syncRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const since = c.req.query('since');
  const db = createDb(c.env.DB);
  const serverTimestamp = new Date().toISOString();

  if (since && !isValidRevisionDate(since)) {
    return c.json({ error: 'since must be a canonical ISO 8601 timestamp' }, 400);
  }

  if (!since) {
    // Initial sync — return everything
    const items = await db.select().from(vaultItems).where(eq(vaultItems.userId, userId));
    const userFolders = await db.select().from(folders).where(eq(folders.userId, userId));

    const active = items.filter((i) => !i.deletedAt);
    const deleted = items.filter((i) => i.deletedAt).map((i) => i.id);

    // Fetch shared items
    const sharedFolderRows = await db
      .select({
        folderId: sharedFolders.folderId,
        teamId: sharedFolders.teamId,
        ownerUserId: sharedFolders.ownerUserId,
        permissionLevel: sharedFolders.permissionLevel,
        folderName: folders.name,
      })
      .from(sharedFolders)
      .innerJoin(folders, eq(folders.id, sharedFolders.folderId))
      .innerJoin(teamMembers, and(
        eq(teamMembers.teamId, sharedFolders.teamId),
        eq(teamMembers.userId, userId),
      ));

    const sharedFolderIds = [...new Set(sharedFolderRows.map((sf) => sf.folderId))];
    let sharedItems: typeof items = [];
    for (const sfId of sharedFolderIds) {
      const folderItems = await db.select().from(vaultItems).where(eq(vaultItems.folderId, sfId));
      sharedItems = sharedItems.concat(folderItems.filter((i) => !i.deletedAt));
    }

    // Travel mode filtering
    const user = await db.select({ travelMode: users.travelMode })
      .from(users).where(eq(users.id, userId)).get();
    const isTravelMode = user?.travelMode === 1;

    if (isTravelMode) {
      const safeFolderIds = userFolders
        .filter((f) => f.travelSafe === 1)
        .map((f) => f.id);
      const filteredActive = active.filter((i) =>
        !i.folderId || safeFolderIds.includes(i.folderId)
      );
      const filteredDeleted = items
        .filter((i) => i.deletedAt && (!i.folderId || safeFolderIds.includes(i.folderId)))
        .map((i) => i.id);
      const filteredFolders = userFolders.filter((f) => f.travelSafe === 1);

      return c.json({
        added: filteredActive.map(serializeVaultItem),
        modified: [],
        deleted: filteredDeleted,
        folders: filteredFolders.map(serializeFolder),
        // Shared folders do not have a travel-safe designation. Fail closed so
        // entering travel mode never syncs shared vault ciphertext or metadata.
        sharedItems: [],
        sharedFolders: [],
        serverTimestamp,
      });
    }

    return c.json({
      added: active.map(serializeVaultItem),
      modified: [],
      deleted,
      folders: userFolders.map(serializeFolder),
      sharedItems: sharedItems.map(serializeVaultItem),
      sharedFolders: sharedFolderRows,
      serverTimestamp,
    });
  }

  // Delta sync — items modified after `since`
  const changedItems = await db
    .select()
    .from(vaultItems)
    .where(
      and(
        eq(vaultItems.userId, userId),
        gte(
          sql<string>`coalesce(${vaultItems.serverModifiedAt}, ${vaultItems.revisionDate})`,
          since
        )
      )
    );

  const userFolders = await db.select().from(folders).where(eq(folders.userId, userId));

  const added = changedItems.filter((i) => !i.deletedAt && i.createdAt > since);
  const modified = changedItems.filter((i) => !i.deletedAt && i.createdAt <= since);
  const deleted = changedItems.filter((i) => i.deletedAt).map((i) => i.id);

  // Fetch shared items (delta)
  const sharedFolderRows = await db
    .select({
      folderId: sharedFolders.folderId,
      teamId: sharedFolders.teamId,
      ownerUserId: sharedFolders.ownerUserId,
      permissionLevel: sharedFolders.permissionLevel,
      folderName: folders.name,
    })
    .from(sharedFolders)
    .innerJoin(folders, eq(folders.id, sharedFolders.folderId))
    .innerJoin(teamMembers, and(
      eq(teamMembers.teamId, sharedFolders.teamId),
      eq(teamMembers.userId, userId),
    ));

  const sharedFolderIds = [...new Set(sharedFolderRows.map((sf) => sf.folderId))];
  let sharedItems: typeof changedItems = [];
  for (const sfId of sharedFolderIds) {
    const folderItems = await db
      .select()
      .from(vaultItems)
      .where(
        and(
          eq(vaultItems.folderId, sfId),
          gte(
            sql<string>`coalesce(${vaultItems.serverModifiedAt}, ${vaultItems.revisionDate})`,
            since
          )
        )
      );
    sharedItems = sharedItems.concat(folderItems);
  }

  // Travel mode filtering
  const user = await db.select({ travelMode: users.travelMode })
    .from(users).where(eq(users.id, userId)).get();
  const isTravelMode = user?.travelMode === 1;

  if (isTravelMode) {
    const safeFolderIds = userFolders
      .filter((f) => f.travelSafe === 1)
      .map((f) => f.id);
    const filteredAdded = added.filter((i) =>
      !i.folderId || safeFolderIds.includes(i.folderId)
    );
    const filteredModified = modified.filter((i) =>
      !i.folderId || safeFolderIds.includes(i.folderId)
    );
    const filteredDeleted = changedItems
      .filter((i) => i.deletedAt && (!i.folderId || safeFolderIds.includes(i.folderId)))
      .map((i) => i.id);
    const filteredFolders = userFolders.filter((f) => f.travelSafe === 1);

    return c.json({
      added: filteredAdded.map(serializeVaultItem),
      modified: filteredModified.map(serializeVaultItem),
      deleted: filteredDeleted,
      folders: filteredFolders.map(serializeFolder),
      sharedItems: [],
      sharedFolders: [],
      serverTimestamp,
    });
  }

  return c.json({
    added: added.map(serializeVaultItem),
    modified: modified.map(serializeVaultItem),
    deleted,
    folders: userFolders.map(serializeFolder),
    sharedItems: sharedItems.map(serializeVaultItem),
    sharedFolders: sharedFolderRows,
    serverTimestamp,
  });
});

// ─── POST /api/sync/push ──────────────────────────────────────────────────────

syncRoutes.post('/push', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);

  const { changes } = body as {
    changes: Array<{
      operation: 'create' | 'update' | 'delete';
      itemId?: string;
      encryptedData?: string;
      type?: string;
      folderId?: string | null;
      tags?: string[];
      favorite?: boolean;
      revisionDate?: string;
      expectedRevisionDate?: string;
    }>;
  };

  if (!Array.isArray(changes) || changes.length > MAX_SYNC_CHANGES) {
    return c.json({ error: `changes must be an array with at most ${MAX_SYNC_CHANGES} entries` }, 400);
  }

  const db = createDb(c.env.DB);
  const serverTimestamp = new Date().toISOString();
  const results: Array<{ itemId: string; status: 'ok' | 'conflict'; serverRevisionDate: string }> =
    [];

  for (const change of changes) {
    const now = new Date().toISOString();

    if (
      !change ||
      typeof change !== 'object' ||
      !['create', 'update', 'delete'].includes(change.operation) ||
      !hasValidMetadata(change) ||
      (change.itemId !== undefined && !isValidItemId(change.itemId))
    ) {
      results.push({ itemId: '', status: 'conflict', serverRevisionDate: '' });
      continue;
    }

    if (change.operation === 'create') {
      const itemType = change.type;
      if (
        typeof itemType !== 'string' ||
        !VALID_TYPES.includes(itemType as typeof VALID_TYPES[number])
      ) {
        results.push({ itemId: change.itemId || '', status: 'conflict', serverRevisionDate: '' });
        continue;
      }
      if (
        !isValidItemId(change.itemId) ||
        !isValidEncryptedData(change.encryptedData) ||
        !isValidRevisionDate(change.revisionDate)
      ) {
        results.push({ itemId: change.itemId || '', status: 'conflict', serverRevisionDate: '' });
        continue;
      }
      if (change.folderId) {
        const ownedFolder = await db
          .select({ id: folders.id })
          .from(folders)
          .where(and(eq(folders.id, change.folderId), eq(folders.userId, userId)))
          .get();
        if (!ownedFolder) {
          results.push({ itemId: change.itemId, status: 'conflict', serverRevisionDate: '' });
          continue;
        }
      }
      const id = change.itemId || crypto.randomUUID();
      const inserted = await db
        .insert(vaultItems)
        .values({
          id,
          userId,
          type: itemType,
          encryptedData: change.encryptedData,
          folderId: change.folderId ?? null,
          tags: change.tags ? JSON.stringify(change.tags) : null,
          favorite: change.favorite ? 1 : 0,
          revisionDate: change.revisionDate,
          serverModifiedAt: now,
          createdAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: vaultItems.id });
      if (inserted.length === 0) {
        results.push({ itemId: id, status: 'conflict', serverRevisionDate: '' });
        continue;
      }
      results.push({ itemId: id, status: 'ok', serverRevisionDate: change.revisionDate });
    } else if (change.operation === 'update' && change.itemId) {
      const existing = await db
        .select()
        .from(vaultItems)
        .where(and(eq(vaultItems.id, change.itemId), eq(vaultItems.userId, userId)))
        .get();

      if (!existing) {
        results.push({ itemId: change.itemId, status: 'conflict', serverRevisionDate: '' });
        continue;
      }

      // Duplicated metadata is authenticated inside encryptedData. Every update
      // must therefore replace the ciphertext and its AAD-bound revision.
      if (
        !isValidEncryptedData(change.encryptedData) ||
        !isValidRevisionDate(change.revisionDate) ||
        !isValidRevisionDate(change.expectedRevisionDate) ||
        change.expectedRevisionDate !== existing.revisionDate
      ) {
        results.push({ itemId: change.itemId, status: 'conflict', serverRevisionDate: existing.revisionDate });
        continue;
      }
      if (change.folderId) {
        const ownedFolder = await db
          .select({ id: folders.id })
          .from(folders)
          .where(and(eq(folders.id, change.folderId), eq(folders.userId, userId)))
          .get();
        if (!ownedFolder) {
          results.push({ itemId: change.itemId, status: 'conflict', serverRevisionDate: existing.revisionDate });
          continue;
        }
      }

      const [, updatedRows] = await db.batch([
        insertVaultVersion(db, existing, now),
        db
          .update(vaultItems)
          .set({
            encryptedData: change.encryptedData,
            folderId: change.folderId !== undefined ? change.folderId : existing.folderId,
            tags: change.tags !== undefined ? JSON.stringify(change.tags) : existing.tags,
            favorite: change.favorite !== undefined ? (change.favorite ? 1 : 0) : existing.favorite,
            revisionDate: change.revisionDate,
            serverModifiedAt: now,
          })
          .where(
            and(
              eq(vaultItems.id, change.itemId),
              eq(vaultItems.userId, userId),
              eq(vaultItems.revisionDate, change.expectedRevisionDate)
            )
          )
          .returning({ id: vaultItems.id }),
      ]);
      await trimVaultVersions(db, change.itemId);

      if (updatedRows.length === 0) {
        const current = await db
          .select({ revisionDate: vaultItems.revisionDate })
          .from(vaultItems)
          .where(and(eq(vaultItems.id, change.itemId), eq(vaultItems.userId, userId)))
          .get();
        results.push({
          itemId: change.itemId,
          status: 'conflict',
          serverRevisionDate: current?.revisionDate ?? '',
        });
        continue;
      }

      results.push({ itemId: change.itemId, status: 'ok', serverRevisionDate: change.revisionDate });
    } else if (change.operation === 'delete' && change.itemId) {
      const existing = await db
        .select()
        .from(vaultItems)
        .where(and(eq(vaultItems.id, change.itemId), eq(vaultItems.userId, userId)))
        .get();

      if (!existing) {
        results.push({ itemId: change.itemId, status: 'conflict', serverRevisionDate: '' });
        continue;
      }

      await db
        .update(vaultItems)
        .set({ deletedAt: now, serverModifiedAt: now })
        .where(eq(vaultItems.id, change.itemId));

      results.push({ itemId: change.itemId, status: 'ok', serverRevisionDate: existing.revisionDate });
    }
  }

  return c.json({ results, serverTimestamp });
});

// ─── POST /api/sync/push-shared ──────────────────────────────────────────────

syncRoutes.post('/push-shared', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);

  const { folderId, changes } = body as {
    folderId: string;
    changes: Array<{
      operation: 'create' | 'update' | 'delete';
      itemId?: string;
      encryptedData?: string;
      type?: string;
      tags?: string[];
      favorite?: boolean;
      revisionDate?: string;
      expectedRevisionDate?: string;
    }>;
  };

  if (!isValidItemId(folderId)) return c.json({ error: 'Invalid folderId' }, 400);
  if (!Array.isArray(changes) || changes.length > MAX_SYNC_CHANGES) {
    return c.json({ error: `changes must be an array with at most ${MAX_SYNC_CHANGES} entries` }, 400);
  }

  const db = createDb(c.env.DB);

  // Check user has write access to this shared folder
  const key = await db
    .select()
    .from(sharedFolderKeys)
    .where(and(eq(sharedFolderKeys.folderId, folderId), eq(sharedFolderKeys.userId, userId)))
    .get();

  if (!key) return c.json({ error: 'No access to this shared folder' }, 403);

  // Check permission level along a team membership that belongs to this user.
  const accessRows = await db
    .select({
      ownerUserId: sharedFolders.ownerUserId,
      permissionLevel: sharedFolders.permissionLevel,
    })
    .from(sharedFolders)
    .innerJoin(
      teamMembers,
      and(
        eq(teamMembers.teamId, sharedFolders.teamId),
        eq(teamMembers.userId, userId)
      )
    )
    .where(eq(sharedFolders.folderId, folderId));

  const writableAccess = accessRows.find((share) => share.permissionLevel === 'read_write');
  if (!writableAccess) {
    return c.json({ error: 'Read-only access — cannot push changes' }, 403);
  }

  // Find the folder owner for item attribution
  const folderOwner = writableAccess.ownerUserId;

  const serverTimestamp = new Date().toISOString();
  const results: Array<{ itemId: string; status: 'ok' | 'conflict'; serverRevisionDate: string }> =
    [];

  for (const change of changes) {
    const now = new Date().toISOString();

    if (
      !change ||
      typeof change !== 'object' ||
      !['create', 'update', 'delete'].includes(change.operation) ||
      !hasValidMetadata(change) ||
      (change.itemId !== undefined && !isValidItemId(change.itemId))
    ) {
      results.push({ itemId: '', status: 'conflict', serverRevisionDate: '' });
      continue;
    }

    if (change.operation === 'create') {
      const itemType = change.type;
      if (
        typeof itemType !== 'string' ||
        !VALID_TYPES.includes(itemType as typeof VALID_TYPES[number])
      ) {
        results.push({ itemId: change.itemId || '', status: 'conflict', serverRevisionDate: '' });
        continue;
      }
      if (
        !isValidItemId(change.itemId) ||
        !isValidEncryptedData(change.encryptedData) ||
        !isValidRevisionDate(change.revisionDate)
      ) {
        results.push({ itemId: change.itemId || '', status: 'conflict', serverRevisionDate: '' });
        continue;
      }
      const id = change.itemId || crypto.randomUUID();
      const inserted = await db
        .insert(vaultItems)
        .values({
          id,
          userId: folderOwner,
          type: itemType,
          encryptedData: change.encryptedData,
          folderId,
          tags: change.tags ? JSON.stringify(change.tags) : null,
          favorite: change.favorite ? 1 : 0,
          revisionDate: change.revisionDate,
          serverModifiedAt: now,
          createdAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: vaultItems.id });
      if (inserted.length === 0) {
        results.push({ itemId: id, status: 'conflict', serverRevisionDate: '' });
        continue;
      }
      results.push({ itemId: id, status: 'ok', serverRevisionDate: change.revisionDate });
    } else if (change.operation === 'update' && change.itemId) {
      const existing = await db
        .select()
        .from(vaultItems)
        .where(and(eq(vaultItems.id, change.itemId), eq(vaultItems.folderId, folderId)))
        .get();

      if (!existing) {
        results.push({ itemId: change.itemId, status: 'conflict', serverRevisionDate: '' });
        continue;
      }

      if (
        !isValidEncryptedData(change.encryptedData) ||
        !isValidRevisionDate(change.revisionDate) ||
        !isValidRevisionDate(change.expectedRevisionDate) ||
        change.expectedRevisionDate !== existing.revisionDate
      ) {
        results.push({ itemId: change.itemId, status: 'conflict', serverRevisionDate: existing.revisionDate });
        continue;
      }

      const [, updatedRows] = await db.batch([
        insertVaultVersion(db, existing, now),
        db
          .update(vaultItems)
          .set({
            encryptedData: change.encryptedData,
            tags: change.tags !== undefined ? JSON.stringify(change.tags) : existing.tags,
            favorite: change.favorite !== undefined ? (change.favorite ? 1 : 0) : existing.favorite,
            revisionDate: change.revisionDate,
            serverModifiedAt: now,
          })
          .where(
            and(
              eq(vaultItems.id, change.itemId),
              eq(vaultItems.folderId, folderId),
              eq(vaultItems.revisionDate, change.expectedRevisionDate)
            )
          )
          .returning({ id: vaultItems.id }),
      ]);
      await trimVaultVersions(db, change.itemId);

      if (updatedRows.length === 0) {
        const current = await db
          .select({ revisionDate: vaultItems.revisionDate })
          .from(vaultItems)
          .where(and(eq(vaultItems.id, change.itemId), eq(vaultItems.folderId, folderId)))
          .get();
        results.push({
          itemId: change.itemId,
          status: 'conflict',
          serverRevisionDate: current?.revisionDate ?? '',
        });
        continue;
      }

      results.push({ itemId: change.itemId, status: 'ok', serverRevisionDate: change.revisionDate });
    } else if (change.operation === 'delete' && change.itemId) {
      const existing = await db
        .select()
        .from(vaultItems)
        .where(and(eq(vaultItems.id, change.itemId), eq(vaultItems.folderId, folderId)))
        .get();

      if (!existing) {
        results.push({ itemId: change.itemId, status: 'conflict', serverRevisionDate: '' });
        continue;
      }

      await db
        .update(vaultItems)
        .set({ deletedAt: now, serverModifiedAt: now })
        .where(eq(vaultItems.id, change.itemId));

      results.push({ itemId: change.itemId, status: 'ok', serverRevisionDate: existing.revisionDate });
    }
  }

  return c.json({ results, serverTimestamp });
});
