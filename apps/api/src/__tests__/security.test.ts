/**
 * Security middleware tests — CORS, security headers, request size limit.
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { corsMiddleware, securityHeaders, requestSizeLimit } from '../middleware/security.js';

function createTestApp() {
  const app = new Hono();
  app.use('*', corsMiddleware);
  app.use('*', securityHeaders);
  app.use('*', requestSizeLimit(100)); // 100 bytes for testing
  app.get('/test', (c) => c.json({ ok: true }));
  app.post('/test', (c) => c.json({ ok: true }));
  return app;
}

describe('CORS middleware', () => {
  const app = createTestApp();

  it('allows vault.lockbox.dev origin', async () => {
    const res = await app.request('/test', {
      headers: { Origin: 'https://vault.lockbox.dev' },
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://vault.lockbox.dev');
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  it('allows chrome-extension:// origins', async () => {
    const res = await app.request('/test', {
      headers: { Origin: 'chrome-extension://abcdefghijklmnop' },
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'chrome-extension://abcdefghijklmnop',
    );
  });

  it('allows moz-extension:// origins', async () => {
    const res = await app.request('/test', {
      headers: { Origin: 'moz-extension://some-uuid' },
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('moz-extension://some-uuid');
  });

  it('blocks disallowed origins (no CORS headers)', async () => {
    const res = await app.request('/test', {
      headers: { Origin: 'https://evil.com' },
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('handles OPTIONS preflight', async () => {
    const res = await app.request('/test', {
      method: 'OPTIONS',
      headers: { Origin: 'https://vault.lockbox.dev' },
    });
    expect(res.status).toBe(200);
  });

  it('no CORS headers when no Origin header', async () => {
    const res = await app.request('/test');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('Security headers middleware', () => {
  const app = createTestApp();

  it('sets X-Content-Type-Options: nosniff', async () => {
    const res = await app.request('/test');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('sets X-Frame-Options: DENY', async () => {
    const res = await app.request('/test');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('sets Strict-Transport-Security', async () => {
    const res = await app.request('/test');
    expect(res.headers.get('Strict-Transport-Security')).toBe(
      'max-age=31536000; includeSubDomains',
    );
  });

  it('sets Content-Security-Policy', async () => {
    const res = await app.request('/test');
    expect(res.headers.get('Content-Security-Policy')).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
  });
});

describe('Request size limit middleware', () => {
  const app = createTestApp();

  it('allows requests within size limit', async () => {
    const res = await app.request('/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': '50' },
      body: JSON.stringify({ ok: true }),
    });
    expect(res.status).toBe(200);
  });

  it('rejects requests over size limit with 413', async () => {
    const res = await app.request('/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': '200' }, // > 100 byte limit
      body: JSON.stringify({ ok: true }),
    });
    expect(res.status).toBe(413);
  });
});

describe('Sync Hub — VaultSyncHub', () => {
  it('exports VaultSyncHub class', async () => {
    const { VaultSyncHub } = await import('../sync-hub.js');
    expect(VaultSyncHub).toBeDefined();
    expect(typeof VaultSyncHub).toBe('function');
  });

  it('VaultSyncHub has required DO methods', async () => {
    const { VaultSyncHub } = await import('../sync-hub.js');
    const proto = VaultSyncHub.prototype;
    expect(typeof proto.fetch).toBe('function');
    expect(typeof proto.webSocketMessage).toBe('function');
    expect(typeof proto.webSocketClose).toBe('function');
    expect(typeof proto.webSocketError).toBe('function');
  });

  it('VaultSyncHub.fetch rejects non-WebSocket requests', async () => {
    const { VaultSyncHub } = await import('../sync-hub.js');
    // Mock DurableObjectState
    const mockState = {
      acceptWebSocket: () => {},
      getWebSockets: () => [],
    } as unknown as DurableObjectState;

    const hub = new VaultSyncHub(mockState, {});
    const req = new Request('https://example.com/ws');
    const res = await hub.fetch(req);
    expect(res.status).toBe(426);
  });
});
