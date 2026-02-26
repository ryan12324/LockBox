/**
 * WebSocket upgrade endpoint — routes authenticated users to their VaultSyncHub DO.
 */

import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';

type Bindings = { DB: D1Database; SYNC_HUB: DurableObjectNamespace };
type Variables = { userId: string };

export const wsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * GET /api/sync/ws — upgrade to WebSocket, route to user's DO instance.
 * Requires auth. The DO handles all WebSocket lifecycle events.
 */
wsRoutes.get('/ws', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const id = c.env.SYNC_HUB.idFromName(userId);
  const stub = c.env.SYNC_HUB.get(id);
  return stub.fetch(c.req.raw);
});
