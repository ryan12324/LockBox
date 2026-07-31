/**
 * Hardware key record management.
 *
 * Hardware-key registration and authentication are deliberately unavailable in
 * v1. The previous protocol treated a WebAuthn assertion as a signature over a
 * raw challenge and derived wrapping material from a public key. Neither design
 * provides hardware-bound key protection. Existing records can still be listed
 * and removed by their owner.
 */

import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { createDb } from '../db/index.js';
import { hardwareKeys } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';

type Bindings = { DB: D1Database };
type Variables = { userId: string };

export const hardwareKeyRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

export const HARDWARE_KEY_UNAVAILABLE =
  'Hardware-key unlock is not available in v1. Use your master password and two-factor authentication.';

// ─── POST /setup ─────────────────────────────────────────────────────────────

hardwareKeyRoutes.post('/setup', authMiddleware, (c) =>
  c.json({ error: HARDWARE_KEY_UNAVAILABLE }, 501),
);

// ─── GET / ───────────────────────────────────────────────────────────────────

hardwareKeyRoutes.get('/', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const db = createDb(c.env.DB);

  const keys = await db
    .select({
      id: hardwareKeys.id,
      keyType: hardwareKeys.keyType,
      createdAt: hardwareKeys.createdAt,
    })
    .from(hardwareKeys)
    .where(eq(hardwareKeys.userId, userId));

  return c.json({ keys });
});

// ─── POST /challenge ─────────────────────────────────────────────────────────

hardwareKeyRoutes.post('/challenge', (c) => c.json({ error: HARDWARE_KEY_UNAVAILABLE }, 501));

// ─── POST /verify ────────────────────────────────────────────────────────────

hardwareKeyRoutes.post('/verify', (c) => c.json({ error: HARDWARE_KEY_UNAVAILABLE }, 501));

// ─── DELETE /:id ─────────────────────────────────────────────────────────────

hardwareKeyRoutes.delete('/:id', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const keyId = c.req.param('id');
  const db = createDb(c.env.DB);

  // Verify ownership
  const key = await db
    .select()
    .from(hardwareKeys)
    .where(and(eq(hardwareKeys.id, keyId), eq(hardwareKeys.userId, userId)))
    .get();
  if (!key) return c.json({ error: 'Not found' }, 404);

  await db.delete(hardwareKeys).where(eq(hardwareKeys.id, keyId));

  return c.json({ success: true });
});
