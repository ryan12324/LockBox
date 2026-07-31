/**
 * Teams CRUD routes — create, list, manage teams, members, and invites.
 * 11 endpoints total.
 */

import { Hono } from 'hono';
import { eq, and, ne } from 'drizzle-orm';
import { createDb } from '../db/index.js';
import { teams, teamMembers, teamInvites, users, sharedFolders, sharedFolderKeys } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import { isTeamRole, requireTeamRole } from '../middleware/team-auth.js';

type Bindings = { DB: D1Database };
type Variables = { userId: string; teamRole?: string };

export const teamRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const ASSIGNABLE_ROLES = new Set(['admin', 'member']);

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

teamRoutes.use('*', authMiddleware);

// ─── POST / — Create team ────────────────────────────────────────────────────

teamRoutes.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON' }, 400);

  const { name } = body as Record<string, unknown>;
  if (typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 100) {
    return c.json({ error: 'Team name must contain between 1 and 100 characters' }, 400);
  }

  const db = createDb(c.env.DB);
  const teamId = crypto.randomUUID();
  const now = new Date().toISOString();

  // Team creation and its required owner membership must be all-or-nothing.
  await db.batch([
    db.insert(teams).values({
      id: teamId,
      name: name.trim(),
      createdBy: userId,
      createdAt: now,
    }),
    db.insert(teamMembers).values({
      teamId,
      userId,
      role: 'owner',
      createdAt: now,
    }),
  ]);

  const owner = await db.select().from(users).where(eq(users.id, userId)).get();
  return c.json(
    {
      team: { id: teamId, name: name.trim(), createdBy: userId, createdAt: now },
      membership: {
        teamId,
        userId,
        email: owner?.email ?? '',
        role: 'owner',
        createdAt: now,
      },
    },
    201
  );
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
  if (!user || normalizeEmail(user.email) !== normalizeEmail(invite.email)) {
    return c.json({ error: 'Invite not for this user' }, 403);
  }

  if (!isTeamRole(invite.role) || !ASSIGNABLE_ROLES.has(invite.role)) {
    return c.json({ error: 'Invite has an invalid role' }, 400);
  }

  const existingMembership = await db
    .select({ userId: teamMembers.userId })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, invite.teamId), eq(teamMembers.userId, userId)))
    .get();
  if (existingMembership) return c.json({ error: 'Already a team member' }, 409);

  // Insert only while the matching invite still exists, then consume it in the
  // same D1 transaction. This closes the accept-vs-cancel race.
  const [membershipResult] = await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT OR IGNORE INTO team_members (team_id, user_id, role, created_at)
       SELECT team_id, ?, role, ?
       FROM team_invites
       WHERE id = ? AND token = ? AND lower(email) = ? AND expires_at >= ?`
    ).bind(userId, now, invite.id, invite.token, normalizeEmail(user.email), now),
    c.env.DB.prepare('DELETE FROM team_invites WHERE id = ?').bind(invite.id),
  ]);
  if ((membershipResult.meta.changes ?? 0) === 0) {
    return c.json({ error: 'Invite is no longer available' }, 409);
  }

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
  if (typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 100) {
    return c.json({ error: 'Team name must contain between 1 and 100 characters' }, 400);
  }

  const db = createDb(c.env.DB);
  await db.update(teams).set({ name: name.trim() }).where(eq(teams.id, teamId));

  const team = await db.select().from(teams).where(eq(teams.id, teamId)).get();
  return c.json({ team });
});

// ─── DELETE /:id — Delete team ───────────────────────────────────────────────

teamRoutes.delete('/:id', requireTeamRole('owner'), async (c) => {
  const teamId = c.req.param('id');
  const db = createDb(c.env.DB);

  const teamFolderShares = await db
    .select({
      folderId: sharedFolders.folderId,
      ownerUserId: sharedFolders.ownerUserId,
    })
    .from(sharedFolders)
    .where(eq(sharedFolders.teamId, teamId));

  const wrappedKeysToDelete: Array<{ folderId: string; userId: string }> = [];

  for (const share of teamFolderShares) {
    const wrappedKeys = await db
      .select({ userId: sharedFolderKeys.userId })
      .from(sharedFolderKeys)
      .where(eq(sharedFolderKeys.folderId, share.folderId));

    for (const wrappedKey of wrappedKeys) {
      if (wrappedKey.userId === share.ownerUserId) continue;
      const remainingAccess = await db
        .select({ folderId: sharedFolders.folderId })
        .from(sharedFolders)
        .innerJoin(
          teamMembers,
          and(
            eq(teamMembers.teamId, sharedFolders.teamId),
            eq(teamMembers.userId, wrappedKey.userId)
          )
        )
        .where(and(eq(sharedFolders.folderId, share.folderId), ne(sharedFolders.teamId, teamId)))
        .get();

      if (!remainingAccess) {
        wrappedKeysToDelete.push({ folderId: share.folderId, userId: wrappedKey.userId });
      }
    }
  }

  // Remove dependent share records, memberships, invites, team, and revoked
  // key wraps atomically. Folders and ciphertext remain in the owner's vault.
  await db.batch([
    db.delete(sharedFolders).where(eq(sharedFolders.teamId, teamId)),
    db.delete(teamMembers).where(eq(teamMembers.teamId, teamId)),
    db.delete(teamInvites).where(eq(teamInvites.teamId, teamId)),
    db.delete(teams).where(eq(teams.id, teamId)),
    ...wrappedKeysToDelete.map(({ folderId, userId: wrappedUserId }) =>
      db
        .delete(sharedFolderKeys)
        .where(
          and(
            eq(sharedFolderKeys.folderId, folderId),
            eq(sharedFolderKeys.userId, wrappedUserId)
          )
        )
    ),
  ]);

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

  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) {
    return c.json({ error: 'Invalid email address' }, 400);
  }
  const requestedRole = typeof role === 'string' ? role : 'member';
  if (!ASSIGNABLE_ROLES.has(requestedRole)) {
    return c.json({ error: 'Role must be admin or member' }, 400);
  }

  const db = createDb(c.env.DB);
  const inviteId = crypto.randomUUID();
  const token = crypto.randomUUID();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

  const invitedUser = await db.select({ id: users.id }).from(users).where(eq(users.email, normalizedEmail)).get();
  if (invitedUser) {
    const membership = await db
      .select({ userId: teamMembers.userId })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, invitedUser.id)))
      .get();
    if (membership) return c.json({ error: 'User is already a team member' }, 409);
  }

  const existingInvite = await db
    .select({ id: teamInvites.id, expiresAt: teamInvites.expiresAt })
    .from(teamInvites)
    .where(and(eq(teamInvites.teamId, teamId), eq(teamInvites.email, normalizedEmail)))
    .get();
  if (existingInvite?.expiresAt && existingInvite.expiresAt >= now) {
    return c.json({ error: 'An active invite already exists for this email' }, 409);
  }
  if (existingInvite?.id) await db.delete(teamInvites).where(eq(teamInvites.id, existingInvite.id));

  const inserted = await db
    .insert(teamInvites)
    .values({
      id: inviteId,
      teamId,
      email: normalizedEmail,
      token,
      role: requestedRole,
      createdBy: userId,
      expiresAt,
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: teamInvites.id });
  if (inserted.length === 0) {
    return c.json({ error: 'An active invite already exists for this email' }, 409);
  }

  return c.json(
    {
      invite: {
        id: inviteId,
        teamId,
        token,
        email: normalizedEmail,
        role: requestedRole,
        createdBy: userId,
        expiresAt,
        createdAt: now,
      },
    },
    201
  );
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

  // Revoke shared folder keys only when another membership does not preserve
  // access to that same folder.
  const teamSharedFolders = await db
    .select({ folderId: sharedFolders.folderId })
    .from(sharedFolders)
    .where(eq(sharedFolders.teamId, teamId));

  const folderKeysToDelete: string[] = [];
  for (const sf of teamSharedFolders) {
    const remainingAccess = await db
      .select({ folderId: sharedFolders.folderId })
      .from(sharedFolders)
      .innerJoin(teamMembers, and(
        eq(teamMembers.teamId, sharedFolders.teamId),
        eq(teamMembers.userId, targetUserId)
      ))
      .where(and(eq(sharedFolders.folderId, sf.folderId), ne(sharedFolders.teamId, teamId)))
      .get();

    if (!remainingAccess) {
      folderKeysToDelete.push(sf.folderId);
    }
  }

  await db.batch([
    db
      .delete(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, targetUserId))),
    ...folderKeysToDelete.map((folderId) =>
      db
        .delete(sharedFolderKeys)
        .where(
          and(
            eq(sharedFolderKeys.folderId, folderId),
            eq(sharedFolderKeys.userId, targetUserId)
          )
        )
    ),
  ]);

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
  if (!ASSIGNABLE_ROLES.has(role)) {
    return c.json({ error: 'Role must be admin or member' }, 400);
  }

  await db
    .update(teamMembers)
    .set({ role })
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, targetUserId)));

  return c.json({ success: true, role });
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
