import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { vaultRoutes } from '../routes/vault.js';

describe('Trash API', () => {
  const app = new Hono();
  app.route('/api/vault', vaultRoutes);

  it('GET /api/vault/trash — requires auth (401 without token)', async () => {
    const res = await app.request('/api/vault/trash', { method: 'GET' });
    expect(res.status).toBe(401);
  });
});

describe('Scheduled handler', () => {
  it('index.ts exports an object with fetch and scheduled', async () => {
    const mod = await import('../index.js');
    expect(mod.default).toBeDefined();
    expect(typeof mod.default.fetch).toBe('function');
    expect(typeof mod.default.scheduled).toBe('function');
  });
});
