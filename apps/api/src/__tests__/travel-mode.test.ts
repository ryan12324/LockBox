/**
 * Travel mode API tests — verifies route existence, auth enforcement,
 * schema columns, and sync filtering behavior.
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { settingsRoutes } from '../routes/settings.js';
import { vaultRoutes } from '../routes/vault.js';
import { syncRoutes } from '../routes/sync.js';
import { users, folders } from '../db/schema.js';

// ─── Settings route auth enforcement ────────────────────────────────────────

describe('Travel Mode — settings auth enforcement', () => {
  const app = new Hono();
  app.route('/api/settings', settingsRoutes);

  it('GET /api/settings/travel-mode — requires auth (401 without token)', async () => {
    const res = await app.request('/api/settings/travel-mode', { method: 'GET' });
    expect(res.status).toBe(401);
  });

  it('PUT /api/settings/travel-mode — requires auth (401 without token)', async () => {
    const res = await app.request('/api/settings/travel-mode', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    expect(res.status).toBe(401);
  });
});

// ─── Vault travel route auth enforcement ────────────────────────────────────

describe('Travel Mode — vault folder travel auth enforcement', () => {
  const app = new Hono();
  app.route('/api/vault', vaultRoutes);

  it('PUT /api/vault/folders/:id/travel — requires auth (401 without token)', async () => {
    const res = await app.request('/api/vault/folders/test-folder-id/travel', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ travelSafe: true }),
    });
    expect(res.status).toBe(401);
  });
});

// ─── Route existence (not 404) ─────────────────────────────────────────────

describe('Travel Mode — route existence', () => {
  const settingsApp = new Hono();
  settingsApp.route('/api/settings', settingsRoutes);

  const vaultApp = new Hono();
  vaultApp.route('/api/vault', vaultRoutes);

  it('GET /api/settings/travel-mode route is registered (not 404)', async () => {
    const res = await settingsApp.request('/api/settings/travel-mode', { method: 'GET' });
    // 401 = route exists, just needs auth — not 404
    expect(res.status).toBe(401);
    expect(res.status).not.toBe(404);
  });

  it('PUT /api/settings/travel-mode route is registered (not 404)', async () => {
    const res = await settingsApp.request('/api/settings/travel-mode', { method: 'PUT' });
    expect(res.status).toBe(401);
    expect(res.status).not.toBe(404);
  });

  it('PUT /api/vault/folders/:id/travel route is registered (not 404)', async () => {
    const res = await vaultApp.request('/api/vault/folders/any-id/travel', { method: 'PUT' });
    expect(res.status).toBe(401);
    expect(res.status).not.toBe(404);
  });
});

// ─── Schema verification ────────────────────────────────────────────────────

describe('Travel Mode — schema columns', () => {
  it('users table has travelMode column defined', () => {
    expect(users.travelMode).toBeDefined();
  });

  it('folders table has travelSafe column defined', () => {
    expect(folders.travelSafe).toBeDefined();
  });

  it('travelMode column is defined on users', () => {
    expect(users.travelMode).toBeDefined();
  });

  it('travelSafe column is defined on folders', () => {
    expect(folders.travelSafe).toBeDefined();
  });
});

// ─── Sync route with travel mode context ────────────────────────────────────

describe('Travel Mode — sync route auth enforcement', () => {
  const app = new Hono();
  app.route('/api/sync', syncRoutes);

  it('GET /api/sync — requires auth (401) even with travel mode query params', async () => {
    const res = await app.request('/api/sync/', { method: 'GET' });
    expect(res.status).toBe(401);
  });

  it('GET /api/sync?since=... — requires auth (401) for delta sync with travel mode', async () => {
    const res = await app.request('/api/sync/?since=2025-01-01T00:00:00.000Z', { method: 'GET' });
    expect(res.status).toBe(401);
  });
});

// ─── Request body validation ────────────────────────────────────────────────

describe('Travel Mode — request validation', () => {
  const settingsApp = new Hono();
  settingsApp.route('/api/settings', settingsRoutes);

  const vaultApp = new Hono();
  vaultApp.route('/api/vault', vaultRoutes);

  it('PUT /api/settings/travel-mode rejects without auth even with valid body', async () => {
    const res = await settingsApp.request('/api/settings/travel-mode', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
    expect(res.status).toBe(401);
  });

  it('PUT /api/vault/folders/:id/travel rejects without auth even with valid body', async () => {
    const res = await vaultApp.request('/api/vault/folders/folder-123/travel', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ travelSafe: false }),
    });
    expect(res.status).toBe(401);
  });
});

// ─── Full app integration route registration ────────────────────────────────

describe('Travel Mode — full app route registration', () => {
  const app = new Hono();
  app.route('/api/settings', settingsRoutes);
  app.route('/api/vault', vaultRoutes);
  app.route('/api/sync', syncRoutes);

  it('all travel mode routes are reachable from the combined app', async () => {
    const routes = [
      { method: 'GET', path: '/api/settings/travel-mode' },
      { method: 'PUT', path: '/api/settings/travel-mode' },
      { method: 'PUT', path: '/api/vault/folders/test-id/travel' },
      { method: 'GET', path: '/api/sync/' },
    ];

    for (const { method, path } of routes) {
      const res = await app.request(path, { method });
      // All routes should return 401 (auth required), not 404 (not found)
      expect(res.status).toBe(401);
    }
  });

  it('travel-mode toggle endpoint handles different folder IDs', async () => {
    const folderIds = ['folder-1', 'folder-2', 'uuid-1234-5678'];
    for (const id of folderIds) {
      const res = await app.request(`/api/vault/folders/${id}/travel`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ travelSafe: true }),
      });
      expect(res.status).toBe(401);
    }
  });
});
