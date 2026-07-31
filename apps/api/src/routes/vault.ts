/**
 * Vault CRUD routes — all require auth middleware.
 * Server treats encryptedData as an opaque blob — never decrypts or inspects it.
 * All queries enforce userId ownership — returns 404 (not 403) for unauthorized access.
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { eq, and, isNull, isNotNull, desc } from 'drizzle-orm';
import { createDb } from '../db/index.js';
import { vaultItems, folders, vaultItemVersions } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import { purgeVaultItemStorage } from '../services/vault-storage.js';
import {
  serializeFolder,
  serializeVaultItem,
  serializeVaultVersion,
} from '../services/vault-serialization.js';
import { insertVaultVersion, trimVaultVersions } from '../services/vault-versions.js';

export const VALID_TYPES = ['login', 'note', 'card', 'identity', 'passkey', 'document'] as const;

type Bindings = { DB: D1Database; ATTACHMENTS: R2Bucket };
type Variables = { userId: string };

export const vaultRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const MAX_ENCRYPTED_ITEM_LENGTH = 900_000;

function isValidItemId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
}

function isValidEncryptedData(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 3 || value.length > MAX_ENCRYPTED_ITEM_LENGTH) {
    return false;
  }
  const parts = value.split('.');
  return parts.length === 2 && parts.every((part) => part.length > 0);
}

function isValidRevisionDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isValidTags(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 100 &&
    value.every((tag) => typeof tag === 'string' && tag.length <= 100)
  );
}

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

  return c.json({
    items: items.map(serializeVaultItem),
    folders: userFolders.map(serializeFolder),
  });
});

// ─── POST /api/vault/items ────────────────────────────────────────────────────

vaultRoutes.post('/items', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);

  const {
    id: clientId,
    type,
    encryptedData,
    folderId,
    tags,
    favorite,
    revisionDate: clientRevisionDate,
  } = body as Record<string, unknown>;
  if (
    !isValidItemId(clientId) ||
    !type ||
    !isValidEncryptedData(encryptedData) ||
    !isValidRevisionDate(clientRevisionDate)
  ) {
    return c.json(
      { error: 'id, type, encryptedData, and revisionDate are required and must be valid' },
      400
    );
  }
  if (!VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
    return c.json({ error: 'Invalid item type' }, 400);
  }
  if (folderId !== undefined && folderId !== null && typeof folderId !== 'string') {
    return c.json({ error: 'folderId must be a string or null' }, 400);
  }
  if (tags !== undefined && !isValidTags(tags)) {
    return c.json({ error: 'tags must be an array of short strings' }, 400);
  }
  if (favorite !== undefined && typeof favorite !== 'boolean') {
    return c.json({ error: 'favorite must be a boolean' }, 400);
  }

  const db = createDb(c.env.DB);
  const now = new Date().toISOString();
  const id = clientId;

  // Verify folder ownership if folderId provided (prevent IDOR data injection)
  if (folderId && typeof folderId === 'string') {
    const folder = await db
      .select({ id: folders.id })
      .from(folders)
      .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
      .get();
    if (!folder) return c.json({ error: 'Folder not found' }, 404);
  }

  const inserted = await db
    .insert(vaultItems)
    .values({
      id,
      userId,
      type: type as string,
      encryptedData: encryptedData as string,
      folderId: (folderId as string) ?? null,
      tags: tags ? JSON.stringify(tags) : null,
      favorite: favorite ? 1 : 0,
      revisionDate: clientRevisionDate,
      serverModifiedAt: now,
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: vaultItems.id });
  if (inserted.length === 0) return c.json({ error: 'Item ID already exists' }, 409);

  const item = await db.select().from(vaultItems).where(eq(vaultItems.id, id)).get();
  return c.json({ item: item ? serializeVaultItem(item) : null }, 201);
});

// ─── GET /api/vault/items/:id ────────────────────────────────────────────────

vaultRoutes.get('/items/:id', async (c) => {
  const userId = c.get('userId');
  const itemId = c.req.param('id');
  const db = createDb(c.env.DB);
  const item = await db
    .select()
    .from(vaultItems)
    .where(and(eq(vaultItems.id, itemId), eq(vaultItems.userId, userId)))
    .get();
  if (!item) return c.json({ error: 'Not found' }, 404);
  return c.json({ item: serializeVaultItem(item) });
});

// ─── PUT /api/vault/items/:id ─────────────────────────────────────────────────

vaultRoutes.put('/items/:id', async (c) => {
  const userId = c.get('userId');
  const itemId = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);

  const db = createDb(c.env.DB);

  const {
    encryptedData,
    folderId,
    tags,
    favorite,
    revisionDate: clientRevisionDate,
    expectedRevisionDate,
  } = body as Record<string, unknown>;
  const hasEncryptedData = encryptedData !== undefined;
  const hasRevisionDate = clientRevisionDate !== undefined;
  const hasMetadataChange = folderId !== undefined || tags !== undefined || favorite !== undefined;
  if (hasEncryptedData !== hasRevisionDate) {
    return c.json({ error: 'encryptedData and revisionDate must be updated together' }, 400);
  }
  if (
    hasEncryptedData &&
    (!isValidEncryptedData(encryptedData) || !isValidRevisionDate(clientRevisionDate))
  ) {
    return c.json({ error: 'Invalid encryptedData or revisionDate' }, 400);
  }
  if (!isValidRevisionDate(expectedRevisionDate)) {
    return c.json({ error: 'expectedRevisionDate is required and must be valid' }, 400);
  }
  if (folderId !== undefined && folderId !== null && typeof folderId !== 'string') {
    return c.json({ error: 'folderId must be a string or null' }, 400);
  }
  if (tags !== undefined && !isValidTags(tags)) {
    return c.json({ error: 'tags must be an array of short strings' }, 400);
  }
  if (favorite !== undefined && typeof favorite !== 'boolean') {
    return c.json({ error: 'favorite must be a boolean' }, 400);
  }
  if (hasMetadataChange && !hasEncryptedData) {
    return c.json(
      { error: 'Metadata changes require updated encryptedData and revisionDate' },
      400
    );
  }
  if (!hasEncryptedData && !hasMetadataChange) {
    return c.json({ error: 'No item changes supplied' }, 400);
  }

  // Verify ownership
  const existing = await db
    .select()
    .from(vaultItems)
    .where(and(eq(vaultItems.id, itemId), eq(vaultItems.userId, userId)))
    .get();
  if (!existing) return c.json({ error: 'Not found' }, 404);
  if (existing.revisionDate !== expectedRevisionDate) {
    return c.json(
      { error: 'Item changed on another client', item: serializeVaultItem(existing) },
      409
    );
  }

  if (typeof folderId === 'string') {
    const folder = await db
      .select({ id: folders.id })
      .from(folders)
      .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
      .get();
    if (!folder) return c.json({ error: 'Folder not found' }, 404);
  }

  const versionNow = new Date().toISOString();
  const [, updatedRows] = await db.batch([
    insertVaultVersion(db, existing, versionNow),
    db
      .update(vaultItems)
      .set({
        encryptedData: encryptedData as string,
        folderId: folderId !== undefined ? (folderId as string | null) : existing.folderId,
        tags: tags !== undefined ? JSON.stringify(tags) : existing.tags,
        favorite: favorite !== undefined ? (favorite ? 1 : 0) : existing.favorite,
        revisionDate: clientRevisionDate as string,
        serverModifiedAt: versionNow,
      })
      .where(
        and(
          eq(vaultItems.id, itemId),
          eq(vaultItems.userId, userId),
          eq(vaultItems.revisionDate, expectedRevisionDate)
        )
      )
      .returning({ id: vaultItems.id }),
  ]);
  await trimVaultVersions(db, itemId);

  if (updatedRows.length === 0) {
    const current = await db
      .select()
      .from(vaultItems)
      .where(and(eq(vaultItems.id, itemId), eq(vaultItems.userId, userId)))
      .get();
    return c.json(
      {
        error: 'Item changed on another client',
        ...(current ? { item: serializeVaultItem(current) } : {}),
      },
      409
    );
  }

  const item = await db.select().from(vaultItems).where(eq(vaultItems.id, itemId)).get();
  return c.json({ item: item ? serializeVaultItem(item) : null });
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
    .set({ deletedAt: now, serverModifiedAt: now })
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

  await db
    .update(vaultItems)
    .set({ deletedAt: null, serverModifiedAt: new Date().toISOString() })
    .where(eq(vaultItems.id, itemId));

  const item = await db.select().from(vaultItems).where(eq(vaultItems.id, itemId)).get();
  return c.json({ item: item ? serializeVaultItem(item) : null });
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

  await purgeVaultItemStorage(c.env, userId, itemId);
  await db.delete(vaultItems).where(and(eq(vaultItems.id, itemId), eq(vaultItems.userId, userId)));

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
    const daysSinceDelete = Math.floor(
      (now.getTime() - deletedDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const daysRemaining = Math.max(0, 30 - daysSinceDelete);
    return { ...serializeVaultItem(item), daysRemaining };
  });

  return c.json({ items: itemsWithCountdown });
});
// ─── POST /api/vault/folders ──────────────────────────────────────────────────

vaultRoutes.post('/folders', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);

  const { name, parentId } = body as Record<string, unknown>;
  if (typeof name !== 'string' || name.trim().length === 0 || name.length > 100) {
    return c.json({ error: 'name must be a non-empty string of at most 100 characters' }, 400);
  }
  if (parentId !== undefined && parentId !== null && typeof parentId !== 'string') {
    return c.json({ error: 'parentId must be a string or null' }, 400);
  }

  const db = createDb(c.env.DB);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Verify parent folder ownership if parentId provided (prevent IDOR)
  if (parentId && typeof parentId === 'string') {
    const parent = await db
      .select({ id: folders.id })
      .from(folders)
      .where(and(eq(folders.id, parentId as string), eq(folders.userId, userId)))
      .get();
    if (!parent) return c.json({ error: 'Parent folder not found' }, 404);
  }

  await db.insert(folders).values({
    id,
    userId,
    name: name.trim(),
    parentId: (parentId as string) ?? null,
    createdAt: now,
  });

  const folder = await db.select().from(folders).where(eq(folders.id, id)).get();
  return c.json({ folder: folder ? serializeFolder(folder) : null }, 201);
});

// ─── PUT /api/vault/folders/:id ───────────────────────────────────────────────

vaultRoutes.put('/folders/:id', async (c) => {
  const userId = c.get('userId');
  const folderId = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);

  const { name } = body as Record<string, unknown>;
  if (typeof name !== 'string' || name.trim().length === 0 || name.length > 100) {
    return c.json({ error: 'name must be a non-empty string of at most 100 characters' }, 400);
  }

  const db = createDb(c.env.DB);

  const existing = await db
    .select()
    .from(folders)
    .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
    .get();
  if (!existing) return c.json({ error: 'Not found' }, 404);

  await db.update(folders).set({ name: name.trim() }).where(eq(folders.id, folderId));

  const folder = await db.select().from(folders).where(eq(folders.id, folderId)).get();
  return c.json({ folder: folder ? serializeFolder(folder) : null });
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

  // The encrypted payload also contains folderId, so the server cannot safely
  // move items without making their ciphertext disagree with row metadata.
  const itemInFolder = await db
    .select({ id: vaultItems.id })
    .from(vaultItems)
    .where(and(eq(vaultItems.folderId, folderId), eq(vaultItems.userId, userId)))
    .get();
  if (itemInFolder) {
    return c.json({ error: 'Move or permanently delete every item in this folder first' }, 409);
  }
  const childFolder = await db
    .select({ id: folders.id })
    .from(folders)
    .where(and(eq(folders.parentId, folderId), eq(folders.userId, userId)))
    .get();
  if (childFolder) {
    return c.json({ error: 'Move or delete child folders first' }, 409);
  }

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
    .select()
    .from(vaultItemVersions)
    .where(eq(vaultItemVersions.itemId, itemId))
    .orderBy(desc(vaultItemVersions.createdAt));

  return c.json({ versions: versions.map(serializeVaultVersion) });
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

  return c.json({ version: serializeVaultVersion(version) });
});

// ─── POST /api/vault/items/:id/versions/:versionId/restore ──────────────────

async function restoreVersion(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
  const userId = c.get('userId');
  const itemId = c.req.param('id');
  const restoreVersionId = c.req.param('versionId');
  if (!itemId || !restoreVersionId) {
    return c.json({ error: 'Item and version identifiers are required' }, 400);
  }
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

  if (version.folderId) {
    const historicalFolder = await db
      .select({ id: folders.id })
      .from(folders)
      .where(and(eq(folders.id, version.folderId), eq(folders.userId, userId)))
      .get();
    if (!historicalFolder) {
      return c.json({ error: 'This version references a folder that no longer exists' }, 409);
    }
  }

  const versionNow = new Date().toISOString();
  await db.batch([
    insertVaultVersion(db, existing, versionNow),
    db
      .update(vaultItems)
      .set({
        encryptedData: version.encryptedData,
        revisionDate: version.revisionDate,
        folderId: version.folderId,
        tags: version.tags,
        favorite: version.favorite ?? 0,
        serverModifiedAt: versionNow,
      })
      .where(and(eq(vaultItems.id, itemId), eq(vaultItems.userId, userId))),
  ]);
  await trimVaultVersions(db, itemId);

  const item = await db.select().from(vaultItems).where(eq(vaultItems.id, itemId)).get();
  return c.json({ item: item ? serializeVaultItem(item) : null });
}

vaultRoutes.post('/items/:id/versions/:versionId/restore', restoreVersion);
vaultRoutes.put('/items/:id/versions/:versionId/restore', restoreVersion);

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
