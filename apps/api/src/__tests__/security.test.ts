/**
 * Security middleware tests — CORS, security headers, request size limit.
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { corsMiddleware, securityHeaders, requestSizeLimit } from '../middleware/security.js';

const TEST_ENV = {
  CORS_ORIGINS: 'https://lockbox-web.pages.dev',
  EXTENSION_IDS: 'abcdefghijklmnop,some-uuid',
};

function createTestApp() {
  const app = new Hono<{
    Bindings: { CORS_ORIGINS?: string; EXTENSION_IDS?: string };
  }>();
  app.use('*', corsMiddleware);
  app.use('*', securityHeaders);
  app.use('*', requestSizeLimit(100)); // 100 bytes for testing
  app.get('/test', (c) => c.json({ ok: true }));
  app.post('/test', (c) => c.json({ ok: true }));
  return app;
}

describe('CORS middleware', () => {
  const app = createTestApp();

  it('allows lockbox-web.pages.dev origin', async () => {
    const res = await app.request('/test', {
      headers: { Origin: 'https://lockbox-web.pages.dev' },
    }, TEST_ENV);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://lockbox-web.pages.dev');
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  it('allows chrome-extension:// origins', async () => {
    const res = await app.request('/test', {
      headers: { Origin: 'chrome-extension://abcdefghijklmnop' },
    }, TEST_ENV);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'chrome-extension://abcdefghijklmnop',
    );
  });

  it('allows moz-extension:// origins', async () => {
    const res = await app.request('/test', {
      headers: { Origin: 'moz-extension://some-uuid' },
    }, TEST_ENV);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('moz-extension://some-uuid');
  });

  it('rejects extension origins when no IDs are configured', async () => {
    const res = await app.request(
      '/test',
      { headers: { Origin: 'chrome-extension://abcdefghijklmnop' } },
      { CORS_ORIGINS: 'https://lockbox-web.pages.dev' }
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('blocks disallowed origins (no CORS headers)', async () => {
    const res = await app.request('/test', {
      headers: { Origin: 'https://evil.com' },
    }, TEST_ENV);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('handles OPTIONS preflight', async () => {
    const res = await app.request('/test', {
      method: 'OPTIONS',
      headers: { Origin: 'https://lockbox-web.pages.dev' },
    }, TEST_ENV);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://lockbox-web.pages.dev');
  });

  it('no CORS headers when no Origin header', async () => {
    const res = await app.request('/test', {}, TEST_ENV);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('Security headers middleware', () => {
  const app = createTestApp();

  it('sets X-Content-Type-Options: nosniff', async () => {
    const res = await app.request('/test', {}, TEST_ENV);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('sets X-Frame-Options: DENY', async () => {
    const res = await app.request('/test', {}, TEST_ENV);
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('sets Strict-Transport-Security', async () => {
    const res = await app.request('/test', {}, TEST_ENV);
    expect(res.headers.get('Strict-Transport-Security')).toBe(
      'max-age=31536000; includeSubDomains',
    );
  });

  it('sets Content-Security-Policy', async () => {
    const res = await app.request('/test', {}, TEST_ENV);
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
    }, TEST_ENV);
    expect(res.status).toBe(200);
  });

  it('rejects requests over size limit with 413', async () => {
    const res = await app.request('/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': '200' }, // > 100 byte limit
      body: JSON.stringify({ ok: true }),
    }, TEST_ENV);
    expect(res.status).toBe(413);
  });

  it('rejects an oversized body when Content-Length is omitted', async () => {
    const res = await app.request(
      '/test',
      {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'x'.repeat(101),
      },
      TEST_ENV
    );
    expect(res.status).toBe(413);
  });

  it('rejects malformed Content-Length values', async () => {
    const res = await app.request(
      '/test',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': 'not-a-number' },
        body: '{}',
      },
      TEST_ENV
    );
    expect(res.status).toBe(400);
  });
});
