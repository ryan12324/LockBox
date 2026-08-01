import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LOCKBOX_DISCOVERY_PATH,
  LOCKBOX_PRODUCT,
  LOCKBOX_PROTOCOL_VERSION,
} from '@lockbox/types/discovery';
import { validateKdfParams } from '../lib/api.js';
import { discoverLockboxServer } from '../lib/discovery.js';
import {
  getApiUrl,
  getServerConnection,
  setServerConnection,
} from '../lib/server-connection.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function healthResponse(): Response {
  return jsonResponse({
    product: LOCKBOX_PRODUCT,
    protocolVersion: LOCKBOX_PROTOCOL_VERSION,
    status: 'ok',
    timestamp: '2026-08-01T12:00:00.000Z',
  });
}

afterEach(() => {
  localStorage.clear();
  delete (globalThis as typeof globalThis & { Capacitor?: unknown }).Capacitor;
});

describe('Android server connection', () => {
  it('discovers and verifies the API from the web vault URL', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === `https://vault.example.com${LOCKBOX_DISCOVERY_PATH}`) {
        return jsonResponse({
          product: LOCKBOX_PRODUCT,
          protocolVersion: LOCKBOX_PROTOCOL_VERSION,
          apiBaseUrl: 'https://api.example.com',
        });
      }
      if (url === 'https://api.example.com/health') return healthResponse();
      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    await expect(discoverLockboxServer('vault.example.com', fetchMock)).resolves.toEqual({
      webBaseUrl: 'https://vault.example.com',
      apiBaseUrl: 'https://api.example.com',
    });
  });

  it('rejects HTML returned in place of discovery settings', async () => {
    const fetchMock = vi.fn(async () =>
      new Response('<!doctype html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })) as typeof fetch;

    await expect(
      discoverLockboxServer('https://vault.example.com', fetchMock)
    ).rejects.toMatchObject({ code: 'discovery-invalid' });
  });

  it('uses the verified, persisted API URL for native requests', () => {
    (globalThis as typeof globalThis & { Capacitor: unknown }).Capacitor = {
      isNativePlatform: () => true,
    };
    setServerConnection({
      webBaseUrl: 'https://vault.example.com',
      apiBaseUrl: 'https://api.example.com',
    });

    expect(getServerConnection()).toEqual({
      webBaseUrl: 'https://vault.example.com',
      apiBaseUrl: 'https://api.example.com',
    });
    expect(getApiUrl('/api/auth/me')).toBe('https://api.example.com/api/auth/me');
  });

  it('blocks native API requests until a web vault is connected', () => {
    (globalThis as typeof globalThis & { Capacitor: unknown }).Capacitor = {
      isNativePlatform: () => true,
    };
    expect(() => getApiUrl('/api/auth/me')).toThrow('Connect your web vault first');
  });
});

describe('login response validation', () => {
  const validKdfParams = {
    salt: btoa(String.fromCharCode(...new Uint8Array(16).fill(7))),
    kdfConfig: {
      type: 'argon2id' as const,
      iterations: 3,
      memory: 65_536,
      parallelism: 4,
    },
  };

  it('accepts valid KDF parameters', () => {
    expect(validateKdfParams(validKdfParams)).toEqual(validKdfParams);
  });

  it('rejects a missing or malformed salt before Base64 decoding', () => {
    expect(() => validateKdfParams({ kdfConfig: validKdfParams.kdfConfig })).toThrow(
      'invalid login parameters'
    );
    expect(() => validateKdfParams({ ...validKdfParams, salt: 'not base64!' })).toThrow(
      'invalid login parameters'
    );
  });
});
