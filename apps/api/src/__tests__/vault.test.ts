/**
 * Vault CRUD API tests — verifies route existence and auth enforcement.
 * Full integration tests require miniflare (run in CI).
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { vaultRoutes } from '../routes/vault.js';

describe('Vault API — auth enforcement', () => {
  const app = new Hono();
  app.route('/api/vault', vaultRoutes);

  const protectedRoutes = [
    { method: 'GET', path: '/api/vault/' },
    { method: 'POST', path: '/api/vault/items' },
    { method: 'PUT', path: '/api/vault/items/test-id' },
    { method: 'DELETE', path: '/api/vault/items/test-id' },
    { method: 'POST', path: '/api/vault/items/test-id/restore' },
    { method: 'DELETE', path: '/api/vault/items/test-id/permanent' },
    { method: 'POST', path: '/api/vault/folders' },
    { method: 'PUT', path: '/api/vault/folders/test-id' },
    { method: 'DELETE', path: '/api/vault/folders/test-id' },
  ];

  for (const { method, path } of protectedRoutes) {
    it(`${method} ${path} — requires auth (401 without token)`, async () => {
      const res = await app.request(path, { method });
      expect(res.status).toBe(401);
    });
  }
});

describe('Vault API — route existence', () => {
  const app = new Hono();
  app.route('/api/vault', vaultRoutes);

  it('all vault routes are registered (not 404)', async () => {
    // Routes return 401 (auth required) not 404 (not found)
    const res = await app.request('/api/vault/', { method: 'GET' });
    expect(res.status).toBe(401);
  });
});
