import { describe, expect, it, vi } from 'vitest';
import {
  LOCKBOX_DISCOVERY_PATH,
  LOCKBOX_PRODUCT,
  LOCKBOX_PROTOCOL_VERSION,
} from '@lockbox/types/discovery';
import { discoverLockboxServer, LockboxDiscoveryError } from '../../lib/discovery.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function healthResponse(overrides: Record<string, unknown> = {}): Response {
  return jsonResponse({
    product: LOCKBOX_PRODUCT,
    protocolVersion: LOCKBOX_PROTOCOL_VERSION,
    status: 'ok',
    timestamp: '2026-08-01T12:00:00.000Z',
    ...overrides,
  });
}

describe('Lockbox web-vault discovery', () => {
  it('uses the web vault as the trust anchor and verifies the discovered API', async () => {
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
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('supports a same-origin API declared with the root-relative form', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith(LOCKBOX_DISCOVERY_PATH)) {
        return jsonResponse({
          product: LOCKBOX_PRODUCT,
          protocolVersion: LOCKBOX_PROTOCOL_VERSION,
          apiBaseUrl: '/',
        });
      }
      if (url === 'https://vault.example.com/health') return healthResponse();
      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    await expect(
      discoverLockboxServer('https://vault.example.com/login', fetchMock)
    ).resolves.toEqual({
      webBaseUrl: 'https://vault.example.com',
      apiBaseUrl: 'https://vault.example.com',
    });
  });

  it('accepts a direct Worker URL only when it identifies as Lockbox', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith(LOCKBOX_DISCOVERY_PATH)) return jsonResponse({}, 404);
      if (url === 'https://lockbox-api.example.workers.dev/health') return healthResponse();
      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    await expect(
      discoverLockboxServer('https://lockbox-api.example.workers.dev', fetchMock)
    ).resolves.toEqual({
      webBaseUrl: 'https://lockbox-api.example.workers.dev',
      apiBaseUrl: 'https://lockbox-api.example.workers.dev',
    });
  });

  it('rejects HTML masquerading as a discovery response', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response('<!doctype html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        })
    ) as typeof fetch;

    await expect(
      discoverLockboxServer('https://vault.example.com', fetchMock)
    ).rejects.toMatchObject({
      name: 'LockboxDiscoveryError',
      code: 'discovery-invalid',
    } satisfies Partial<LockboxDiscoveryError>);
  });

  it('rejects a discovery protocol from a newer incompatible deployment', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        product: LOCKBOX_PRODUCT,
        protocolVersion: LOCKBOX_PROTOCOL_VERSION + 1,
        apiBaseUrl: 'https://api.example.com',
      })
    ) as typeof fetch;

    await expect(
      discoverLockboxServer('https://vault.example.com', fetchMock)
    ).rejects.toMatchObject({
      code: 'unsupported-protocol',
    });
  });

  it('rejects an API that does not positively identify as Lockbox', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith(LOCKBOX_DISCOVERY_PATH)) {
        return jsonResponse({
          product: LOCKBOX_PRODUCT,
          protocolVersion: LOCKBOX_PROTOCOL_VERSION,
          apiBaseUrl: 'https://api.example.com',
        });
      }
      return healthResponse({ product: 'another-service' });
    }) as typeof fetch;

    await expect(
      discoverLockboxServer('https://vault.example.com', fetchMock)
    ).rejects.toMatchObject({
      code: 'api-invalid',
    });
  });
});
