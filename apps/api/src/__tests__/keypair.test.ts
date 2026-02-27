/**
 * Keypair API tests — verifies E2EE key pair management.
 * Tests: route existence and auth enforcement.
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { keypairRoutes } from '../routes/keypair.js';

describe('Keypair API — auth enforcement', () => {
  const app = new Hono<{ Bindings: { DB: D1Database } }>();
  app.route('/api/keypair', keypairRoutes);

  const protectedRoutes = [
    { method: 'GET', path: '/api/keypair' },
    { method: 'POST', path: '/api/keypair' },
  ];

  for (const { method, path } of protectedRoutes) {
    it(`${method} ${path} — requires auth (401 without token)`, async () => {
      const res = await app.request(path, { method });
      expect(res.status).toBe(401);
    });
  }
});

describe('Keypair API — route existence', () => {
  const app = new Hono<{ Bindings: { DB: D1Database } }>();
  app.route('/api/keypair', keypairRoutes);

  const routes = [
    { method: 'POST', path: '/api/keypair' },
    { method: 'GET', path: '/api/keypair' },
    { method: 'GET', path: '/api/keypair/user-123' },
  ];

  for (const { method, path } of routes) {
    it(`${method} ${path} — route exists (not 404)`, async () => {
      const res = await app.request(path, { method });
      expect(res.status).not.toBe(404);
    });
  }
});
