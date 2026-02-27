/**
 * Key pair routes — manage user public/private key pairs for E2EE sharing.
 * POST /api/keypair — create or update key pair
 * GET /api/keypair — get own key pair
 * GET /api/keypair/:userId — get public key for a user
 */

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { createDb } from '../db/index.js';
import { userKeyPairs } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';

type Bindings = { DB: D1Database };
type Variables = { userId: string };

export const keypairRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

keypairRoutes.use('*', authMiddleware);

// ─── POST /api/keypair ───────────────────────────────────────────────────────

keypairRoutes.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);

  const { publicKey, encryptedPrivateKey } = body as Record<string, unknown>;
  if (
    !publicKey ||
    !encryptedPrivateKey ||
    typeof publicKey !== 'string' ||
    typeof encryptedPrivateKey !== 'string'
  ) {
    return c.json({ error: 'Missing required fields: publicKey, encryptedPrivateKey' }, 400);
  }

  const db = createDb(c.env.DB);

  // Upsert: replace if exists
  const existing = await db
    .select()
    .from(userKeyPairs)
    .where(eq(userKeyPairs.userId, userId))
    .get();
  if (existing) {
    await db
      .update(userKeyPairs)
      .set({ publicKey, encryptedPrivateKey })
      .where(eq(userKeyPairs.userId, userId));
  } else {
    await db.insert(userKeyPairs).values({
      userId,
      publicKey,
      encryptedPrivateKey,
    });
  }

  return c.json({ success: true }, existing ? 200 : 201);
});

// ─── GET /api/keypair ────────────────────────────────────────────────────────

keypairRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const db = createDb(c.env.DB);

  const kp = await db.select().from(userKeyPairs).where(eq(userKeyPairs.userId, userId)).get();
  if (!kp) return c.json({ error: 'Key pair not found' }, 404);

  return c.json({
    publicKey: kp.publicKey,
    encryptedPrivateKey: kp.encryptedPrivateKey,
    createdAt: kp.createdAt,
  });
});

// ─── GET /api/keypair/:userId ────────────────────────────────────────────────

keypairRoutes.get('/:userId', async (c) => {
  const targetUserId = c.req.param('userId');
  const db = createDb(c.env.DB);

  const kp = await db
    .select()
    .from(userKeyPairs)
    .where(eq(userKeyPairs.userId, targetUserId))
    .get();
  if (!kp) return c.json({ error: 'Public key not found' }, 404);

  // Only return public key — never expose encrypted private key to other users
  return c.json({
    userId: targetUserId,
    publicKey: kp.publicKey,
  });
});
