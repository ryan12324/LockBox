/**
 * Emergency Access API tests — verifies route existence, auth enforcement,
 * schema exports, and validation logic.
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { emergencyRoutes } from '../routes/emergency.js';
import { emergencyAccessGrants, emergencyAccessRequests } from '../db/schema.js';

describe('Emergency Access API — auth enforcement', () => {
  const app = new Hono();
  app.route('/api/emergency', emergencyRoutes);

  const protectedRoutes = [
    { method: 'POST', path: '/api/emergency/grants' },
    { method: 'GET', path: '/api/emergency/grants' },
    { method: 'GET', path: '/api/emergency/requests' },
    { method: 'POST', path: '/api/emergency/grants/grant-123/confirm' },
    { method: 'DELETE', path: '/api/emergency/grants/grant-123' },
    { method: 'POST', path: '/api/emergency/requests' },
    { method: 'POST', path: '/api/emergency/grants/grant-123/reject' },
    { method: 'POST', path: '/api/emergency/grants/grant-123/approve' },
    { method: 'GET', path: '/api/emergency/grants/grant-123/access' },
  ];

  for (const { method, path } of protectedRoutes) {
    it(`${method} ${path} — requires auth (401 without token)`, async () => {
      const res = await app.request(path, { method });
      expect(res.status).toBe(401);
    });
  }
});

describe('Emergency Access API — route existence', () => {
  const app = new Hono();
  app.route('/api/emergency', emergencyRoutes);

  const routes = [
    { method: 'POST', path: '/api/emergency/grants' },
    { method: 'GET', path: '/api/emergency/grants' },
    { method: 'GET', path: '/api/emergency/requests' },
    { method: 'POST', path: '/api/emergency/grants/grant-123/confirm' },
    { method: 'DELETE', path: '/api/emergency/grants/grant-123' },
    { method: 'POST', path: '/api/emergency/requests' },
    { method: 'POST', path: '/api/emergency/grants/grant-123/reject' },
    { method: 'POST', path: '/api/emergency/grants/grant-123/approve' },
    { method: 'GET', path: '/api/emergency/grants/grant-123/access' },
  ];

  for (const { method, path } of routes) {
    it(`${method} ${path} — route exists (not 404)`, async () => {
      const res = await app.request(path, { method });
      expect(res.status).not.toBe(404);
    });
  }
});

describe('Emergency Access API — schema', () => {
  it('should export emergencyAccessGrants table', () => {
    expect(emergencyAccessGrants).toBeDefined();
    expect(emergencyAccessGrants.constructor.name).toBe('SQLiteTable');
  });

  it('should export emergencyAccessRequests table', () => {
    expect(emergencyAccessRequests).toBeDefined();
    expect(emergencyAccessRequests.constructor.name).toBe('SQLiteTable');
  });

  it('emergencyAccessGrants should have required columns', () => {
    expect(emergencyAccessGrants.id).toBeDefined();
    expect(emergencyAccessGrants.grantorUserId).toBeDefined();
    expect(emergencyAccessGrants.granteeEmail).toBeDefined();
    expect(emergencyAccessGrants.granteeUserId).toBeDefined();
    expect(emergencyAccessGrants.waitPeriodDays).toBeDefined();
    expect(emergencyAccessGrants.status).toBeDefined();
    expect(emergencyAccessGrants.encryptedUserKey).toBeDefined();
    expect(emergencyAccessGrants.createdAt).toBeDefined();
    expect(emergencyAccessGrants.updatedAt).toBeDefined();
  });

  it('emergencyAccessRequests should have required columns', () => {
    expect(emergencyAccessRequests.id).toBeDefined();
    expect(emergencyAccessRequests.grantId).toBeDefined();
    expect(emergencyAccessRequests.requestedAt).toBeDefined();
    expect(emergencyAccessRequests.approvedAt).toBeDefined();
    expect(emergencyAccessRequests.rejectedAt).toBeDefined();
    expect(emergencyAccessRequests.expiresAt).toBeDefined();
  });
});

describe('Emergency Access API — validation (auth gate)', () => {
  const app = new Hono();
  app.route('/api/emergency', emergencyRoutes);

  it('POST /grants — rejects without auth even with valid body', async () => {
    const res = await app.request('/api/emergency/grants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        granteeEmail: 'trusted@example.com',
        waitPeriodDays: 7,
        encryptedUserKey: 'encrypted-key-data',
      }),
    });
    expect(res.status).toBe(401);
  });

  it('POST /grants — handles all valid wait periods (auth gate)', async () => {
    for (const days of [1, 3, 7, 14, 30]) {
      const res = await app.request('/api/emergency/grants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          granteeEmail: 'trusted@example.com',
          waitPeriodDays: days,
          encryptedUserKey: 'encrypted-key-data',
        }),
      });
      expect(res.status).toBe(401);
    }
  });

  it('POST /requests — rejects without auth even with valid body', async () => {
    const res = await app.request('/api/emergency/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grantId: 'grant-123' }),
    });
    expect(res.status).toBe(401);
  });

  it('POST /grants/:id/confirm — requires auth', async () => {
    const res = await app.request('/api/emergency/grants/some-grant-id/confirm', {
      method: 'POST',
    });
    expect(res.status).toBe(401);
  });

  it('POST /grants/:id/reject — requires auth', async () => {
    const res = await app.request('/api/emergency/grants/some-grant-id/reject', {
      method: 'POST',
    });
    expect(res.status).toBe(401);
  });

  it('POST /grants/:id/approve — requires auth', async () => {
    const res = await app.request('/api/emergency/grants/some-grant-id/approve', {
      method: 'POST',
    });
    expect(res.status).toBe(401);
  });

  it('GET /grants/:id/access — requires auth', async () => {
    const res = await app.request('/api/emergency/grants/some-grant-id/access', {
      method: 'GET',
    });
    expect(res.status).toBe(401);
  });

  it('DELETE /grants/:id — requires auth', async () => {
    const res = await app.request('/api/emergency/grants/some-grant-id', {
      method: 'DELETE',
    });
    expect(res.status).toBe(401);
  });
});

describe('Emergency Access API — lifecycle routes', () => {
  const app = new Hono();
  app.route('/api/emergency', emergencyRoutes);

  it('confirm route accepts POST with grant ID param', async () => {
    const res = await app.request('/api/emergency/grants/any-id/confirm', { method: 'POST' });
    expect(res.status).toBe(401); // route exists, needs auth
  });

  it('reject route accepts POST with grant ID param', async () => {
    const res = await app.request('/api/emergency/grants/any-id/reject', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('approve route accepts POST with grant ID param', async () => {
    const res = await app.request('/api/emergency/grants/any-id/approve', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('access route accepts GET with grant ID param', async () => {
    const res = await app.request('/api/emergency/grants/any-id/access', { method: 'GET' });
    expect(res.status).toBe(401);
  });

  it('revoke route accepts DELETE with grant ID param', async () => {
    const res = await app.request('/api/emergency/grants/any-id', { method: 'DELETE' });
    expect(res.status).toBe(401);
  });
});
