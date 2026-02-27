/**
 * Attachment CRUD routes — file attachments stored in R2.
 * All files are encrypted client-side — server stores opaque blobs.
 * Enforces 10MB per-file limit and 100MB per-user quota.
 */

import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { createDb } from '../db/index.js';
import { vaultItems, attachments } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_USER_QUOTA = 100 * 1024 * 1024; // 100MB

type Bindings = { DB: D1Database; ATTACHMENTS: R2Bucket };
type Variables = { userId: string };

export const attachmentRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All attachment routes require authentication
attachmentRoutes.use('*', authMiddleware);

// ─── POST /items/:itemId/attachments ──────────────────────────────────────────

attachmentRoutes.post('/items/:itemId/attachments', async (c) => {
  const userId = c.get('userId');
  const itemId = c.req.param('itemId');
  const db = createDb(c.env.DB);

  // Verify item ownership
  const item = await db
    .select()
    .from(vaultItems)
    .where(and(eq(vaultItems.id, itemId), eq(vaultItems.userId, userId)))
    .get();
  if (!item) return c.json({ error: 'Not found' }, 404);

  // Parse multipart body
  const body = await c.req.parseBody();
  const file = body['file'];
  const encryptedName = body['encryptedName'];
  const encryptedMimeType = body['encryptedMimeType'];

  if (!file || !(file instanceof File)) {
    return c.json({ error: 'Missing file' }, 400);
  }
  if (!encryptedName || !encryptedMimeType) {
    return c.json({ error: 'Missing encryptedName or encryptedMimeType' }, 400);
  }

  // Check file size limit (10MB)
  if (file.size > MAX_FILE_SIZE) {
    return c.json({ error: 'File too large. Maximum size is 10MB.' }, 413);
  }

  // Check user quota (100MB total)
  const userAttachments = await db
    .select({ size: attachments.size })
    .from(attachments)
    .where(eq(attachments.userId, userId));

  const totalUsed = userAttachments.reduce((sum, a) => sum + a.size, 0);
  if (totalUsed + file.size > MAX_USER_QUOTA) {
    return c.json({ error: 'Storage quota exceeded. Maximum is 100MB.' }, 413);
  }

  const attachmentId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Store encrypted blob in R2
  const r2Key = `${userId}/${itemId}/${attachmentId}`;
  await c.env.ATTACHMENTS.put(r2Key, file.stream());

  // Store metadata in DB
  await db.insert(attachments).values({
    id: attachmentId,
    itemId,
    userId,
    encryptedName: encryptedName as string,
    encryptedMimeType: encryptedMimeType as string,
    size: file.size,
    createdAt: now,
  });

  return c.json(
    {
      attachment: {
        id: attachmentId,
        itemId,
        encryptedName,
        encryptedMimeType,
        size: file.size,
        createdAt: now,
      },
    },
    201
  );
});

// ─── GET /items/:itemId/attachments ───────────────────────────────────────────

attachmentRoutes.get('/items/:itemId/attachments', async (c) => {
  const userId = c.get('userId');
  const itemId = c.req.param('itemId');
  const db = createDb(c.env.DB);

  // Verify item ownership
  const item = await db
    .select()
    .from(vaultItems)
    .where(and(eq(vaultItems.id, itemId), eq(vaultItems.userId, userId)))
    .get();
  if (!item) return c.json({ error: 'Not found' }, 404);

  const itemAttachments = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.itemId, itemId), eq(attachments.userId, userId)));

  return c.json({ attachments: itemAttachments });
});

// ─── GET /items/:itemId/attachments/:attachmentId ─────────────────────────────

attachmentRoutes.get('/items/:itemId/attachments/:attachmentId', async (c) => {
  const userId = c.get('userId');
  const itemId = c.req.param('itemId');
  const attachmentId = c.req.param('attachmentId');
  const db = createDb(c.env.DB);

  // Verify item ownership
  const item = await db
    .select()
    .from(vaultItems)
    .where(and(eq(vaultItems.id, itemId), eq(vaultItems.userId, userId)))
    .get();
  if (!item) return c.json({ error: 'Not found' }, 404);

  // Verify attachment exists for this item
  const attachment = await db
    .select()
    .from(attachments)
    .where(
      and(
        eq(attachments.id, attachmentId),
        eq(attachments.itemId, itemId),
        eq(attachments.userId, userId)
      )
    )
    .get();
  if (!attachment) return c.json({ error: 'Not found' }, 404);

  // Stream from R2
  const r2Key = `${userId}/${itemId}/${attachmentId}`;
  const object = await c.env.ATTACHMENTS.get(r2Key);
  if (!object) return c.json({ error: 'Not found' }, 404);

  return new Response(object.body, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(attachment.size),
    },
  });
});

// ─── DELETE /items/:itemId/attachments/:attachmentId ──────────────────────────

attachmentRoutes.delete('/items/:itemId/attachments/:attachmentId', async (c) => {
  const userId = c.get('userId');
  const itemId = c.req.param('itemId');
  const attachmentId = c.req.param('attachmentId');
  const db = createDb(c.env.DB);

  // Verify item ownership
  const item = await db
    .select()
    .from(vaultItems)
    .where(and(eq(vaultItems.id, itemId), eq(vaultItems.userId, userId)))
    .get();
  if (!item) return c.json({ error: 'Not found' }, 404);

  // Verify attachment exists
  const attachment = await db
    .select()
    .from(attachments)
    .where(
      and(
        eq(attachments.id, attachmentId),
        eq(attachments.itemId, itemId),
        eq(attachments.userId, userId)
      )
    )
    .get();
  if (!attachment) return c.json({ error: 'Not found' }, 404);

  // Delete from R2
  const r2Key = `${userId}/${itemId}/${attachmentId}`;
  await c.env.ATTACHMENTS.delete(r2Key);

  // Delete from DB
  await db
    .delete(attachments)
    .where(and(eq(attachments.id, attachmentId), eq(attachments.userId, userId)));

  return c.json({ success: true });
});
