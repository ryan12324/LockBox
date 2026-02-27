/**
 * Settings routes — user preferences including travel mode.
 */

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { createDb } from '../db/index.js';
import { users } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';

type Bindings = { DB: D1Database };
type Variables = { userId: string };

export const settingsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
settingsRoutes.use('*', authMiddleware);

// ─── GET /api/settings/travel-mode ──────────────────────────────────────────

settingsRoutes.get('/travel-mode', async (c) => {
  const userId = c.get('userId');
  const db = createDb(c.env.DB);

  const user = await db
    .select({ travelMode: users.travelMode })
    .from(users)
    .where(eq(users.id, userId))
    .get();

  if (!user) return c.json({ error: 'User not found' }, 404);

  return c.json({ enabled: user.travelMode === 1 });
});

// ─── PUT /api/settings/travel-mode ──────────────────────────────────────────

settingsRoutes.put('/travel-mode', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);

  const { enabled } = body as { enabled?: boolean };
  if (typeof enabled !== 'boolean') {
    return c.json({ error: 'enabled must be a boolean' }, 400);
  }

  const db = createDb(c.env.DB);

  await db
    .update(users)
    .set({ travelMode: enabled ? 1 : 0 })
    .where(eq(users.id, userId));

  return c.json({ enabled });
});
