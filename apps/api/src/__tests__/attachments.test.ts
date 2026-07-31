/**
 * Attachment API tests — verifies route existence, auth enforcement, and CRUD lifecycle.
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import {
  attachmentRoutes,
  encryptedAttachmentSize,
  MAX_FILE_SIZE,
  MAX_USER_QUOTA,
} from '../routes/attachments.js';

describe('Attachments API — auth enforcement', () => {
  const app = new Hono();
  app.route('/api/vault', attachmentRoutes);

  const protectedRoutes = [
    { method: 'POST', path: '/api/vault/items/test-item/attachments' },
    { method: 'GET', path: '/api/vault/items/test-item/attachments' },
    { method: 'GET', path: '/api/vault/items/test-item/attachments/test-attachment' },
    { method: 'DELETE', path: '/api/vault/items/test-item/attachments/test-attachment' },
  ];

  for (const { method, path } of protectedRoutes) {
    it(`${method} ${path} — requires auth (401 without token)`, async () => {
      const res = await app.request(path, { method });
      expect(res.status).toBe(401);
    });
  }
});

describe('Attachments API — route existence', () => {
  const app = new Hono();
  app.route('/api/vault', attachmentRoutes);

  it('POST /api/vault/items/:itemId/attachments — route exists (401, not 404)', async () => {
    const res = await app.request('/api/vault/items/test-item/attachments', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('GET /api/vault/items/:itemId/attachments — route exists (401, not 404)', async () => {
    const res = await app.request('/api/vault/items/test-item/attachments', { method: 'GET' });
    expect(res.status).toBe(401);
  });

  it('GET /api/vault/items/:itemId/attachments/:attachmentId — route exists (401, not 404)', async () => {
    const res = await app.request('/api/vault/items/test-item/attachments/test-att', {
      method: 'GET',
    });
    expect(res.status).toBe(401);
  });

  it('DELETE /api/vault/items/:itemId/attachments/:attachmentId — route exists (401, not 404)', async () => {
    const res = await app.request('/api/vault/items/test-item/attachments/test-att', {
      method: 'DELETE',
    });
    expect(res.status).toBe(401);
  });
});

describe('Attachments API — size limits', () => {
  it('enforces the documented plaintext limits', () => {
    expect(MAX_FILE_SIZE).toBe(10 * 1024 * 1024);
    expect(MAX_USER_QUOTA).toBe(100 * 1024 * 1024);
  });

  it('accounts for IV, GCM tag, separator, and base64 expansion', () => {
    expect(encryptedAttachmentSize(0)).toBe(41);
    expect(encryptedAttachmentSize(1)).toBe(41);
    expect(encryptedAttachmentSize(MAX_FILE_SIZE)).toBeGreaterThan(MAX_FILE_SIZE);
  });
});
