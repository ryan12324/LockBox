/**
 * Teams API tests — verifies team CRUD, membership, invites, and RBAC.
 * Tests: route existence and auth enforcement.
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { teamRoutes } from '../routes/teams.js';

describe('Teams API — auth enforcement', () => {
  const app = new Hono<{ Bindings: { DB: D1Database } }>();
  app.route('/api/teams', teamRoutes);

  const protectedRoutes = [
    { method: 'GET', path: '/api/teams' },
    { method: 'POST', path: '/api/teams' },
    { method: 'GET', path: '/api/teams/team-123' },
    { method: 'PUT', path: '/api/teams/team-123' },
    { method: 'DELETE', path: '/api/teams/team-123' },
    { method: 'POST', path: '/api/teams/team-123/invite' },
    { method: 'POST', path: '/api/teams/accept-invite' },
    { method: 'DELETE', path: '/api/teams/team-123/members/user-456' },
    { method: 'PUT', path: '/api/teams/team-123/members/user-456/role' },
    { method: 'GET', path: '/api/teams/team-123/invites' },
    { method: 'DELETE', path: '/api/teams/team-123/invites/invite-789' },
  ];

  for (const { method, path } of protectedRoutes) {
    it(`${method} ${path} — requires auth (401 without token)`, async () => {
      const res = await app.request(path, { method });
      expect(res.status).toBe(401);
    });
  }
});

describe('Teams API — route existence', () => {
  const app = new Hono<{ Bindings: { DB: D1Database } }>();
  app.route('/api/teams', teamRoutes);

  const routes = [
    { method: 'POST', path: '/api/teams' },
    { method: 'GET', path: '/api/teams' },
    { method: 'POST', path: '/api/teams/accept-invite' },
    { method: 'GET', path: '/api/teams/team-123' },
    { method: 'PUT', path: '/api/teams/team-123' },
    { method: 'DELETE', path: '/api/teams/team-123' },
    { method: 'POST', path: '/api/teams/team-123/invite' },
    { method: 'DELETE', path: '/api/teams/team-123/members/user-456' },
    { method: 'PUT', path: '/api/teams/team-123/members/user-456/role' },
    { method: 'GET', path: '/api/teams/team-123/invites' },
    { method: 'DELETE', path: '/api/teams/team-123/invites/invite-789' },
  ];

  for (const { method, path } of routes) {
    it(`${method} ${path} — route exists (not 404)`, async () => {
      const res = await app.request(path, { method });
      expect(res.status).not.toBe(404);
    });
  }
});
