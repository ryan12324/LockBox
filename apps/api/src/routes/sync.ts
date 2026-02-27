/**
 * Delta sync routes — GET /api/sync and POST /api/sync/push.
 * Returns encrypted vault items as opaque blobs — server never decrypts.
 */

import { Hono } from 'hono';
import { eq, and, gt, isNotNull, or } from 'drizzle-orm';
import { createDb } from '../db/index.js';
import { vaultItems, folders, users, sharedFolders, sharedFolderKeys, teamMembers } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import { VALID_TYPES } from './vault.js';

type Bindings = { DB: D1Database };
type Variables = { userId: string };

export const syncRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

syncRoutes.use('*', authMiddleware);

// ─── GET /api/sync ────────────────────────────────────────────────────────────

syncRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const since = c.req.query('since');
  const db = createDb(c.env.DB);
  const serverTimestamp = new Date().toISOString();

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

    const sharedFolderIds = sharedFolderRows.map((sf) => sf.folderId);
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
        added: filteredActive,
        modified: [],
        deleted: filteredDeleted,
        folders: filteredFolders,
        sharedItems,
        sharedFolders: sharedFolderRows,
        serverTimestamp,
      });
    }

    return c.json({
      added: active,
      modified: [],
      deleted,
      folders: userFolders,
      sharedItems,
      sharedFolders: sharedFolderRows,
      serverTimestamp,
    });
  }

  // Delta sync — items modified after `since`
  const changedItems = await db
    .select()
    .from(vaultItems)
    .where(and(eq(vaultItems.userId, userId), or(gt(vaultItems.revisionDate, since), gt(vaultItems.deletedAt, since))));

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

  const sharedFolderIds = sharedFolderRows.map((sf) => sf.folderId);
  let sharedItems: typeof changedItems = [];
  for (const sfId of sharedFolderIds) {
    const folderItems = await db
      .select()
      .from(vaultItems)
      .where(and(eq(vaultItems.folderId, sfId), gt(vaultItems.revisionDate, since)));
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
      added: filteredAdded,
      modified: filteredModified,
      deleted: filteredDeleted,
      folders: filteredFolders,
      sharedItems,
      sharedFolders: sharedFolderRows,
      serverTimestamp,
    });
  }

  return c.json({
    added,
    modified,
    deleted,
    folders: userFolders,
    sharedItems,
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
      folderId?: string;
      tags?: string[];
      favorite?: boolean;
      revisionDate?: string;
    }>;
  };

  if (!Array.isArray(changes)) return c.json({ error: 'changes must be an array' }, 400);

  const db = createDb(c.env.DB);
  const serverTimestamp = new Date().toISOString();
  const results: Array<{ itemId: string; status: 'ok' | 'conflict'; serverRevisionDate: string }> =
    [];

  for (const change of changes) {
    const now = new Date().toISOString();

    if (change.operation === 'create') {
      const itemType = change.type ?? 'login';
      if (!VALID_TYPES.includes(itemType as typeof VALID_TYPES[number])) {
        results.push({ itemId: change.itemId || '', status: 'conflict', serverRevisionDate: '' });
        continue;
      }
      const id = change.itemId || crypto.randomUUID();
      await db.insert(vaultItems).values({
        id,
        userId,
        type: itemType,
        encryptedData: change.encryptedData ?? '',
        folderId: change.folderId ?? null,
        tags: change.tags ? JSON.stringify(change.tags) : null,
        favorite: change.favorite ? 1 : 0,
        revisionDate: (change.revisionDate as string) || now,
        createdAt: now,
      });
      results.push({ itemId: id, status: 'ok', serverRevisionDate: (change.revisionDate as string) || now });
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

      await db
        .update(vaultItems)
        .set({
          encryptedData: change.encryptedData ?? existing.encryptedData,
          folderId: change.folderId !== undefined ? change.folderId : existing.folderId,
          tags: change.tags !== undefined ? JSON.stringify(change.tags) : existing.tags,
          favorite: change.favorite !== undefined ? (change.favorite ? 1 : 0) : existing.favorite,
          revisionDate: (change.revisionDate as string) || now,
        })
        .where(eq(vaultItems.id, change.itemId));

      results.push({ itemId: change.itemId, status: 'ok', serverRevisionDate: (change.revisionDate as string) || now });
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
        .set({ deletedAt: now })
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
    }>;
  };

  if (!folderId || typeof folderId !== 'string') return c.json({ error: 'Missing folderId' }, 400);
  if (!Array.isArray(changes)) return c.json({ error: 'changes must be an array' }, 400);

  const db = createDb(c.env.DB);

  // Check user has write access to this shared folder
  const key = await db
    .select()
    .from(sharedFolderKeys)
    .where(and(eq(sharedFolderKeys.folderId, folderId), eq(sharedFolderKeys.userId, userId)))
    .get();

  if (!key) return c.json({ error: 'No access to this shared folder' }, 403);

  // Check permission level allows writes
  const share = await db
    .select()
    .from(sharedFolders)
    .where(eq(sharedFolders.folderId, folderId))
    .get();

  if (!share || share.permissionLevel === 'read_only') {
    return c.json({ error: 'Read-only access — cannot push changes' }, 403);
  }

  // Find the folder owner for item attribution
  const folderOwner = share.ownerUserId;

  const serverTimestamp = new Date().toISOString();
  const results: Array<{ itemId: string; status: 'ok' | 'conflict'; serverRevisionDate: string }> =
    [];

  for (const change of changes) {
    const now = new Date().toISOString();

    if (change.operation === 'create') {
      const itemType = change.type ?? 'login';
      if (!VALID_TYPES.includes(itemType as typeof VALID_TYPES[number])) {
        results.push({ itemId: change.itemId || '', status: 'conflict', serverRevisionDate: '' });
        continue;
      }
      const id = change.itemId || crypto.randomUUID();
      await db.insert(vaultItems).values({
        id,
        userId: folderOwner,
        type: itemType,
        encryptedData: change.encryptedData ?? '',
        folderId,
        tags: change.tags ? JSON.stringify(change.tags) : null,
        favorite: change.favorite ? 1 : 0,
        revisionDate: (change.revisionDate as string) || now,
        createdAt: now,
      });
      results.push({ itemId: id, status: 'ok', serverRevisionDate: (change.revisionDate as string) || now });
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

      await db
        .update(vaultItems)
        .set({
          encryptedData: change.encryptedData ?? existing.encryptedData,
          tags: change.tags !== undefined ? JSON.stringify(change.tags) : existing.tags,
          favorite: change.favorite !== undefined ? (change.favorite ? 1 : 0) : existing.favorite,
          revisionDate: (change.revisionDate as string) || now,
        })
        .where(eq(vaultItems.id, change.itemId));

      results.push({ itemId: change.itemId, status: 'ok', serverRevisionDate: (change.revisionDate as string) || now });
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
        .set({ deletedAt: now })
        .where(eq(vaultItems.id, change.itemId));

      results.push({ itemId: change.itemId, status: 'ok', serverRevisionDate: existing.revisionDate });
    }
  }

  return c.json({ results, serverTimestamp });
});
