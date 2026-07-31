/**
 * Emergency Access is intentionally unavailable in v1.
 *
 * A safe implementation requires the grantor to wrap their vault key for the
 * grantee, plus a narrowly authorized way to retrieve the grantor's encrypted
 * vault after approval. The previous endpoints persisted placeholder key data
 * and could auto-approve a recovery path that was impossible to complete.
 */

import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';

type Bindings = { DB: D1Database };
type Variables = { userId: string };

export const emergencyRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

emergencyRoutes.use('*', authMiddleware);
emergencyRoutes.all('*', (c) =>
  c.json(
    {
      error:
        'Emergency access is not available in v1. No recovery grant or request was created.',
    },
    501
  )
);
