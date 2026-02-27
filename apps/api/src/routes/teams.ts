/**
 * Teams CRUD routes — create, list, manage teams, members, and invites.
 * 11 endpoints total.
 */

import { Hono } from 'hono';
import { eq, and } from 'drizzle-orm';
import { createDb } from '../db/index.js';
import { teams, teamMembers, teamInvites, users, sharedFolders, sharedFolderKeys } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireTeamRole } from '../middleware/team-auth.js';

type Bindings = { DB: D1Database };
type Variables = { userId: string; teamRole?: string };

export const teamRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

teamRoutes.use('*', authMiddleware);

// ─── POST / — Create team ────────────────────────────────────────────────────

teamRoutes.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);

  const { name } = body as Record<string, unknown>;
  if (!name || typeof name !== 'string') {
    return c.json({ error: 'Missing required field: name' }, 400);
  }

  const db = createDb(c.env.DB);
  const teamId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(teams).values({
    id: teamId,
    name,
    createdBy: userId,
  });

  // Creator becomes owner
  await db.insert(teamMembers).values({
    teamId,
    userId,
    role: 'owner',
  });

  return c.json({ id: teamId, name, createdBy: userId, createdAt: now }, 201);
});

// ─── GET / — List user's teams ───────────────────────────────────────────────

teamRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const db = createDb(c.env.DB);

  const memberships = await db
    .select({
      id: teamMembers.teamId,
      role: teamMembers.role,
      name: teams.name,
      createdBy: teams.createdBy,
      createdAt: teams.createdAt,
    })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(eq(teamMembers.userId, userId));

  return c.json({ teams: memberships });
});

// ─── POST /accept-invite — Accept invite by token ────────────────────────────

teamRoutes.post('/accept-invite', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);

  const { token } = body as Record<string, unknown>;
  if (!token || typeof token !== 'string') {
    return c.json({ error: 'Missing required field: token' }, 400);
  }

  const db = createDb(c.env.DB);
  const now = new Date().toISOString();

  const invite = await db.select().from(teamInvites).where(eq(teamInvites.token, token)).get();

  if (!invite) return c.json({ error: 'Invalid invite token' }, 404);
  if (invite.expiresAt < now) return c.json({ error: 'Invite expired' }, 410);

  // Check user email matches invite
  const user = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!user || user.email !== invite.email) {
    return c.json({ error: 'Invite not for this user' }, 403);
  }

  // Check not already a member
  const existing = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, invite.teamId), eq(teamMembers.userId, userId)))
    .get();

  if (existing) return c.json({ error: 'Already a team member' }, 409);

  await db.insert(teamMembers).values({
    teamId: invite.teamId,
    userId,
    role: invite.role,
  });

  // Delete the used invite
  await db.delete(teamInvites).where(eq(teamInvites.id, invite.id));

  return c.json({ success: true, teamId: invite.teamId, role: invite.role });
});

// ─── GET /:id — Get team detail + members ────────────────────────────────────

teamRoutes.get('/:id', requireTeamRole('custom'), async (c) => {
  const teamId = c.req.param('id');
  const db = createDb(c.env.DB);

  const team = await db.select().from(teams).where(eq(teams.id, teamId)).get();
  if (!team) return c.json({ error: 'Team not found' }, 404);

  const members = await db
    .select({
      userId: teamMembers.userId,
      role: teamMembers.role,
      email: users.email,
      createdAt: teamMembers.createdAt,
    })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(eq(teamMembers.teamId, teamId));

  return c.json({ team, members });
});

// ─── PUT /:id — Update team name ─────────────────────────────────────────────

teamRoutes.put('/:id', requireTeamRole('admin'), async (c) => {
  const teamId = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);

  const { name } = body as Record<string, unknown>;
  if (!name || typeof name !== 'string') {
    return c.json({ error: 'Missing required field: name' }, 400);
  }

  const db = createDb(c.env.DB);
  await db.update(teams).set({ name }).where(eq(teams.id, teamId));

  return c.json({ success: true });
});

// ─── DELETE /:id — Delete team ───────────────────────────────────────────────

teamRoutes.delete('/:id', requireTeamRole('owner'), async (c) => {
  const teamId = c.req.param('id');
  const db = createDb(c.env.DB);

  // Cascade: delete members, invites first
  await db.delete(teamMembers).where(eq(teamMembers.teamId, teamId));
  await db.delete(teamInvites).where(eq(teamInvites.teamId, teamId));
  await db.delete(teams).where(eq(teams.id, teamId));

  return c.json({ success: true });
});

// ─── POST /:id/invite — Invite member ───────────────────────────────────────

teamRoutes.post('/:id/invite', requireTeamRole('admin'), async (c) => {
  const userId = c.get('userId');
  const teamId = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);

  const { email, role } = body as Record<string, unknown>;
  if (!email || typeof email !== 'string') {
    return c.json({ error: 'Missing required field: email' }, 400);
  }

  const db = createDb(c.env.DB);
  const inviteId = crypto.randomUUID();
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days


  // Prevent inviting with owner role
  if (typeof role === 'string' && role === 'owner') {
    return c.json({ error: 'Cannot assign owner role via invite' }, 403);
  }

  await db.insert(teamInvites).values({
    id: inviteId,
    teamId,
    email,
    token,
    role: typeof role === 'string' ? role : 'member',
    createdBy: userId,
    expiresAt,
  });

  return c.json({ id: inviteId, token, email, expiresAt }, 201);
});

// ─── DELETE /:id/members/:userId — Remove member ─────────────────────────────

teamRoutes.delete('/:id/members/:userId', requireTeamRole('admin'), async (c) => {
  const teamId = c.req.param('id');
  const targetUserId = c.req.param('userId');
  const db = createDb(c.env.DB);

  // Prevent removing the owner
  const target = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, targetUserId)))
    .get();

  if (!target) return c.json({ error: 'Member not found' }, 404);
  if (target.role === 'owner') return c.json({ error: 'Cannot remove the team owner' }, 403);

  await db
    .delete(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, targetUserId)));

  // Revoke shared folder keys for removed user (only for folders with no remaining team access)
  const teamSharedFolders = await db
    .select({ folderId: sharedFolders.folderId })
    .from(sharedFolders)
    .where(eq(sharedFolders.teamId, teamId));

  for (const sf of teamSharedFolders) {
    // Check if user still has access through another team
    const remainingAccess = await db
      .select({ folderId: sharedFolders.folderId })
      .from(sharedFolders)
      .innerJoin(teamMembers, and(
        eq(teamMembers.teamId, sharedFolders.teamId),
        eq(teamMembers.userId, targetUserId)
      ))
      .where(eq(sharedFolders.folderId, sf.folderId))
      .get();

    if (!remainingAccess) {
      await db.delete(sharedFolderKeys)
        .where(and(eq(sharedFolderKeys.folderId, sf.folderId), eq(sharedFolderKeys.userId, targetUserId)));
    }
  }


  return c.json({ success: true });
});

// ─── PUT /:id/members/:userId/role — Change role ─────────────────────────────

teamRoutes.put('/:id/members/:userId/role', requireTeamRole('admin'), async (c) => {
  const teamId = c.req.param('id');
  const targetUserId = c.req.param('userId');
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);

  const { role } = body as Record<string, unknown>;
  if (!role || typeof role !== 'string') {
    return c.json({ error: 'Missing required field: role' }, 400);
  }

  const db = createDb(c.env.DB);

  // Prevent changing the owner's role
  const target = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, targetUserId)))
    .get();

  if (!target) return c.json({ error: 'Member not found' }, 404);
  if (target.role === 'owner') return c.json({ error: 'Cannot change the owner role' }, 403);
  if (role === 'owner') {
    return c.json({ error: 'Cannot assign owner role. Transfer ownership instead.' }, 403);
  }

  await db
    .update(teamMembers)
    .set({ role })
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, targetUserId)));

  return c.json({ success: true });
});

// ─── GET /:id/invites — List invites ─────────────────────────────────────────

teamRoutes.get('/:id/invites', requireTeamRole('admin'), async (c) => {
  const teamId = c.req.param('id');
  const db = createDb(c.env.DB);

  const invites = await db.select().from(teamInvites).where(eq(teamInvites.teamId, teamId));

  return c.json({ invites });
});

// ─── DELETE /:id/invites/:inviteId — Cancel invite ───────────────────────────

teamRoutes.delete('/:id/invites/:inviteId', requireTeamRole('admin'), async (c) => {
  const inviteId = c.req.param('inviteId');
  const teamId = c.req.param('id');
  const db = createDb(c.env.DB);

  const invite = await db
    .select()
    .from(teamInvites)
    .where(and(eq(teamInvites.id, inviteId), eq(teamInvites.teamId, teamId)))
    .get();

  if (!invite) return c.json({ error: 'Invite not found' }, 404);

  await db.delete(teamInvites).where(eq(teamInvites.id, inviteId));

  return c.json({ success: true });
});
