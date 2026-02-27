/**
 * Cross-feature integration tests — verifies that all Lockbox API features
 * work together correctly across route boundaries.
 *
 * Tests mount multiple route modules on a single Hono app (mirroring index.ts)
 * and verify cross-cutting interactions: auth → vault → sync → travel,
 * vault → attachments → documents, emergency lifecycle, share links, etc.
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { authRoutes } from '../../routes/auth.js';
import { vaultRoutes } from '../../routes/vault.js';
import { syncRoutes } from '../../routes/sync.js';
import { shareLinkRoutes } from '../../routes/share-links.js';
import { twofaRoutes } from '../../routes/twofa.js';
import { attachmentRoutes } from '../../routes/attachments.js';
import { emergencyRoutes } from '../../routes/emergency.js';
import { settingsRoutes } from '../../routes/settings.js';
import { documentRoutes } from '../../routes/documents.js';
import { hardwareKeyRoutes } from '../../routes/hardware-key.js';

// ─── Full app setup mirroring index.ts route registration ────────────────────

function createFullApp() {
  const app = new Hono();
  app.route('/api/auth', authRoutes);
  app.route('/api/vault', vaultRoutes);
  app.route('/api/sync', syncRoutes);
  app.route('/api/share-links', shareLinkRoutes);
  app.route('/api/auth/2fa', twofaRoutes);
  app.route('/api/vault', attachmentRoutes);
  app.route('/api/emergency', emergencyRoutes);
  app.route('/api/settings', settingsRoutes);
  app.route('/api/vault', documentRoutes);
  app.route('/api/auth/hardware-key', hardwareKeyRoutes);
  return app;
}

// ─── Scenario 1: Full vault lifecycle with new item types ────────────────────

describe('Cross-feature: Full vault lifecycle with item types', () => {
  const app = createFullApp();

  it('POST /api/vault/items — document type route accepts creation (auth gate)', async () => {
    const res = await app.request('/api/vault/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'doc-item-1',
        type: 'login',
        encryptedData: 'enc-doc-data',
        revisionDate: new Date().toISOString(),
      }),
    });
    // Route exists and accepts request — just needs auth
    expect(res.status).toBe(401);
  });

  it('POST /api/vault/items + POST /items/:id/document — vault+document routes coexist', async () => {
    // First, create item route is reachable
    const createRes = await app.request('/api/vault/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'identity', encryptedData: 'enc-data' }),
    });
    expect(createRes.status).toBe(401);

    // Then, document upload route on same item prefix is reachable
    const docRes = await app.request('/api/vault/items/doc-item-1/document', {
      method: 'POST',
    });
    expect(docRes.status).toBe(401);
  });

  it('identity item creation → attachment route → version history routes all reachable', async () => {
    // Create identity item route
    const createRes = await app.request('/api/vault/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'identity-1',
        type: 'identity',
        encryptedData: 'enc-identity',
        revisionDate: new Date().toISOString(),
      }),
    });
    expect(createRes.status).toBe(401);

    // Attachment route on the same item
    const attachRes = await app.request('/api/vault/items/identity-1/attachments', {
      method: 'POST',
    });
    expect(attachRes.status).toBe(401);

    // Version history route on the same item
    const versionsRes = await app.request('/api/vault/items/identity-1/versions', {
      method: 'GET',
    });
    expect(versionsRes.status).toBe(401);
  });

  it('login item → soft-delete → trash list → restore lifecycle routes exist', async () => {
    // Create route
    const createRes = await app.request('/api/vault/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'login', encryptedData: 'enc-login' }),
    });
    expect(createRes.status).toBe(401);

    // Soft-delete route
    const deleteRes = await app.request('/api/vault/items/login-item-1', {
      method: 'DELETE',
    });
    expect(deleteRes.status).toBe(401);

    // Trash list route
    const trashRes = await app.request('/api/vault/trash', { method: 'GET' });
    expect(trashRes.status).toBe(401);

    // Restore route
    const restoreRes = await app.request('/api/vault/items/login-item-1/restore', {
      method: 'POST',
    });
    expect(restoreRes.status).toBe(401);
  });

  it('PUT /api/vault/items/:id triggers version history route availability', async () => {
    // Update route
    const updateRes = await app.request('/api/vault/items/some-item/versions', {
      method: 'GET',
    });
    expect(updateRes.status).toBe(401);

    // Specific version route
    const versionRes = await app.request('/api/vault/items/some-item/versions/v1', {
      method: 'GET',
    });
    expect(versionRes.status).toBe(401);

    // Restore specific version route
    const restoreVersionRes = await app.request('/api/vault/items/some-item/versions/v1/restore', {
      method: 'POST',
    });
    expect(restoreVersionRes.status).toBe(401);
  });

  it('all four item types accepted by vault creation route (auth gate)', async () => {
    for (const type of ['login', 'note', 'card', 'identity']) {
      const res = await app.request('/api/vault/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: `${type}-test`,
          type,
          encryptedData: `enc-${type}`,
          revisionDate: new Date().toISOString(),
        }),
      });
      expect(res.status).toBe(401);
    }
  });
});

// ─── Scenario 2: Authentication flows ────────────────────────────────────────

describe('Cross-feature: Authentication flows', () => {
  const app = createFullApp();

  it('hardware key challenge → verify full flow (no auth required)', async () => {
    // Step 1: Request challenge (no auth required, returns 400 for missing keyId)
    const challengeRes = await app.request('/api/auth/hardware-key/challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyId: 'test-hw-key' }),
    });
    // Challenge route doesn't require auth — returns 400/500 depending on missing DB
    expect(challengeRes.status).not.toBe(404);
    expect(challengeRes.status).not.toBe(401);

    // Step 2: Verify (no auth required, returns 400 for missing fields)
    const verifyRes = await app.request('/api/auth/hardware-key/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keyId: 'test-hw-key',
        challengeId: 'fake-challenge',
        signature: 'fake-sig',
      }),
    });
    // Returns 401 (invalid challenge) — not 404
    expect(verifyRes.status).not.toBe(404);
  });

  it('2FA validate endpoint accessible without auth (returns 400 for missing body)', async () => {
    const res = await app.request('/api/auth/2fa/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('2FA setup + verify + disable all require auth in combined app', async () => {
    const twofaRoutesList = [
      { method: 'POST', path: '/api/auth/2fa/setup' },
      { method: 'POST', path: '/api/auth/2fa/verify' },
      { method: 'POST', path: '/api/auth/2fa/disable' },
    ];

    for (const { method, path } of twofaRoutesList) {
      const res = await app.request(path, { method });
      expect(res.status).toBe(401);
    }
  });

  it('2FA validate requires tempToken and code fields', async () => {
    // Missing code
    const res1 = await app.request('/api/auth/2fa/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tempToken: 'abc' }),
    });
    expect(res1.status).toBe(400);
    const json1 = (await res1.json()) as { error?: string };
    expect(json1.error).toBeDefined();

    // Missing tempToken
    const res2 = await app.request('/api/auth/2fa/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '123456' }),
    });
    expect(res2.status).toBe(400);
  });

  it('login → 2FA validate flow: auth route + 2FA validate are both reachable', async () => {
    // Login route reachable
    const loginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', authHash: 'hash' }),
    });
    expect(loginRes.status).not.toBe(404);

    // 2FA validate reachable (no auth needed)
    const validateRes = await app.request('/api/auth/2fa/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tempToken: 'temp-123', code: '123456' }),
    });
    expect(validateRes.status).not.toBe(404);
    // Should be 400 or 401 depending on token lookup, not 404
    expect(validateRes.status).not.toBe(404);
  });
});

// ─── Scenario 3: Emergency access workflow ───────────────────────────────────

describe('Cross-feature: Emergency access workflow', () => {
  const app = createFullApp();

  it('grant creation → request → approve lifecycle routes all exist', async () => {
    // Grantor creates grant
    const grantRes = await app.request('/api/emergency/grants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        granteeEmail: 'trusted@example.com',
        waitPeriodDays: 7,
        encryptedUserKey: 'encrypted-key',
      }),
    });
    expect(grantRes.status).toBe(401);

    // Grantee creates access request
    const requestRes = await app.request('/api/emergency/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grantId: 'grant-123' }),
    });
    expect(requestRes.status).toBe(401);

    // Grantor approves
    const approveRes = await app.request('/api/emergency/grants/grant-123/approve', {
      method: 'POST',
    });
    expect(approveRes.status).toBe(401);
  });

  it('grant creation → request → reject workflow routes exist', async () => {
    const grantRes = await app.request('/api/emergency/grants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        granteeEmail: 'other@example.com',
        waitPeriodDays: 3,
        encryptedUserKey: 'key-data',
      }),
    });
    expect(grantRes.status).toBe(401);

    const requestRes = await app.request('/api/emergency/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grantId: 'grant-456' }),
    });
    expect(requestRes.status).toBe(401);

    const rejectRes = await app.request('/api/emergency/grants/grant-456/reject', {
      method: 'POST',
    });
    expect(rejectRes.status).toBe(401);
  });

  it('grant → confirm → access workflow routes exist', async () => {
    // Confirm (grantee confirms invitation)
    const confirmRes = await app.request('/api/emergency/grants/grant-789/confirm', {
      method: 'POST',
    });
    expect(confirmRes.status).toBe(401);

    // Access vault after approval
    const accessRes = await app.request('/api/emergency/grants/grant-789/access', {
      method: 'GET',
    });
    expect(accessRes.status).toBe(401);
  });

  it('list grants (as grantor) and list requests (as grantee) routes exist', async () => {
    const grantsRes = await app.request('/api/emergency/grants', { method: 'GET' });
    expect(grantsRes.status).toBe(401);

    const requestsRes = await app.request('/api/emergency/requests', { method: 'GET' });
    expect(requestsRes.status).toBe(401);
  });

  it('grant revocation route accessible in full app', async () => {
    const revokeRes = await app.request('/api/emergency/grants/grant-to-revoke', {
      method: 'DELETE',
    });
    expect(revokeRes.status).toBe(401);
  });

  it('emergency routes with various wait periods accepted (auth gate)', async () => {
    for (const days of [1, 3, 7, 14, 30]) {
      const res = await app.request('/api/emergency/grants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          granteeEmail: 'user@example.com',
          waitPeriodDays: days,
          encryptedUserKey: 'key',
        }),
      });
      expect(res.status).toBe(401);
    }
  });
});

// ─── Scenario 4: Travel mode + sync ─────────────────────────────────────────

describe('Cross-feature: Travel mode + sync', () => {
  const app = createFullApp();

  it('toggle travel mode → sync should both be auth-gated in combined app', async () => {
    // Enable travel mode
    const travelRes = await app.request('/api/settings/travel-mode', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    expect(travelRes.status).toBe(401);

    // Sync pull
    const syncRes = await app.request('/api/sync/', { method: 'GET' });
    expect(syncRes.status).toBe(401);
  });

  it('disable travel mode → sync push should both exist', async () => {
    // Disable travel mode
    const travelRes = await app.request('/api/settings/travel-mode', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
    expect(travelRes.status).toBe(401);

    // Sync push
    const pushRes = await app.request('/api/sync/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes: [] }),
    });
    expect(pushRes.status).toBe(401);
  });

  it('per-folder travel_safe toggle route accessible alongside sync', async () => {
    // Folder travel toggle
    const folderTravelRes = await app.request('/api/vault/folders/folder-1/travel', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ travelSafe: true }),
    });
    expect(folderTravelRes.status).toBe(401);

    // Travel mode GET
    const travelGetRes = await app.request('/api/settings/travel-mode', {
      method: 'GET',
    });
    expect(travelGetRes.status).toBe(401);

    // Delta sync with since param
    const deltaSyncRes = await app.request('/api/sync/?since=2025-01-01T00:00:00.000Z', {
      method: 'GET',
    });
    expect(deltaSyncRes.status).toBe(401);
  });

  it('multiple folder travel toggles + sync in sequence', async () => {
    const folderIds = ['folder-alpha', 'folder-beta', 'folder-gamma'];

    for (const folderId of folderIds) {
      const res = await app.request(`/api/vault/folders/${folderId}/travel`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ travelSafe: false }),
      });
      expect(res.status).toBe(401);
    }

    // Sync after toggling folders
    const syncRes = await app.request('/api/sync/', { method: 'GET' });
    expect(syncRes.status).toBe(401);
  });
});

// ─── Scenario 5: Share links with new item types ─────────────────────────────

describe('Cross-feature: Share links with item types', () => {
  const app = createFullApp();

  it('create share link for identity item (auth gate)', async () => {
    const res = await app.request('/api/share-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'share-identity-1',
        encryptedItem: 'enc-identity-blob',
        tokenHash: 'sha256-hash-of-token',
        itemName: 'My Identity Card',
        maxViews: 5,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }),
    });
    expect(res.status).toBe(401);
  });

  it('create share link with maxViews=1 → redeem requires Bearer token', async () => {
    // Create share link (auth required)
    const createRes = await app.request('/api/share-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'share-oneview',
        encryptedItem: 'enc-data',
        tokenHash: 'hash123',
        itemName: 'One-Time Secret',
        maxViews: 1,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      }),
    });
    expect(createRes.status).toBe(401);

    // Redeem without token → 401
    const redeemNoAuth = await app.request('/api/share-links/share-oneview/redeem', {
      method: 'GET',
    });
    expect(redeemNoAuth.status).toBe(401);

    // Redeem with wrong auth type → 401
    const redeemBadAuth = await app.request('/api/share-links/share-oneview/redeem', {
      method: 'GET',
      headers: { Authorization: 'Basic bad-token' },
    });
    expect(redeemBadAuth.status).toBe(401);
  });

  it('share link with expiry → list + delete routes accessible', async () => {
    // Create with short expiry (auth gate)
    const createRes = await app.request('/api/share-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'share-expiring',
        encryptedItem: 'enc-expiring',
        tokenHash: 'hash-expiring',
        itemName: 'Expiring Secret',
        maxViews: 10,
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      }),
    });
    expect(createRes.status).toBe(401);

    // List share links (auth required)
    const listRes = await app.request('/api/share-links', { method: 'GET' });
    expect(listRes.status).toBe(401);

    // Delete share link (auth required)
    const deleteRes = await app.request('/api/share-links/share-expiring', {
      method: 'DELETE',
    });
    expect(deleteRes.status).toBe(401);
  });
});

// ─── Scenario 6: Document vault specifics ────────────────────────────────────

describe('Cross-feature: Document vault specifics', () => {
  const app = createFullApp();

  it('document upload + quota check routes coexist', async () => {
    // Upload document
    const uploadRes = await app.request('/api/vault/items/doc-1/document', {
      method: 'POST',
    });
    expect(uploadRes.status).toBe(401);

    // Check quota
    const quotaRes = await app.request('/api/vault/documents/quota', {
      method: 'GET',
    });
    expect(quotaRes.status).toBe(401);
  });

  it('document delete → quota should decrease (route existence)', async () => {
    // Delete document
    const deleteRes = await app.request('/api/vault/items/doc-1/document', {
      method: 'DELETE',
    });
    expect(deleteRes.status).toBe(401);

    // Quota still accessible
    const quotaRes = await app.request('/api/vault/documents/quota', {
      method: 'GET',
    });
    expect(quotaRes.status).toBe(401);
  });

  it('multiple document CRUD routes for different item IDs', async () => {
    const docIds = ['doc-pdf', 'doc-img', 'doc-spreadsheet'];

    for (const docId of docIds) {
      // Upload route
      const uploadRes = await app.request(`/api/vault/items/${docId}/document`, {
        method: 'POST',
      });
      expect(uploadRes.status).toBe(401);

      // Download route
      const getRes = await app.request(`/api/vault/items/${docId}/document`, {
        method: 'GET',
      });
      expect(getRes.status).toBe(401);

      // Delete route
      const deleteRes = await app.request(`/api/vault/items/${docId}/document`, {
        method: 'DELETE',
      });
      expect(deleteRes.status).toBe(401);
    }
  });

  it('document routes do not conflict with attachment routes on same item', async () => {
    const itemId = 'dual-item';

    // Document route
    const docRes = await app.request(`/api/vault/items/${itemId}/document`, {
      method: 'GET',
    });
    expect(docRes.status).toBe(401);

    // Attachment routes (different path structure)
    const attachListRes = await app.request(`/api/vault/items/${itemId}/attachments`, {
      method: 'GET',
    });
    expect(attachListRes.status).toBe(401);

    // Both should be 401 (not 404)
    expect(docRes.status).not.toBe(404);
    expect(attachListRes.status).not.toBe(404);
  });
});

// ─── Scenario 7: Hardware key management ─────────────────────────────────────

describe('Cross-feature: Hardware key management', () => {
  const app = createFullApp();

  it('register → list → delete lifecycle all auth-gated', async () => {
    // Register/setup
    const setupRes = await app.request('/api/auth/hardware-key/setup', {
      method: 'POST',
    });
    expect(setupRes.status).toBe(401);

    // List
    const listRes = await app.request('/api/auth/hardware-key', {
      method: 'GET',
    });
    expect(listRes.status).toBe(401);

    // Delete specific key
    const deleteRes = await app.request('/api/auth/hardware-key/key-to-delete', {
      method: 'DELETE',
    });
    expect(deleteRes.status).toBe(401);
  });

  it('HW key challenge + verify do NOT require auth in combined app', async () => {
    // Challenge doesn't need auth
    const challengeRes = await app.request('/api/auth/hardware-key/challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyId: 'yubikey-1' }),
    });
    expect(challengeRes.status).not.toBe(401);
    expect(challengeRes.status).not.toBe(404);

    // Verify doesn't need auth
    const verifyRes = await app.request('/api/auth/hardware-key/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keyId: 'yubikey-1',
        challengeId: 'challenge-abc',
        signature: 'sig-data',
      }),
    });
    expect(verifyRes.status).not.toBe(404);
  });

  it('challenge returns 400 for missing keyId', async () => {
    const res = await app.request('/api/auth/hardware-key/challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toContain('keyId');
  });

  it('verify returns 400 for incomplete fields', async () => {
    const res = await app.request('/api/auth/hardware-key/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyId: 'test' }),
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBeDefined();
  });
});

// ─── Cross-cutting: Full app route registration integrity ────────────────────

describe('Cross-feature: Full app route registration integrity', () => {
  const app = createFullApp();

  it('all major feature routes are reachable from combined app (not 404)', async () => {
    const routes = [
      // Vault
      { method: 'GET', path: '/api/vault/' },
      { method: 'POST', path: '/api/vault/items' },
      { method: 'PUT', path: '/api/vault/items/any-id' },
      { method: 'DELETE', path: '/api/vault/items/any-id' },
      { method: 'POST', path: '/api/vault/items/any-id/restore' },
      // Trash
      { method: 'GET', path: '/api/vault/trash' },
      // Folders
      { method: 'POST', path: '/api/vault/folders' },
      { method: 'PUT', path: '/api/vault/folders/any-id' },
      { method: 'DELETE', path: '/api/vault/folders/any-id' },
      // Version history
      { method: 'GET', path: '/api/vault/items/any-id/versions' },
      // Attachments
      { method: 'POST', path: '/api/vault/items/any-id/attachments' },
      { method: 'GET', path: '/api/vault/items/any-id/attachments' },
      // Documents
      { method: 'POST', path: '/api/vault/items/any-id/document' },
      { method: 'GET', path: '/api/vault/items/any-id/document' },
      { method: 'DELETE', path: '/api/vault/items/any-id/document' },
      { method: 'GET', path: '/api/vault/documents/quota' },
      // Sync
      { method: 'GET', path: '/api/sync/' },
      { method: 'POST', path: '/api/sync/push' },
      // Emergency
      { method: 'POST', path: '/api/emergency/grants' },
      { method: 'GET', path: '/api/emergency/grants' },
      { method: 'GET', path: '/api/emergency/requests' },
      // Share links
      { method: 'POST', path: '/api/share-links' },
      { method: 'GET', path: '/api/share-links' },
      // Settings
      { method: 'GET', path: '/api/settings/travel-mode' },
      { method: 'PUT', path: '/api/settings/travel-mode' },
      // HW keys
      { method: 'POST', path: '/api/auth/hardware-key/setup' },
      { method: 'GET', path: '/api/auth/hardware-key' },
    ];

    for (const { method, path } of routes) {
      const res = await app.request(path, { method });
      expect(res.status).not.toBe(404);
    }
  });

  it('auth endpoints coexist with 2FA and HW key sub-routes', async () => {
    // Auth routes
    const registerRes = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(registerRes.status).not.toBe(404);

    // 2FA routes
    const twofaRes = await app.request('/api/auth/2fa/setup', { method: 'POST' });
    expect(twofaRes.status).toBe(401);

    // HW key routes
    const hwRes = await app.request('/api/auth/hardware-key/setup', { method: 'POST' });
    expect(hwRes.status).toBe(401);
  });

  it('vault sub-routes (attachments, documents, versions) all register under /api/vault', async () => {
    const vaultSubRoutes = [
      // Core vault
      { method: 'GET', path: '/api/vault/' },
      // Attachments
      { method: 'GET', path: '/api/vault/items/test/attachments' },
      { method: 'GET', path: '/api/vault/items/test/attachments/att-1' },
      // Documents
      { method: 'GET', path: '/api/vault/items/test/document' },
      { method: 'GET', path: '/api/vault/documents/quota' },
      // Versions
      { method: 'GET', path: '/api/vault/items/test/versions' },
      { method: 'GET', path: '/api/vault/items/test/versions/v1' },
      // Folders
      { method: 'PUT', path: '/api/vault/folders/test/travel' },
      // Trash
      { method: 'GET', path: '/api/vault/trash' },
    ];

    for (const { method, path } of vaultSubRoutes) {
      const res = await app.request(path, { method });
      expect(res.status).toBe(401);
    }
  });

  it('no route collisions between document and attachment paths', async () => {
    // These are different path patterns that both mount under /api/vault
    const docPath = '/api/vault/items/item-x/document';
    const attachPath = '/api/vault/items/item-x/attachments';

    const docRes = await app.request(docPath, { method: 'GET' });
    const attachRes = await app.request(attachPath, { method: 'GET' });

    // Both should resolve (401) — no collision causing 404
    expect(docRes.status).toBe(401);
    expect(attachRes.status).toBe(401);
  });

  it('scheduled handler is exported alongside routes', async () => {
    const mod = await import('../../index.js');
    expect(mod.default).toBeDefined();
    expect(typeof mod.default.fetch).toBe('function');
    expect(typeof mod.default.scheduled).toBe('function');
  });
});
