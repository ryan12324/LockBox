/**
 * Document vault routes — encrypted document storage in R2.
 * Documents are vault items with type 'document', stored as opaque blobs.
 * Enforces 50MB per-file limit and 500MB per-user quota.
 */

import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { createDb } from '../db/index.js';
import { vaultItems } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';

const MAX_DOC_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_DOC_QUOTA = 500 * 1024 * 1024; // 500MB

type Bindings = { DB: D1Database; ATTACHMENTS: R2Bucket };
type Variables = { userId: string };

export const documentRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All document routes require authentication
documentRoutes.use('*', authMiddleware);

// ─── POST /items/:itemId/document ────────────────────────────────────────────

documentRoutes.post('/items/:itemId/document', async (c) => {
  const userId = c.get('userId');
  const itemId = c.req.param('itemId');
  const db = createDb(c.env.DB);

  // Verify item belongs to user and is type 'document'
  const item = await db
    .select()
    .from(vaultItems)
    .where(and(eq(vaultItems.id, itemId), eq(vaultItems.userId, userId)))
    .get();
  if (!item) return c.json({ error: 'Not found' }, 404);
  if (item.type !== 'document') return c.json({ error: 'Item is not a document type' }, 400);

  // Parse multipart body
  const body = await c.req.parseBody();
  const file = body['file'];

  if (!file || !(file instanceof File)) {
    return c.json({ error: 'Missing file' }, 400);
  }

  // Check file size limit (50MB)
  if (file.size > MAX_DOC_SIZE) {
    return c.json({ error: 'File too large. Maximum size is 50MB.' }, 413);
  }

  // Check user quota (500MB total documents)
  const userDocs = await db
    .select()
    .from(vaultItems)
    .where(and(eq(vaultItems.userId, userId), eq(vaultItems.type, 'document')));

  let totalUsed = 0;
  for (const doc of userDocs) {
    const r2Key = `docs/${userId}/${doc.id}`;
    const obj = await c.env.ATTACHMENTS.head(r2Key);
    if (obj) totalUsed += obj.size;
  }

  if (totalUsed + file.size > MAX_DOC_QUOTA) {
    return c.json({ error: 'Document storage quota exceeded. Maximum is 500MB.' }, 413);
  }

  // Store in R2 at key docs/${userId}/${itemId}
  const r2Key = `docs/${userId}/${itemId}`;
  await c.env.ATTACHMENTS.put(r2Key, file.stream());

  return c.json({ success: true, size: file.size });
});

// ─── GET /items/:itemId/document ─────────────────────────────────────────────

documentRoutes.get('/items/:itemId/document', async (c) => {
  const userId = c.get('userId');
  const itemId = c.req.param('itemId');
  const db = createDb(c.env.DB);

  // Verify item belongs to user
  const item = await db
    .select()
    .from(vaultItems)
    .where(and(eq(vaultItems.id, itemId), eq(vaultItems.userId, userId)))
    .get();
  if (!item) return c.json({ error: 'Not found' }, 404);

  // Get from R2
  const r2Key = `docs/${userId}/${itemId}`;
  const object = await c.env.ATTACHMENTS.get(r2Key);
  if (!object) return c.json({ error: 'Not found' }, 404);

  return new Response(object.body, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(object.size),
    },
  });
});

// ─── DELETE /items/:itemId/document ──────────────────────────────────────────

documentRoutes.delete('/items/:itemId/document', async (c) => {
  const userId = c.get('userId');
  const itemId = c.req.param('itemId');
  const db = createDb(c.env.DB);

  // Verify item belongs to user
  const item = await db
    .select()
    .from(vaultItems)
    .where(and(eq(vaultItems.id, itemId), eq(vaultItems.userId, userId)))
    .get();
  if (!item) return c.json({ error: 'Not found' }, 404);

  // Delete from R2
  const r2Key = `docs/${userId}/${itemId}`;
  await c.env.ATTACHMENTS.delete(r2Key);

  return c.json({ success: true });
});

// ─── GET /documents/quota ────────────────────────────────────────────────────

documentRoutes.get('/documents/quota', async (c) => {
  const userId = c.get('userId');
  const db = createDb(c.env.DB);

  // Sum sizes of all documents for user
  const userDocs = await db
    .select()
    .from(vaultItems)
    .where(and(eq(vaultItems.userId, userId), eq(vaultItems.type, 'document')));

  let used = 0;
  for (const doc of userDocs) {
    const r2Key = `docs/${userId}/${doc.id}`;
    const obj = await c.env.ATTACHMENTS.head(r2Key);
    if (obj) used += obj.size;
  }

  return c.json({ used, limit: MAX_DOC_QUOTA });
});
