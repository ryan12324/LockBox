/**
 * Sharing API tests — verifies folder sharing with teams and key management.
 * Tests: route existence and auth enforcement.
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { sharingRoutes } from '../routes/sharing.js';

describe('Sharing API — auth enforcement', () => {
  const app = new Hono<{ Bindings: { DB: D1Database } }>();
  app.route('/api/sharing', sharingRoutes);

  const protectedRoutes = [
    { method: 'POST', path: '/api/sharing/folders/folder-123/share' },
    { method: 'DELETE', path: '/api/sharing/folders/folder-123/unshare' },
    { method: 'GET', path: '/api/sharing/folders/folder-123/keys' },
    { method: 'POST', path: '/api/sharing/folders/folder-123/keys' },
    { method: 'GET', path: '/api/sharing/folders' },
  ];

  for (const { method, path } of protectedRoutes) {
    it(`${method} ${path} — requires auth (401 without token)`, async () => {
      const res = await app.request(path, { method });
      expect(res.status).toBe(401);
    });
  }
});

describe('Sharing API — route existence', () => {
  const app = new Hono<{ Bindings: { DB: D1Database } }>();
  app.route('/api/sharing', sharingRoutes);

  const routes = [
    { method: 'POST', path: '/api/sharing/folders/folder-123/share' },
    { method: 'DELETE', path: '/api/sharing/folders/folder-123/unshare' },
    { method: 'GET', path: '/api/sharing/folders/folder-123/keys' },
    { method: 'POST', path: '/api/sharing/folders/folder-123/keys' },
    { method: 'GET', path: '/api/sharing/folders' },
    { method: 'GET', path: '/api/sharing/folders/folder-123/items' },
  ];

  for (const { method, path } of routes) {
    it(`${method} ${path} — route exists (not 404)`, async () => {
      const res = await app.request(path, { method });
      expect(res.status).not.toBe(404);
    });
  }
});
