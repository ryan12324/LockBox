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

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB plaintext
export const MAX_USER_QUOTA = 100 * 1024 * 1024; // 100MB plaintext

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Exact upper bound for base64(iv).base64(ciphertext+tag). */
export function encryptedAttachmentSize(plaintextSize: number): number {
  return 16 + 1 + 4 * Math.ceil((plaintextSize + 16) / 3);
}

/** Encrypted payload plus conservative multipart/form-data overhead. */
export const MAX_ATTACHMENT_REQUEST_SIZE = encryptedAttachmentSize(MAX_FILE_SIZE) + 64 * 1024;

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
  const attachmentId = body['attachmentId'];
  const plaintextSizeValue = body['plaintextSize'];
  const encryptedName = body['encryptedName'];
  const encryptedMimeType = body['encryptedMimeType'];

  if (!file || !(file instanceof File)) {
    return c.json({ error: 'Missing file' }, 400);
  }
  if (typeof attachmentId !== 'string' || !UUID_PATTERN.test(attachmentId)) {
    return c.json({ error: 'attachmentId must be a valid client-generated UUID' }, 400);
  }
  if (typeof encryptedName !== 'string' || typeof encryptedMimeType !== 'string') {
    return c.json({ error: 'Missing encryptedName or encryptedMimeType' }, 400);
  }

  if (typeof plaintextSizeValue !== 'string' || !/^\d+$/.test(plaintextSizeValue)) {
    return c.json({ error: 'plaintextSize must be a non-negative integer' }, 400);
  }
  const plaintextSize = Number(plaintextSizeValue);
  if (!Number.isSafeInteger(plaintextSize) || plaintextSize > MAX_FILE_SIZE) {
    return c.json({ error: 'File too large. Maximum size is 10MB.' }, 413);
  }

  // The encrypted upload is base64 encoded, so it is larger than the 10MB
  // plaintext limit. Bind its maximum size to the declared plaintext size to
  // prevent clients under-reporting quota usage.
  if (file.size !== encryptedAttachmentSize(plaintextSize)) {
    return c.json({ error: 'Encrypted file size does not match plaintextSize' }, 400);
  }

  // Check user quota (100MB total)
  const userAttachments = await db
    .select({ size: attachments.size })
    .from(attachments)
    .where(eq(attachments.userId, userId));

  const totalUsed = userAttachments.reduce((sum, a) => sum + a.size, 0);
  if (totalUsed + plaintextSize > MAX_USER_QUOTA) {
    return c.json({ error: 'Storage quota exceeded. Maximum is 100MB.' }, 413);
  }

  const existingAttachment = await db
    .select({ id: attachments.id })
    .from(attachments)
    .where(eq(attachments.id, attachmentId))
    .get();
  if (existingAttachment) {
    return c.json({ error: 'Attachment ID already exists' }, 409);
  }

  const now = new Date().toISOString();

  // Store encrypted blob in R2
  const r2Key = `${userId}/${itemId}/${attachmentId}`;
  // R2 requires a body with a known length. `File.stream()` can lose that
  // length through multipart parsing in workerd/Miniflare.
  await c.env.ATTACHMENTS.put(r2Key, await file.arrayBuffer());

  // Store metadata in DB. Remove the R2 object if D1 rejects the insert so a
  // failed request cannot leak quota as an orphaned object.
  try {
    await db.insert(attachments).values({
      id: attachmentId,
      itemId,
      userId,
      encryptedName,
      encryptedMimeType,
      size: plaintextSize,
      createdAt: now,
    });
  } catch (error) {
    await c.env.ATTACHMENTS.delete(r2Key);
    throw error;
  }

  return c.json(
    {
      attachment: {
        id: attachmentId,
        itemId,
        encryptedName,
        encryptedMimeType,
        size: plaintextSize,
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

  const userAttachments = await db
    .select({ size: attachments.size })
    .from(attachments)
    .where(eq(attachments.userId, userId));
  const used = userAttachments.reduce((sum, attachment) => sum + attachment.size, 0);

  return c.json({
    attachments: itemAttachments,
    quota: { used, limit: MAX_USER_QUOTA },
  });
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
      // `attachments.size` is the plaintext quota size; the body is the
      // larger base64-encoded ciphertext stored in R2.
      'Content-Length': String(object.size),
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
