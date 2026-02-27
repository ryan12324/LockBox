/**
 * Vault CRUD routes — all require auth middleware.
 * Server treats encryptedData as an opaque blob — never decrypts or inspects it.
 * All queries enforce userId ownership — returns 404 (not 403) for unauthorized access.
 */

import { Hono } from 'hono';
import { eq, and, isNull, isNotNull, desc, asc, sql } from 'drizzle-orm';
import { createDb } from '../db/index.js';
import { vaultItems, folders, vaultItemVersions } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';

export const VALID_TYPES = ['login', 'note', 'card', 'identity', 'passkey', 'document'] as const;

type Bindings = { DB: D1Database };
type Variables = { userId: string };

export const vaultRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All vault routes require authentication
vaultRoutes.use('*', authMiddleware);

// ─── GET /api/vault ───────────────────────────────────────────────────────────

vaultRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const db = createDb(c.env.DB);

  const folderId = c.req.query('folderId');
  const type = c.req.query('type');
  const favorite = c.req.query('favorite');

  // Build conditions
  const conditions = [eq(vaultItems.userId, userId), isNull(vaultItems.deletedAt)];
  if (folderId) conditions.push(eq(vaultItems.folderId, folderId));
  if (type) conditions.push(eq(vaultItems.type, type));
  if (favorite === '1') conditions.push(eq(vaultItems.favorite, 1));

  const items = await db
    .select()
    .from(vaultItems)
    .where(and(...conditions));

  const userFolders = await db.select().from(folders).where(eq(folders.userId, userId));

  return c.json({ items, folders: userFolders });
});

// ─── POST /api/vault/items ────────────────────────────────────────────────────

vaultRoutes.post('/items', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);

  const { id: clientId, type, encryptedData, folderId, tags, favorite, revisionDate: clientRevisionDate } = body as Record<string, unknown>;
  if (!type || !encryptedData) return c.json({ error: 'Missing required fields' }, 400);
  if (!VALID_TYPES.includes(type as typeof VALID_TYPES[number])) {
    return c.json({ error: 'Invalid item type' }, 400);
  }

  const db = createDb(c.env.DB);
  const now = new Date().toISOString();
  const id = (clientId as string) || crypto.randomUUID();

  await db.insert(vaultItems).values({
    id,
    userId,
    type: type as string,
    encryptedData: encryptedData as string,
    folderId: (folderId as string) ?? null,
    tags: tags ? JSON.stringify(tags) : null,
    favorite: favorite ? 1 : 0,
    revisionDate: (clientRevisionDate as string) || now,
    createdAt: now,
  });

  const item = await db.select().from(vaultItems).where(eq(vaultItems.id, id)).get();
  return c.json({ item }, 201);
});

// ─── PUT /api/vault/items/:id ─────────────────────────────────────────────────

vaultRoutes.put('/items/:id', async (c) => {
  const userId = c.get('userId');
  const itemId = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);

  const db = createDb(c.env.DB);

  // Verify ownership
  const existing = await db
    .select()
    .from(vaultItems)
    .where(and(eq(vaultItems.id, itemId), eq(vaultItems.userId, userId)))
    .get();
  if (!existing) return c.json({ error: 'Not found' }, 404);


  // Capture current version before update
  const versionId = crypto.randomUUID();
  const versionNow = new Date().toISOString();
  await db.insert(vaultItemVersions).values({
    id: versionId,
    itemId: itemId,
    userId: userId,
    encryptedData: existing.encryptedData,
    revisionDate: existing.revisionDate,
    createdAt: versionNow,
  });

  // Enforce max 10 versions per item
  const versionCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(vaultItemVersions)
    .where(eq(vaultItemVersions.itemId, itemId))
    .get();

  if (versionCount && versionCount.count > 10) {
    const oldest = await db
      .select({ id: vaultItemVersions.id })
      .from(vaultItemVersions)
      .where(eq(vaultItemVersions.itemId, itemId))
      .orderBy(asc(vaultItemVersions.createdAt))
      .limit(1)
      .get();
    if (oldest) {
      await db.delete(vaultItemVersions).where(eq(vaultItemVersions.id, oldest.id));
    }
  }

  const { encryptedData, folderId, tags, favorite, revisionDate: clientRevisionDate } = body as Record<string, unknown>;
  const now = new Date().toISOString();

  await db
    .update(vaultItems)
    .set({
      encryptedData: (encryptedData as string) ?? existing.encryptedData,
      folderId: folderId !== undefined ? (folderId as string | null) : existing.folderId,
      tags: tags !== undefined ? JSON.stringify(tags) : existing.tags,
      favorite: favorite !== undefined ? (favorite ? 1 : 0) : existing.favorite,
      revisionDate: (clientRevisionDate as string) || now,
    })
    .where(eq(vaultItems.id, itemId));

  const item = await db.select().from(vaultItems).where(eq(vaultItems.id, itemId)).get();
  return c.json({ item });
});

// ─── DELETE /api/vault/items/:id (soft delete) ────────────────────────────────

vaultRoutes.delete('/items/:id', async (c) => {
  const userId = c.get('userId');
  const itemId = c.req.param('id');
  const db = createDb(c.env.DB);

  const existing = await db
    .select()
    .from(vaultItems)
    .where(and(eq(vaultItems.id, itemId), eq(vaultItems.userId, userId)))
    .get();
  if (!existing) return c.json({ error: 'Not found' }, 404);

  const now = new Date().toISOString();
  await db
    .update(vaultItems)
    .set({ deletedAt: now, revisionDate: now })
    .where(eq(vaultItems.id, itemId));

  return c.json({ success: true });
});

// ─── POST /api/vault/items/:id/restore ───────────────────────────────────────

vaultRoutes.post('/items/:id/restore', async (c) => {
  const userId = c.get('userId');
  const itemId = c.req.param('id');
  const db = createDb(c.env.DB);

  const existing = await db
    .select()
    .from(vaultItems)
    .where(and(eq(vaultItems.id, itemId), eq(vaultItems.userId, userId)))
    .get();
  if (!existing) return c.json({ error: 'Not found' }, 404);

  const now = new Date().toISOString();
  await db
    .update(vaultItems)
    .set({ deletedAt: null, revisionDate: now })
    .where(eq(vaultItems.id, itemId));

  const item = await db.select().from(vaultItems).where(eq(vaultItems.id, itemId)).get();
  return c.json({ item });
});

// ─── DELETE /api/vault/items/:id/permanent ────────────────────────────────────

vaultRoutes.delete('/items/:id/permanent', async (c) => {
  const userId = c.get('userId');
  const itemId = c.req.param('id');
  const db = createDb(c.env.DB);

  const existing = await db
    .select()
    .from(vaultItems)
    .where(and(eq(vaultItems.id, itemId), eq(vaultItems.userId, userId)))
    .get();
  if (!existing) return c.json({ error: 'Not found' }, 404);

  await db
    .delete(vaultItems)
    .where(and(eq(vaultItems.id, itemId), eq(vaultItems.userId, userId)));

  return c.json({ success: true });
});

// ─── GET /api/vault/trash ──────────────────────────────────────────────────

vaultRoutes.get('/trash', async (c) => {
  const userId = c.get('userId');
  const db = createDb(c.env.DB);

  const deletedItems = await db
    .select()
    .from(vaultItems)
    .where(and(eq(vaultItems.userId, userId), isNotNull(vaultItems.deletedAt)));

  const itemsWithCountdown = deletedItems.map((item) => {
    const deletedDate = new Date(item.deletedAt!);
    const now = new Date();
    const daysSinceDelete = Math.floor((now.getTime() - deletedDate.getTime()) / (1000 * 60 * 60 * 24));
    const daysRemaining = Math.max(0, 30 - daysSinceDelete);
    return { ...item, daysRemaining };
  });

  return c.json({ items: itemsWithCountdown });
});
// ─── POST /api/vault/folders ──────────────────────────────────────────────────

vaultRoutes.post('/folders', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);

  const { name, parentId } = body as Record<string, unknown>;
  if (!name) return c.json({ error: 'Missing name' }, 400);

  const db = createDb(c.env.DB);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(folders).values({
    id,
    userId,
    name: name as string,
    parentId: (parentId as string) ?? null,
    createdAt: now,
  });

  const folder = await db.select().from(folders).where(eq(folders.id, id)).get();
  return c.json({ folder }, 201);
});

// ─── PUT /api/vault/folders/:id ───────────────────────────────────────────────

vaultRoutes.put('/folders/:id', async (c) => {
  const userId = c.get('userId');
  const folderId = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);

  const { name } = body as Record<string, unknown>;
  if (!name) return c.json({ error: 'Missing name' }, 400);

  const db = createDb(c.env.DB);

  const existing = await db
    .select()
    .from(folders)
    .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
    .get();
  if (!existing) return c.json({ error: 'Not found' }, 404);

  await db.update(folders).set({ name: name as string }).where(eq(folders.id, folderId));

  const folder = await db.select().from(folders).where(eq(folders.id, folderId)).get();
  return c.json({ folder });
});

// ─── DELETE /api/vault/folders/:id ───────────────────────────────────────────

vaultRoutes.delete('/folders/:id', async (c) => {
  const userId = c.get('userId');
  const folderId = c.req.param('id');
  const db = createDb(c.env.DB);

  const existing = await db
    .select()
    .from(folders)
    .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
    .get();
  if (!existing) return c.json({ error: 'Not found' }, 404);

  // Move items to root
  await db
    .update(vaultItems)
    .set({ folderId: null })
    .where(and(eq(vaultItems.folderId, folderId), eq(vaultItems.userId, userId)));

  // Delete folder
  await db.delete(folders).where(and(eq(folders.id, folderId), eq(folders.userId, userId)));

  return c.json({ success: true });
});

// ─── GET /api/vault/items/:id/versions ────────────────────────────────────────

vaultRoutes.get('/items/:id/versions', async (c) => {
  const userId = c.get('userId');
  const itemId = c.req.param('id');
  const db = createDb(c.env.DB);

  // Verify item ownership
  const existing = await db
    .select()
    .from(vaultItems)
    .where(and(eq(vaultItems.id, itemId), eq(vaultItems.userId, userId)))
    .get();
  if (!existing) return c.json({ error: 'Not found' }, 404);

  const versions = await db
    .select({
      id: vaultItemVersions.id,
      revisionDate: vaultItemVersions.revisionDate,
      createdAt: vaultItemVersions.createdAt,
    })
    .from(vaultItemVersions)
    .where(eq(vaultItemVersions.itemId, itemId))
    .orderBy(desc(vaultItemVersions.createdAt));

  return c.json({ versions });
});

// ─── GET /api/vault/items/:id/versions/:versionId ────────────────────────────

vaultRoutes.get('/items/:id/versions/:versionId', async (c) => {
  const userId = c.get('userId');
  const itemId = c.req.param('id');
  const versionId = c.req.param('versionId');
  const db = createDb(c.env.DB);

  // Verify item ownership
  const existing = await db
    .select()
    .from(vaultItems)
    .where(and(eq(vaultItems.id, itemId), eq(vaultItems.userId, userId)))
    .get();
  if (!existing) return c.json({ error: 'Not found' }, 404);

  const version = await db
    .select()
    .from(vaultItemVersions)
    .where(and(eq(vaultItemVersions.id, versionId), eq(vaultItemVersions.itemId, itemId)))
    .get();
  if (!version) return c.json({ error: 'Version not found' }, 404);

  return c.json({ version });
});

// ─── POST /api/vault/items/:id/versions/:versionId/restore ──────────────────

vaultRoutes.post('/items/:id/versions/:versionId/restore', async (c) => {
  const userId = c.get('userId');
  const itemId = c.req.param('id');
  const restoreVersionId = c.req.param('versionId');
  const db = createDb(c.env.DB);

  // Verify item ownership
  const existing = await db
    .select()
    .from(vaultItems)
    .where(and(eq(vaultItems.id, itemId), eq(vaultItems.userId, userId)))
    .get();
  if (!existing) return c.json({ error: 'Not found' }, 404);

  // Verify version exists and belongs to this item
  const version = await db
    .select()
    .from(vaultItemVersions)
    .where(and(eq(vaultItemVersions.id, restoreVersionId), eq(vaultItemVersions.itemId, itemId)))
    .get();
  if (!version) return c.json({ error: 'Version not found' }, 404);

  // Capture current data as a new version before restoring
  const newVersionId = crypto.randomUUID();
  const versionNow = new Date().toISOString();
  await db.insert(vaultItemVersions).values({
    id: newVersionId,
    itemId: itemId,
    userId: userId,
    encryptedData: existing.encryptedData,
    revisionDate: existing.revisionDate,
    createdAt: versionNow,
  });

  // Enforce max 10 versions per item
  const versionCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(vaultItemVersions)
    .where(eq(vaultItemVersions.itemId, itemId))
    .get();

  if (versionCount && versionCount.count > 10) {
    const oldest = await db
      .select({ id: vaultItemVersions.id })
      .from(vaultItemVersions)
      .where(eq(vaultItemVersions.itemId, itemId))
      .orderBy(asc(vaultItemVersions.createdAt))
      .limit(1)
      .get();
    if (oldest) {
      await db.delete(vaultItemVersions).where(eq(vaultItemVersions.id, oldest.id));
    }
  }

  // Restore: copy version data back to item
  const now = new Date().toISOString();
  await db
    .update(vaultItems)
    .set({
      encryptedData: version.encryptedData,
      revisionDate: version.revisionDate,
    })
    .where(eq(vaultItems.id, itemId));

  const item = await db.select().from(vaultItems).where(eq(vaultItems.id, itemId)).get();
  return c.json({ item });
});

// ─── PUT /api/vault/folders/:id/travel ────────────────────────────────────────

vaultRoutes.put('/folders/:id/travel', async (c) => {
  const userId = c.get('userId');
  const folderId = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);

  const { travelSafe } = body as { travelSafe?: boolean };
  if (typeof travelSafe !== 'boolean') {
    return c.json({ error: 'travelSafe must be a boolean' }, 400);
  }

  const db = createDb(c.env.DB);

  // Only folder owner can update
  const existing = await db
    .select()
    .from(folders)
    .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
    .get();
  if (!existing) return c.json({ error: 'Not found' }, 404);

  await db
    .update(folders)
    .set({ travelSafe: travelSafe ? 1 : 0 })
    .where(eq(folders.id, folderId));

  return c.json({ success: true });
});
