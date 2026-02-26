/**
 * Auth middleware — verifies Bearer session tokens from D1.
 */

import type { Context, Next } from 'hono';
import { createMiddleware } from 'hono/factory';
import { eq, and, gt } from 'drizzle-orm';
import { createDb } from '../db/index.js';
import { sessions } from '../db/schema.js';

type Bindings = { DB: D1Database };
type Variables = { userId: string };

export const authMiddleware = createMiddleware<{
  Bindings: Bindings;
  Variables: Variables;
}>(async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.slice(7);
  const db = createDb(c.env.DB);
  const now = new Date().toISOString();

  const session = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, now)))
    .get();

  if (!session) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  c.set('userId', session.userId);
  await next();
});
