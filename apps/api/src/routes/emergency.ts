/**
 * Emergency Access routes — grant, confirm, request, approve/reject, and retrieve.
 * 9 endpoints total.
 */

import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { createDb } from '../db/index.js';
import { emergencyAccessGrants, emergencyAccessRequests, users } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';

type Bindings = { DB: D1Database };
type Variables = { userId: string };

export const emergencyRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

emergencyRoutes.use('*', authMiddleware);

const VALID_WAIT_PERIODS = [1, 3, 7, 14, 30];

// ─── POST /grants — Create emergency access grant ─────────────────────────────

emergencyRoutes.post('/grants', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);

  const { granteeEmail, waitPeriodDays, encryptedUserKey } = body as Record<string, unknown>;

  if (!granteeEmail || typeof granteeEmail !== 'string') {
    return c.json({ error: 'Missing required field: granteeEmail' }, 400);
  }
  if (!encryptedUserKey || typeof encryptedUserKey !== 'string') {
    return c.json({ error: 'Missing required field: encryptedUserKey' }, 400);
  }

  const wait = typeof waitPeriodDays === 'number' ? waitPeriodDays : 7;
  if (!VALID_WAIT_PERIODS.includes(wait)) {
    return c.json({ error: 'Invalid waitPeriodDays. Must be one of: 1, 3, 7, 14, 30' }, 400);
  }

  const db = createDb(c.env.DB);

  // Cannot grant to yourself
  const grantor = await db.select().from(users).where(eq(users.id, userId)).get();
  if (grantor && grantor.email === granteeEmail) {
    return c.json({ error: 'Cannot grant emergency access to yourself' }, 400);
  }

  const grantId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(emergencyAccessGrants).values({
    id: grantId,
    grantorUserId: userId,
    granteeEmail: granteeEmail,
    waitPeriodDays: wait,
    status: 'pending',
    encryptedUserKey: encryptedUserKey,
    createdAt: now,
    updatedAt: now,
  });

  return c.json(
    {
      id: grantId,
      grantorUserId: userId,
      granteeEmail,
      waitPeriodDays: wait,
      status: 'pending',
      createdAt: now,
    },
    201
  );
});

// ─── GET /grants — List grants as grantor ──────────────────────────────────────

emergencyRoutes.get('/grants', async (c) => {
  const userId = c.get('userId');
  const db = createDb(c.env.DB);

  const grants = await db
    .select()
    .from(emergencyAccessGrants)
    .where(eq(emergencyAccessGrants.grantorUserId, userId));

  return c.json({ grants });
});

// ─── GET /requests — List incoming requests as grantee ─────────────────────────

emergencyRoutes.get('/requests', async (c) => {
  const userId = c.get('userId');
  const db = createDb(c.env.DB);

  // Get user's email
  const user = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return c.json({ error: 'User not found' }, 404);

  const grants = await db
    .select()
    .from(emergencyAccessGrants)
    .where(eq(emergencyAccessGrants.granteeEmail, user.email));

  // Filter to relevant statuses
  const filtered = grants.filter((g) =>
    ['pending', 'confirmed', 'waiting', 'approved'].includes(g.status)
  );

  return c.json({ grants: filtered });
});

// ─── POST /grants/:id/confirm — Grantee confirms trusted contact ──────────────

emergencyRoutes.post('/grants/:id/confirm', async (c) => {
  const userId = c.get('userId');
  const grantId = c.req.param('id');
  const db = createDb(c.env.DB);

  const grant = await db
    .select()
    .from(emergencyAccessGrants)
    .where(eq(emergencyAccessGrants.id, grantId))
    .get();

  if (!grant) return c.json({ error: 'Grant not found' }, 404);

  // Verify grantee is the current user (by email)
  const user = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!user || user.email !== grant.granteeEmail) {
    return c.json({ error: 'Only the grantee can confirm' }, 403);
  }

  if (grant.status !== 'pending') {
    return c.json({ error: 'Grant is not in pending status' }, 400);
  }

  await db
    .update(emergencyAccessGrants)
    .set({ status: 'confirmed', granteeUserId: userId, updatedAt: new Date().toISOString() })
    .where(eq(emergencyAccessGrants.id, grantId));

  return c.json({ success: true });
});

// ─── DELETE /grants/:id — Revoke grant (grantor only) ──────────────────────────

emergencyRoutes.delete('/grants/:id', async (c) => {
  const userId = c.get('userId');
  const grantId = c.req.param('id');
  const db = createDb(c.env.DB);

  const grant = await db
    .select()
    .from(emergencyAccessGrants)
    .where(eq(emergencyAccessGrants.id, grantId))
    .get();

  if (!grant) return c.json({ error: 'Grant not found' }, 404);

  if (grant.grantorUserId !== userId) {
    return c.json({ error: 'Only the grantor can revoke' }, 403);
  }

  // Delete associated requests first
  await db.delete(emergencyAccessRequests).where(eq(emergencyAccessRequests.grantId, grantId));

  await db.delete(emergencyAccessGrants).where(eq(emergencyAccessGrants.id, grantId));

  return c.json({ success: true });
});

// ─── POST /requests — Grantee requests emergency access ───────────────────────

emergencyRoutes.post('/requests', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);

  const { grantId } = body as Record<string, unknown>;
  if (!grantId || typeof grantId !== 'string') {
    return c.json({ error: 'Missing required field: grantId' }, 400);
  }

  const db = createDb(c.env.DB);

  const grant = await db
    .select()
    .from(emergencyAccessGrants)
    .where(eq(emergencyAccessGrants.id, grantId))
    .get();

  if (!grant) return c.json({ error: 'Grant not found' }, 404);

  // Only confirmed grantee can request
  if (grant.status !== 'confirmed') {
    return c.json({ error: 'Grant must be confirmed before requesting access' }, 400);
  }

  const user = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!user || user.email !== grant.granteeEmail) {
    return c.json({ error: 'Only the grantee can request access' }, 403);
  }

  const requestId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + grant.waitPeriodDays * 24 * 60 * 60 * 1000
  ).toISOString();

  // Update grant status to waiting
  await db
    .update(emergencyAccessGrants)
    .set({ status: 'waiting', updatedAt: now.toISOString() })
    .where(eq(emergencyAccessGrants.id, grantId));

  await db.insert(emergencyAccessRequests).values({
    id: requestId,
    grantId: grantId,
    requestedAt: now.toISOString(),
    expiresAt,
  });

  return c.json(
    {
      id: requestId,
      grantId,
      requestedAt: now.toISOString(),
      expiresAt,
    },
    201
  );
});

// ─── POST /grants/:id/reject — Grantor rejects during wait period ──────────────

emergencyRoutes.post('/grants/:id/reject', async (c) => {
  const userId = c.get('userId');
  const grantId = c.req.param('id');
  const db = createDb(c.env.DB);

  const grant = await db
    .select()
    .from(emergencyAccessGrants)
    .where(eq(emergencyAccessGrants.id, grantId))
    .get();

  if (!grant) return c.json({ error: 'Grant not found' }, 404);

  if (grant.grantorUserId !== userId) {
    return c.json({ error: 'Only the grantor can reject' }, 403);
  }

  if (grant.status !== 'waiting') {
    return c.json({ error: 'Grant is not in waiting status' }, 400);
  }

  const now = new Date().toISOString();

  await db
    .update(emergencyAccessGrants)
    .set({ status: 'rejected', updatedAt: now })
    .where(eq(emergencyAccessGrants.id, grantId));

  // Update the request
  const request = await db
    .select()
    .from(emergencyAccessRequests)
    .where(eq(emergencyAccessRequests.grantId, grantId))
    .get();

  if (request) {
    await db
      .update(emergencyAccessRequests)
      .set({ rejectedAt: now })
      .where(eq(emergencyAccessRequests.id, request.id));
  }

  return c.json({ success: true });
});

// ─── POST /grants/:id/approve — Grantor approves early ─────────────────────────

emergencyRoutes.post('/grants/:id/approve', async (c) => {
  const userId = c.get('userId');
  const grantId = c.req.param('id');
  const db = createDb(c.env.DB);

  const grant = await db
    .select()
    .from(emergencyAccessGrants)
    .where(eq(emergencyAccessGrants.id, grantId))
    .get();

  if (!grant) return c.json({ error: 'Grant not found' }, 404);

  if (grant.grantorUserId !== userId) {
    return c.json({ error: 'Only the grantor can approve' }, 403);
  }

  if (grant.status !== 'waiting') {
    return c.json({ error: 'Grant is not in waiting status' }, 400);
  }

  const now = new Date().toISOString();

  await db
    .update(emergencyAccessGrants)
    .set({ status: 'approved', updatedAt: now })
    .where(eq(emergencyAccessGrants.id, grantId));

  // Update the request
  const request = await db
    .select()
    .from(emergencyAccessRequests)
    .where(eq(emergencyAccessRequests.grantId, grantId))
    .get();

  if (request) {
    await db
      .update(emergencyAccessRequests)
      .set({ approvedAt: now })
      .where(eq(emergencyAccessRequests.id, request.id));
  }

  return c.json({ success: true });
});

// ─── GET /grants/:id/access — Get encrypted userKey after approval ─────────────

emergencyRoutes.get('/grants/:id/access', async (c) => {
  const userId = c.get('userId');
  const grantId = c.req.param('id');
  const db = createDb(c.env.DB);

  const grant = await db
    .select()
    .from(emergencyAccessGrants)
    .where(eq(emergencyAccessGrants.id, grantId))
    .get();

  if (!grant) return c.json({ error: 'Grant not found' }, 404);

  // Only grantee can access
  const user = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!user || user.email !== grant.granteeEmail) {
    return c.json({ error: 'Only the grantee can access' }, 403);
  }

  if (grant.status !== 'approved') {
    return c.json({ error: 'Access not yet approved' }, 403);
  }

  return c.json({ encryptedUserKey: grant.encryptedUserKey });
});
