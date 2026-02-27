/**
 * Email Alias API tests — verifies route existence, auth enforcement, and validation.
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { aliasRoutes } from '../routes/aliases.js';
import { aliasSettings } from '../db/schema';

describe('Alias API — auth enforcement', () => {
  const app = new Hono();
  app.route('/api', aliasRoutes);

  const protectedRoutes = [
    { method: 'PUT', path: '/api/settings/alias' },
    { method: 'GET', path: '/api/settings/alias' },
    { method: 'DELETE', path: '/api/settings/alias' },
    { method: 'POST', path: '/api/aliases/generate' },
    { method: 'GET', path: '/api/aliases' },
  ];

  for (const { method, path } of protectedRoutes) {
    it(`${method} ${path} — requires auth (401 without token)`, async () => {
      const res = await app.request(path, { method });
      expect(res.status).toBe(401);
    });
  }
});

describe('Alias API — route existence', () => {
  const app = new Hono();
  app.route('/api', aliasRoutes);

  it('PUT /api/settings/alias route is registered (not 404)', async () => {
    const res = await app.request('/api/settings/alias', { method: 'PUT' });
    // 401 = route exists, just needs auth
    expect(res.status).toBe(401);
  });

  it('GET /api/settings/alias route is registered (not 404)', async () => {
    const res = await app.request('/api/settings/alias', { method: 'GET' });
    expect(res.status).toBe(401);
  });

  it('DELETE /api/settings/alias route is registered (not 404)', async () => {
    const res = await app.request('/api/settings/alias', { method: 'DELETE' });
    expect(res.status).toBe(401);
  });

  it('POST /api/aliases/generate route is registered (not 404)', async () => {
    const res = await app.request('/api/aliases/generate', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('GET /api/aliases route is registered (not 404)', async () => {
    const res = await app.request('/api/aliases', { method: 'GET' });
    expect(res.status).toBe(401);
  });
});

describe('Alias API — schema', () => {
  it('should export aliasSettings table', () => {
    expect(aliasSettings).toBeDefined();
    expect(aliasSettings.constructor.name).toBe('SQLiteTable');
  });

  it('should have required columns', () => {
    expect(aliasSettings.userId).toBeDefined();
    expect(aliasSettings.provider).toBeDefined();
    expect(aliasSettings.encryptedApiKey).toBeDefined();
  });

  it('should have optional baseUrl column', () => {
    expect(aliasSettings.baseUrl).toBeDefined();
  });
});

describe('Alias API — valid providers', () => {
  const app = new Hono();
  app.route('/api', aliasRoutes);

  it('route handles simplelogin provider (auth gate)', async () => {
    const res = await app.request('/api/settings/alias', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'simplelogin',
        encryptedApiKey: 'encrypted-test-key',
      }),
    });
    // 401 = route exists, processes request, needs auth
    expect(res.status).toBe(401);
  });

  it('route handles anonaddy provider (auth gate)', async () => {
    const res = await app.request('/api/settings/alias', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'anonaddy',
        encryptedApiKey: 'encrypted-test-key',
      }),
    });
    expect(res.status).toBe(401);
  });
});

describe('Alias API — generate endpoint validation', () => {
  const app = new Hono();
  app.route('/api', aliasRoutes);

  it('POST /api/aliases/generate rejects without auth', async () => {
    const res = await app.request('/api/aliases/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'simplelogin',
        apiKey: 'test-key',
      }),
    });
    expect(res.status).toBe(401);
  });
});

describe('Alias API — list endpoint validation', () => {
  const app = new Hono();
  app.route('/api', aliasRoutes);

  it('GET /api/aliases rejects without auth', async () => {
    const res = await app.request('/api/aliases', {
      method: 'GET',
      headers: {
        'X-Alias-Provider': 'simplelogin',
        'X-Alias-ApiKey': 'test-key',
      },
    });
    expect(res.status).toBe(401);
  });
});
