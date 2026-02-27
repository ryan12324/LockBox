/**
 * Tests for QR Sync mobile plugin — sender flow, receiver flow,
 * scanning integration, payload validation, and ECDH key exchange.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks (must be before vi.mock) ──────────────────────────────────

const mockQRScanner = vi.hoisted(() => ({
  _pluginName: 'QRScanner',
  scanQRCode: vi.fn().mockResolvedValue({ value: '{"test":"data"}', format: 'QR_CODE' }),
  isAvailable: vi.fn().mockResolvedValue({ available: true }),
}));

vi.mock('@capacitor/core', () => ({
  registerPlugin: vi.fn((name: string) => {
    if (name === 'QRScanner') return mockQRScanner;
    return {};
  }),
}));

// ─── Import after mocks ──────────────────────────────────────────────────────

import {
  QR_SYNC_EXPIRY_MS,
  generateSyncQR,
  processSyncQR,
  scanSyncQR,
  isPayloadExpired,
  getRemainingSeconds,
} from '../plugins/qr-sync';
import type { QRSyncPayload } from '@lockbox/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePayload(overrides: Partial<QRSyncPayload> = {}): QRSyncPayload {
  return {
    ephemeralPublicKey: 'test-public-key',
    encryptedSessionKey: 'dGVzdA==.dGVzdA==',
    nonce: 'dGVzdC1ub25jZQ==',
    expiresAt: new Date(Date.now() + 30000).toISOString(),
    ...overrides,
  };
}

function makeFutureDate(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

function makePastDate(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

// ─── Constants ────────────────────────────────────────────────────────────────

describe('QR_SYNC_EXPIRY_MS', () => {
  it('is 30 seconds', () => {
    expect(QR_SYNC_EXPIRY_MS).toBe(30_000);
  });
});

// ─── isPayloadExpired ─────────────────────────────────────────────────────────

describe('isPayloadExpired', () => {
  it('returns false for future expiry', () => {
    const payload = makePayload({ expiresAt: makeFutureDate(60000) });
    expect(isPayloadExpired(payload)).toBe(false);
  });

  it('returns true for past expiry', () => {
    const payload = makePayload({ expiresAt: makePastDate(1000) });
    expect(isPayloadExpired(payload)).toBe(true);
  });

  it('returns true for already expired (1ms ago)', () => {
    const payload = makePayload({ expiresAt: makePastDate(1) });
    expect(isPayloadExpired(payload)).toBe(true);
  });

  it('returns false for expiry 30 seconds from now', () => {
    const payload = makePayload({ expiresAt: makeFutureDate(30000) });
    expect(isPayloadExpired(payload)).toBe(false);
  });

  it('returns true for far past date', () => {
    const payload = makePayload({ expiresAt: '2020-01-01T00:00:00Z' });
    expect(isPayloadExpired(payload)).toBe(true);
  });
});

// ─── getRemainingSeconds ──────────────────────────────────────────────────────

describe('getRemainingSeconds', () => {
  it('returns positive seconds for future expiry', () => {
    const payload = makePayload({ expiresAt: makeFutureDate(15000) });
    const remaining = getRemainingSeconds(payload);
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(15);
  });

  it('returns 0 for expired payload', () => {
    const payload = makePayload({ expiresAt: makePastDate(5000) });
    expect(getRemainingSeconds(payload)).toBe(0);
  });

  it('returns approximately 30 for 30s expiry', () => {
    const payload = makePayload({ expiresAt: makeFutureDate(30000) });
    const remaining = getRemainingSeconds(payload);
    expect(remaining).toBeGreaterThanOrEqual(29);
    expect(remaining).toBeLessThanOrEqual(30);
  });

  it('never returns negative', () => {
    const payload = makePayload({ expiresAt: makePastDate(999999) });
    expect(getRemainingSeconds(payload)).toBe(0);
  });

  it('returns 0 for exactly now', () => {
    const payload = makePayload({ expiresAt: new Date().toISOString() });
    expect(getRemainingSeconds(payload)).toBe(0);
  });

  it('handles 1 second remaining', () => {
    const payload = makePayload({ expiresAt: makeFutureDate(1000) });
    const remaining = getRemainingSeconds(payload);
    expect(remaining).toBeGreaterThanOrEqual(0);
    expect(remaining).toBeLessThanOrEqual(1);
  });
});

// ─── generateSyncQR ──────────────────────────────────────────────────────────

describe('generateSyncQR', () => {
  it('creates valid QR data payload', async () => {
    const result = await generateSyncQR({
      sessionToken: 'session-abc-123',
      userKey: crypto.getRandomValues(new Uint8Array(32)),
    });
    expect(typeof result.qrData).toBe('string');
    const parsed = JSON.parse(result.qrData);
    expect(parsed).toHaveProperty('ephemeralPublicKey');
    expect(parsed).toHaveProperty('encryptedSessionKey');
    expect(parsed).toHaveProperty('nonce');
    expect(parsed).toHaveProperty('expiresAt');
  });

  it('sets approximately 30s expiry', async () => {
    const before = Date.now();
    const result = await generateSyncQR({
      sessionToken: 'token',
      userKey: crypto.getRandomValues(new Uint8Array(32)),
    });
    const after = Date.now();
    const expiresMs = new Date(result.expiresAt).getTime();
    expect(expiresMs - before).toBeGreaterThanOrEqual(QR_SYNC_EXPIRY_MS - 2000);
    expect(expiresMs - after).toBeLessThanOrEqual(QR_SYNC_EXPIRY_MS + 2000);
  });

  it('returns private key', async () => {
    const result = await generateSyncQR({
      sessionToken: 'token',
      userKey: crypto.getRandomValues(new Uint8Array(32)),
    });
    expect(typeof result.privateKey).toBe('string');
    expect(result.privateKey.length).toBeGreaterThan(0);
  });

  it('returns ISO 8601 expiresAt', async () => {
    const result = await generateSyncQR({
      sessionToken: 'token',
      userKey: crypto.getRandomValues(new Uint8Array(32)),
    });
    const date = new Date(result.expiresAt);
    expect(date.toISOString()).toBe(result.expiresAt);
  });

  it('generates different QR data each time (unique keys)', async () => {
    const userKey = crypto.getRandomValues(new Uint8Array(32));
    const result1 = await generateSyncQR({ sessionToken: 'token', userKey });
    const result2 = await generateSyncQR({ sessionToken: 'token', userKey });
    expect(result1.qrData).not.toBe(result2.qrData);
  });

  it('QR data contains valid base64 nonce', async () => {
    const result = await generateSyncQR({
      sessionToken: 'token',
      userKey: crypto.getRandomValues(new Uint8Array(32)),
    });
    const parsed = JSON.parse(result.qrData) as QRSyncPayload;
    expect(() => atob(parsed.nonce)).not.toThrow();
  });
});

// ─── processSyncQR ───────────────────────────────────────────────────────────

describe('processSyncQR', () => {
  it('returns null for invalid JSON', async () => {
    const result = await processSyncQR({ qrData: 'not-json' });
    expect(result).toBeNull();
  });

  it('returns null for expired payload', async () => {
    const payload = makePayload({ expiresAt: makePastDate(5000) });
    const result = await processSyncQR({ qrData: JSON.stringify(payload) });
    expect(result).toBeNull();
  });

  it('returns null for empty string', async () => {
    const result = await processSyncQR({ qrData: '' });
    expect(result).toBeNull();
  });

  it('returns null for missing ephemeralPublicKey', async () => {
    const payload = { encryptedSessionKey: 'a', nonce: 'b', expiresAt: makeFutureDate(30000) };
    const result = await processSyncQR({ qrData: JSON.stringify(payload) });
    expect(result).toBeNull();
  });

  it('returns null for missing encryptedSessionKey', async () => {
    const payload = { ephemeralPublicKey: 'a', nonce: 'b', expiresAt: makeFutureDate(30000) };
    const result = await processSyncQR({ qrData: JSON.stringify(payload) });
    expect(result).toBeNull();
  });

  it('returns null for missing nonce', async () => {
    const payload = {
      ephemeralPublicKey: 'a',
      encryptedSessionKey: 'b',
      expiresAt: makeFutureDate(30000),
    };
    const result = await processSyncQR({ qrData: JSON.stringify(payload) });
    expect(result).toBeNull();
  });

  it('returns null for missing expiresAt', async () => {
    const payload = { ephemeralPublicKey: 'a', encryptedSessionKey: 'b', nonce: 'c' };
    const result = await processSyncQR({ qrData: JSON.stringify(payload) });
    expect(result).toBeNull();
  });

  it('returns null when decryption fails (wrong keys)', async () => {
    const payload = makePayload({ expiresAt: makeFutureDate(30000) });
    const result = await processSyncQR({ qrData: JSON.stringify(payload) });
    expect(result).toBeNull();
  });
});

// ─── scanSyncQR ──────────────────────────────────────────────────────────────

describe('scanSyncQR', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQRScanner.isAvailable.mockResolvedValue({ available: true });
    mockQRScanner.scanQRCode.mockResolvedValue({
      value: '{"test":"scanned"}',
      format: 'QR_CODE',
    });
  });

  it('returns scanned value on success', async () => {
    const result = await scanSyncQR();
    expect(result).toBe('{"test":"scanned"}');
  });

  it('calls QR scanner plugin', async () => {
    await scanSyncQR();
    expect(mockQRScanner.scanQRCode).toHaveBeenCalled();
  });

  it('checks availability before scanning', async () => {
    await scanSyncQR();
    expect(mockQRScanner.isAvailable).toHaveBeenCalled();
  });

  it('returns null when camera is not available', async () => {
    mockQRScanner.isAvailable.mockResolvedValue({ available: false });
    const result = await scanSyncQR();
    expect(result).toBeNull();
  });

  it('returns null when scan throws', async () => {
    mockQRScanner.scanQRCode.mockRejectedValue(new Error('Camera error'));
    const result = await scanSyncQR();
    expect(result).toBeNull();
  });

  it('returns null when availability check throws', async () => {
    mockQRScanner.isAvailable.mockRejectedValue(new Error('Permission denied'));
    const result = await scanSyncQR();
    expect(result).toBeNull();
  });
});
