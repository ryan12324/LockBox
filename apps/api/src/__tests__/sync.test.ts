/**
 * Sync API tests — verifies route existence and auth enforcement.
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { syncRoutes } from '../routes/sync.js';

describe('Sync API — auth enforcement', () => {
  const app = new Hono();
  app.route('/api/sync', syncRoutes);

  it('GET /api/sync — requires auth (401 without token)', async () => {
    const res = await app.request('/api/sync/', { method: 'GET' });
    expect(res.status).toBe(401);
  });

  it('POST /api/sync/push — requires auth (401 without token)', async () => {
    const res = await app.request('/api/sync/push', { method: 'POST' });
    expect(res.status).toBe(401);
  });
});
