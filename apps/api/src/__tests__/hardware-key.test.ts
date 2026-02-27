/**
 * Hardware key auth API tests — verifies route existence, auth enforcement, and endpoints.
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { hardwareKeyRoutes } from '../routes/hardware-key.js';
import { hardwareKeys } from '../db/schema.js';

describe('Hardware Key API — auth enforcement', () => {
  const app = new Hono();
  app.route('/api/auth/hardware-key', hardwareKeyRoutes);

  const protectedRoutes = [
    { method: 'POST', path: '/api/auth/hardware-key/setup' },
    { method: 'GET', path: '/api/auth/hardware-key' },
    { method: 'DELETE', path: '/api/auth/hardware-key/test-key-id' },
  ];

  for (const { method, path } of protectedRoutes) {
    it(`${method} ${path} — requires auth (401 without token)`, async () => {
      const res = await app.request(path, { method });
      expect(res.status).toBe(401);
    });
  }
});

describe('Hardware Key API — route existence', () => {
  const app = new Hono();
  app.route('/api/auth/hardware-key', hardwareKeyRoutes);

  it('POST /api/auth/hardware-key/setup — route exists (401, not 404)', async () => {
    const res = await app.request('/api/auth/hardware-key/setup', { method: 'POST' });
    expect(res.status).toBe(401);
    expect(res.status).not.toBe(404);
  });

  it('GET /api/auth/hardware-key — route exists (401, not 404)', async () => {
    const res = await app.request('/api/auth/hardware-key', { method: 'GET' });
    expect(res.status).toBe(401);
    expect(res.status).not.toBe(404);
  });

  it('DELETE /api/auth/hardware-key/:id — route exists (401, not 404)', async () => {
    const res = await app.request('/api/auth/hardware-key/test-key-id', { method: 'DELETE' });
    expect(res.status).toBe(401);
    expect(res.status).not.toBe(404);
  });

  it('POST /api/auth/hardware-key/challenge — route exists (not 404)', async () => {
    const res = await app.request('/api/auth/hardware-key/challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    // Challenge doesn't require auth, so it should return 400 (missing keyId), not 404
    expect(res.status).not.toBe(404);
  });

  it('POST /api/auth/hardware-key/verify — route exists (not 404)', async () => {
    const res = await app.request('/api/auth/hardware-key/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    // Verify doesn't require auth, so it should return 400, not 404
    expect(res.status).not.toBe(404);
  });
});

describe('Hardware Key API — challenge endpoint', () => {
  const app = new Hono();
  app.route('/api/auth/hardware-key', hardwareKeyRoutes);

  it('POST /challenge — returns 400 for missing keyId', async () => {
    const res = await app.request('/api/auth/hardware-key/challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain('keyId');
  });

  it('POST /challenge — returns 400 for invalid JSON', async () => {
    const res = await app.request('/api/auth/hardware-key/challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    expect(res.status).toBe(400);
  });
});

describe('Hardware Key API — verify endpoint', () => {
  const app = new Hono();
  app.route('/api/auth/hardware-key', hardwareKeyRoutes);

  it('POST /verify — returns 400 for missing fields', async () => {
    const res = await app.request('/api/auth/hardware-key/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyId: 'test' }),
    });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBeDefined();
  });

  it('POST /verify — returns 401 for invalid challengeId', async () => {
    const res = await app.request('/api/auth/hardware-key/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keyId: 'test-key',
        challengeId: 'nonexistent-challenge',
        signature: 'test-sig',
      }),
    });
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain('Invalid or expired challenge');
  });
});

describe('Hardware Key API — schema', () => {
  it('hardwareKeys table is exported from schema', () => {
    expect(hardwareKeys).toBeDefined();
    expect(hardwareKeys.constructor.name).toBe('SQLiteTable');
  });

  it('hardwareKeys table has required columns', () => {
    expect(hardwareKeys.id).toBeDefined();
    expect(hardwareKeys.userId).toBeDefined();
    expect(hardwareKeys.keyType).toBeDefined();
    expect(hardwareKeys.publicKey).toBeDefined();
    expect(hardwareKeys.wrappedMasterKey).toBeDefined();
    expect(hardwareKeys.createdAt).toBeDefined();
  });
});

describe('Hardware Key API — module exports', () => {
  it('should export hardwareKeyRoutes as a Hono instance', () => {
    expect(hardwareKeyRoutes).toBeDefined();
  });

  it('hardwareKeyRoutes should be a Hono app', () => {
    expect(typeof hardwareKeyRoutes.request).toBe('function');
  });
});
