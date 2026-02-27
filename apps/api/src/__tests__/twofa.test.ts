/**
 * 2FA API tests — verifies route existence and auth enforcement.
 * Tests the TOTP 2FA setup, verify, disable, and validate endpoints.
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { twofaRoutes } from '../routes/twofa.js';

describe('2FA API — route existence', () => {
  const app = new Hono();
  app.route('/api/auth/2fa', twofaRoutes);

  const routes = [
    { method: 'POST', path: '/api/auth/2fa/setup' },
    { method: 'POST', path: '/api/auth/2fa/verify' },
    { method: 'POST', path: '/api/auth/2fa/disable' },
    { method: 'POST', path: '/api/auth/2fa/validate' },
  ];

  for (const { method, path } of routes) {
    it(`${method} ${path} — route exists (not 404)`, async () => {
      const res = await app.request(path, { method });
      // setup/verify/disable need auth → 401; validate doesn't → might be 400 (missing body)
      expect(res.status).not.toBe(404);
    });
  }
});

describe('2FA API — auth enforcement', () => {
  const app = new Hono();
  app.route('/api/auth/2fa', twofaRoutes);

  it('POST /api/auth/2fa/setup — returns 401 without auth header', async () => {
    const res = await app.request('/api/auth/2fa/setup', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('POST /api/auth/2fa/verify — returns 401 without auth header', async () => {
    const res = await app.request('/api/auth/2fa/verify', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('POST /api/auth/2fa/disable — returns 401 without auth header', async () => {
    const res = await app.request('/api/auth/2fa/disable', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('POST /api/auth/2fa/validate — does NOT require auth (returns 400 for missing body)', async () => {
    const res = await app.request('/api/auth/2fa/validate', { method: 'POST' });
    // validate doesn't use authMiddleware, so it should not be 401
    // It should be 400 because no JSON body is provided
    expect(res.status).toBe(400);
  });
});

describe('2FA API — validate input validation', () => {
  const app = new Hono();
  app.route('/api/auth/2fa', twofaRoutes);

  it('POST /api/auth/2fa/validate — returns 400 for missing fields', async () => {
    const res = await app.request('/api/auth/2fa/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tempToken: 'abc' }), // missing code
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBeDefined();
  });

  it('POST /api/auth/2fa/validate — returns 400 for empty body', async () => {
    const res = await app.request('/api/auth/2fa/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
