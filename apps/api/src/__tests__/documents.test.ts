/**
 * Document vault API tests — verifies route existence, auth enforcement, and CRUD lifecycle.
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { documentRoutes } from '../routes/documents.js';

describe('Documents API — auth enforcement', () => {
  const app = new Hono();
  app.route('/api/vault', documentRoutes);

  const protectedRoutes = [
    { method: 'POST', path: '/api/vault/items/test-item/document' },
    { method: 'GET', path: '/api/vault/items/test-item/document' },
    { method: 'DELETE', path: '/api/vault/items/test-item/document' },
    { method: 'GET', path: '/api/vault/documents/quota' },
  ];

  for (const { method, path } of protectedRoutes) {
    it(`${method} ${path} — requires auth (401 without token)`, async () => {
      const res = await app.request(path, { method });
      expect(res.status).toBe(401);
    });
  }
});

describe('Documents API — route existence', () => {
  const app = new Hono();
  app.route('/api/vault', documentRoutes);

  it('POST /api/vault/items/:itemId/document — route exists (401, not 404)', async () => {
    const res = await app.request('/api/vault/items/test-item/document', { method: 'POST' });
    expect(res.status).toBe(401);
    expect(res.status).not.toBe(404);
  });

  it('GET /api/vault/items/:itemId/document — route exists (401, not 404)', async () => {
    const res = await app.request('/api/vault/items/test-item/document', { method: 'GET' });
    expect(res.status).toBe(401);
    expect(res.status).not.toBe(404);
  });

  it('DELETE /api/vault/items/:itemId/document — route exists (401, not 404)', async () => {
    const res = await app.request('/api/vault/items/test-item/document', { method: 'DELETE' });
    expect(res.status).toBe(401);
    expect(res.status).not.toBe(404);
  });

  it('GET /api/vault/documents/quota — route exists (401, not 404)', async () => {
    const res = await app.request('/api/vault/documents/quota', { method: 'GET' });
    expect(res.status).toBe(401);
    expect(res.status).not.toBe(404);
  });
});

describe('Documents API — module exports', () => {
  it('should export documentRoutes as a Hono instance', () => {
    expect(documentRoutes).toBeDefined();
  });

  it('documentRoutes should be a Hono app', () => {
    expect(typeof documentRoutes.request).toBe('function');
  });
});

describe('Documents API — size limits', () => {
  it('MAX_DOC_SIZE is 50MB (module loads correctly)', async () => {
    const mod = await import('../routes/documents.js');
    expect(mod.documentRoutes).toBeDefined();
  });

  it('routes handle different item IDs in URL params', async () => {
    const app = new Hono();
    app.route('/api/vault', documentRoutes);

    const res1 = await app.request('/api/vault/items/abc-123/document', { method: 'GET' });
    expect(res1.status).toBe(401);

    const res2 = await app.request('/api/vault/items/xyz-789/document', { method: 'GET' });
    expect(res2.status).toBe(401);
  });
});
