/**
 * Share Links API tests — verifies anonymous password sharing via encrypted links.
 * Tests: route existence and auth enforcement.
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { shareLinkRoutes } from '../routes/share-links.js';

describe('Share Links API — auth enforcement', () => {
  const app = new Hono<{ Bindings: { DB: D1Database } }>();
  app.route('/api/share-links', shareLinkRoutes);

  const protectedRoutes = [
    { method: 'POST', path: '/api/share-links' },
    { method: 'GET', path: '/api/share-links' },
    { method: 'DELETE', path: '/api/share-links/link-123' },
  ];

  for (const { method, path } of protectedRoutes) {
    it(`${method} ${path} — requires auth (401 without token)`, async () => {
      const res = await app.request(path, { method });
      expect(res.status).toBe(401);
    });
  }
});

describe('Share Links API — redeem without auth', () => {
  const app = new Hono<{ Bindings: { DB: D1Database } }>();
  app.route('/api/share-links', shareLinkRoutes);

  it('GET /api/share-links/:id/redeem — requires Bearer token', async () => {
    const res = await app.request('/api/share-links/link-123/redeem', {
      method: 'GET',
    });
    expect(res.status).toBe(401);
  });

  it('GET /api/share-links/:id/redeem — rejects missing Bearer prefix', async () => {
    const res = await app.request('/api/share-links/link-123/redeem', {
      method: 'GET',
      headers: {
        Authorization: 'Basic test-token',
      },
    });
    expect(res.status).toBe(401);
  });
});
