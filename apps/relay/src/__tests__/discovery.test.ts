import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RelayConfig, ApiEndpoint } from '@lockbox/types';
import { checkHealth, discoverEndpoint, buildApiUrl, isLocalNetwork } from '../discovery.js';

describe('isLocalNetwork', () => {
  it('returns true for localhost', () => {
    expect(isLocalNetwork('https://localhost:8787')).toBe(true);
  });

  it('returns true for 127.0.0.1', () => {
    expect(isLocalNetwork('http://127.0.0.1:3000')).toBe(true);
  });

  it('returns true for ::1', () => {
    expect(isLocalNetwork('http://[::1]:8787')).toBe(true);
  });

  it('returns true for 192.168.x.x', () => {
    expect(isLocalNetwork('https://192.168.1.100:8787')).toBe(true);
  });

  it('returns true for 10.x.x.x', () => {
    expect(isLocalNetwork('http://10.0.0.5:8787')).toBe(true);
  });

  it('returns true for 172.16.x.x through 172.31.x.x', () => {
    expect(isLocalNetwork('http://172.16.0.1:8787')).toBe(true);
    expect(isLocalNetwork('http://172.24.5.10:8787')).toBe(true);
    expect(isLocalNetwork('http://172.31.255.255:8787')).toBe(true);
  });

  it('returns false for 172.32.x.x', () => {
    expect(isLocalNetwork('http://172.32.0.1:8787')).toBe(false);
  });

  it('returns true for .local domains', () => {
    expect(isLocalNetwork('https://lockbox.local:8787')).toBe(true);
  });

  it('returns false for public URLs', () => {
    expect(isLocalNetwork('https://lockbox-api.example.workers.dev')).toBe(false);
    expect(isLocalNetwork('https://api.lockbox.dev')).toBe(false);
  });

  it('returns false for invalid URLs', () => {
    expect(isLocalNetwork('not-a-url')).toBe(false);
  });
});

describe('buildApiUrl', () => {
  it('combines endpoint and path correctly', () => {
    const endpoint: ApiEndpoint = { url: 'https://localhost:8787', source: 'local' };
    expect(buildApiUrl(endpoint, '/api/vault')).toBe('https://localhost:8787/api/vault');
  });

  it('handles trailing slash on endpoint', () => {
    const endpoint: ApiEndpoint = { url: 'https://localhost:8787/', source: 'local' };
    expect(buildApiUrl(endpoint, '/api/vault')).toBe('https://localhost:8787/api/vault');
  });

  it('handles path without leading slash', () => {
    const endpoint: ApiEndpoint = { url: 'https://localhost:8787', source: 'local' };
    expect(buildApiUrl(endpoint, 'api/vault')).toBe('https://localhost:8787/api/vault');
  });

  it('handles nested paths', () => {
    const endpoint: ApiEndpoint = { url: 'https://api.example.com', source: 'public' };
    expect(buildApiUrl(endpoint, '/api/vault/items/123')).toBe(
      'https://api.example.com/api/vault/items/123'
    );
  });
});

describe('checkHealth', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns available when health endpoint responds 200', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('OK', { status: 200 }));
    const status = await checkHealth('https://localhost:8787');
    expect(status.available).toBe(true);
    expect(status.latencyMs).toBeDefined();
    expect(status.lastChecked).toBeTruthy();
    expect(status.error).toBeUndefined();
  });

  it('returns unavailable on non-200 status', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Error', { status: 503 }));
    const status = await checkHealth('https://localhost:8787');
    expect(status.available).toBe(false);
    expect(status.error).toBe('HTTP 503');
  });

  it('returns unavailable on network error', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Connection refused'));
    const status = await checkHealth('https://localhost:8787');
    expect(status.available).toBe(false);
    expect(status.error).toBe('Connection refused');
  });

  it('appends /api/health to the URL', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('OK', { status: 200 }));
    await checkHealth('https://localhost:8787');
    expect(fetch).toHaveBeenCalledWith(
      'https://localhost:8787/api/health',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('strips trailing slashes before appending health path', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('OK', { status: 200 }));
    await checkHealth('https://localhost:8787/');
    expect(fetch).toHaveBeenCalledWith(
      'https://localhost:8787/api/health',
      expect.objectContaining({ method: 'GET' })
    );
  });
});

describe('discoverEndpoint', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prefers local when preferLocal is true and local is available', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('OK', { status: 200 }));

    const config: RelayConfig = {
      localUrl: 'https://localhost:8787',
      publicUrl: 'https://api.example.com',
      preferLocal: true,
    };

    const endpoint = await discoverEndpoint(config);
    expect(endpoint.source).toBe('local');
    expect(endpoint.url).toBe('https://localhost:8787');
  });

  it('falls back to public when local is unavailable', async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error('Connection refused'))
      .mockResolvedValueOnce(new Response('OK', { status: 200 }));

    const config: RelayConfig = {
      localUrl: 'https://localhost:8787',
      publicUrl: 'https://api.example.com',
      preferLocal: true,
    };

    const endpoint = await discoverEndpoint(config);
    expect(endpoint.source).toBe('public');
    expect(endpoint.url).toBe('https://api.example.com');
  });

  it('tries public first when preferLocal is false', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('OK', { status: 200 }));

    const config: RelayConfig = {
      localUrl: 'https://localhost:8787',
      publicUrl: 'https://api.example.com',
      preferLocal: false,
    };

    const endpoint = await discoverEndpoint(config);
    expect(endpoint.source).toBe('public');
    expect(endpoint.url).toBe('https://api.example.com');
  });

  it('returns fallback URL when both endpoints are unavailable', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Connection refused'));

    const config: RelayConfig = {
      localUrl: 'https://localhost:8787',
      publicUrl: 'https://api.example.com',
      preferLocal: true,
    };

    const endpoint = await discoverEndpoint(config);
    expect(endpoint.url).toBe('https://api.example.com');
    expect(endpoint.source).toBe('public');
  });
});
