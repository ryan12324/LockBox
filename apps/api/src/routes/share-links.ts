/**
 * Share links routes — anonymous password sharing via encrypted links.
 * 4 endpoints total.
 */

import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { createDb } from '../db/index.js';
import { shareLinks } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';

type Bindings = { DB: D1Database };
type Variables = { userId: string };

export const shareLinkRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ─── POST / — Create share link (auth required) ─────────────────────────────

shareLinkRoutes.post('/', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);

  const { id, encryptedItem, tokenHash, itemName, maxViews, expiresAt } = body as Record<
    string,
    unknown
  >;

  if (
    !id ||
    !encryptedItem ||
    !tokenHash ||
    !itemName ||
    !expiresAt ||
    typeof id !== 'string' ||
    typeof encryptedItem !== 'string' ||
    typeof tokenHash !== 'string' ||
    typeof itemName !== 'string' ||
    typeof expiresAt !== 'string'
  ) {
    return c.json(
      { error: 'Missing required fields: id, encryptedItem, tokenHash, itemName, expiresAt' },
      400
    );
  }

  const db = createDb(c.env.DB);

  await db.insert(shareLinks).values({
    id,
    userId,
    encryptedItem,
    tokenHash,
    itemName,
    maxViews: typeof maxViews === 'number' ? maxViews : 1,
    expiresAt,
  });

  return c.json({ id, itemName, expiresAt }, 201);
});

// ─── GET /:id/redeem — Redeem share link (auth via Bearer token hash) ────────

shareLinkRoutes.get('/:id/redeem', async (c) => {
  const linkId = c.req.param('id');
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing authorization token' }, 401);
  }

  const token = authHeader.slice(7);
  const db = createDb(c.env.DB);

  // Decode base64 token back to raw bytes, then SHA-256 to match stored hash
  const binary = atob(token);
  const tokenBytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) tokenBytes[i] = binary.charCodeAt(i);
  const hashBuffer = await crypto.subtle.digest('SHA-256', tokenBytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const tokenHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  const link = await db.select().from(shareLinks).where(eq(shareLinks.id, linkId)).get();

  if (!link) return c.json({ error: 'Share link not found' }, 404);
  if (link.tokenHash !== tokenHash) return c.json({ error: 'Invalid token' }, 401);

  const now = new Date().toISOString();
  if (link.expiresAt < now) return c.json({ error: 'Share link expired' }, 410);
  if (link.viewCount >= link.maxViews) return c.json({ error: 'Maximum views reached' }, 410);

  // Increment view count
  await db
    .update(shareLinks)
    .set({ viewCount: link.viewCount + 1 })
    .where(eq(shareLinks.id, linkId));

  return c.json({
    encryptedItem: link.encryptedItem,
    itemName: link.itemName,
    viewCount: link.viewCount + 1,
    maxViews: link.maxViews,
  });
});

// ─── GET / — List user's share links (auth required) ─────────────────────────

shareLinkRoutes.get('/', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const db = createDb(c.env.DB);

  const links = await db.select().from(shareLinks).where(eq(shareLinks.userId, userId));

  return c.json({
    shareLinks: links.map((l) => ({
      id: l.id,
      itemName: l.itemName,
      maxViews: l.maxViews,
      viewCount: l.viewCount,
      expiresAt: l.expiresAt,
      createdAt: l.createdAt,
    })),
  });
});

// ─── DELETE /:id — Delete share link (auth required) ─────────────────────────

shareLinkRoutes.delete('/:id', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const linkId = c.req.param('id');
  const db = createDb(c.env.DB);

  const link = await db
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.id, linkId), eq(shareLinks.userId, userId)))
    .get();

  if (!link) return c.json({ error: 'Share link not found' }, 404);

  await db.delete(shareLinks).where(eq(shareLinks.id, linkId));

  return c.json({ success: true });
});
