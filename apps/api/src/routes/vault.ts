/**
 * Vault CRUD routes — all require auth middleware.
 * Server treats encryptedData as an opaque blob — never decrypts or inspects it.
 * All queries enforce userId ownership — returns 404 (not 403) for unauthorized access.
 */

import { Hono } from 'hono';
import { eq, and, isNull } from 'drizzle-orm';
import { createDb } from '../db/index.js';
import { vaultItems, folders } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';

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
