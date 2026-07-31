/**
 * Team RBAC middleware — verifies team membership and role requirements.
 */

import { createMiddleware } from 'hono/factory';
import { and, eq } from 'drizzle-orm';
import { createDb } from '../db/index.js';
import { teamMembers } from '../db/schema.js';

type Bindings = { DB: D1Database };
type Variables = { userId: string; teamRole?: string };

export type TeamRole = 'owner' | 'admin' | 'member' | 'custom';

const ROLE_HIERARCHY = new Map<TeamRole, number>([
  ['owner', 4],
  ['admin', 3],
  ['member', 2],
  ['custom', 1],
]);

export function isTeamRole(value: unknown): value is TeamRole {
  return typeof value === 'string' && ROLE_HIERARCHY.has(value as TeamRole);
}

/**
 * Middleware factory that requires the authenticated user to be a member of the team
 * specified by `:id` param, with at least the given minimum role.
 */
export function requireTeamRole(minRole: TeamRole) {
  return createMiddleware<{ Bindings: Bindings; Variables: Variables }>(async (c, next) => {
    const userId = c.get('userId');
    const teamId = c.req.param('id');
    if (!teamId) return c.json({ error: 'Missing team ID' }, 400);

    const db = createDb(c.env.DB);
    const member = await db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
      .get();

    if (!member) return c.json({ error: 'Not a team member' }, 403);

    const userLevel = isTeamRole(member.role) ? (ROLE_HIERARCHY.get(member.role) ?? 0) : 0;
    const requiredLevel = ROLE_HIERARCHY.get(minRole) ?? Number.POSITIVE_INFINITY;
    if (userLevel < requiredLevel) {
      return c.json({ error: 'Insufficient permissions' }, 403);
    }

    c.set('teamRole', member.role);
    await next();
  });
}

/**
 * Middleware that requires team membership (any role).
 */
export const requireTeamMember = requireTeamRole('custom');
