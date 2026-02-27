/**
 * Tests for QR-based device sync: generation, scanning, expiry management.
 * Tests the pure functions from lib/qr-sync.ts in isolation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateSyncQR,
  processSyncQR,
  scanQRFromImage,
  isPayloadExpired,
  getRemainingSeconds,
  uint8ArrayToBase64,
  base64ToUint8Array,
} from '../../lib/qr-sync.js';
import type { QRSyncPayload } from '@lockbox/types';

// ─── Base64 utilities ─────────────────────────────────────────────────────────

describe('uint8ArrayToBase64 / base64ToUint8Array', () => {
  it('round-trips simple data', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const encoded = uint8ArrayToBase64(data);
    const decoded = base64ToUint8Array(encoded);
    expect(decoded).toEqual(data);
  });

  it('round-trips empty data', () => {
    const data = new Uint8Array(0);
    const encoded = uint8ArrayToBase64(data);
    expect(encoded).toBe('');
    const decoded = base64ToUint8Array(encoded);
    expect(decoded).toEqual(data);
  });

  it('round-trips 32 random bytes', () => {
    const data = crypto.getRandomValues(new Uint8Array(32));
    const decoded = base64ToUint8Array(uint8ArrayToBase64(data));
    expect(decoded).toEqual(data);
  });

  it('produces valid base64', () => {
    const data = new Uint8Array([0xff, 0xfe, 0xfd]);
    const encoded = uint8ArrayToBase64(data);
    // Should be decodable by atob
    expect(() => atob(encoded)).not.toThrow();
  });
});

// ─── generateSyncQR ──────────────────────────────────────────────────────────

describe('generateSyncQR', () => {
  it('creates valid payload with all required fields', async () => {
    const result = await generateSyncQR({
      sessionToken: 'test-session-token',
      userKey: crypto.getRandomValues(new Uint8Array(32)),
    });

    expect(result.qrData).toBeDefined();
    expect(result.privateKey).toBeDefined();
    expect(result.expiresAt).toBeDefined();
  });

  it('qrData is valid JSON', async () => {
    const result = await generateSyncQR({
      sessionToken: 'token-123',
      userKey: new Uint8Array(32),
    });

    const parsed = JSON.parse(result.qrData);
    expect(parsed).toBeDefined();
    expect(typeof parsed).toBe('object');
  });

  it('qrData contains QRSyncPayload fields', async () => {
    const result = await generateSyncQR({
      sessionToken: 'token-456',
      userKey: new Uint8Array(32),
    });

    const payload: QRSyncPayload = JSON.parse(result.qrData);
    expect(payload.ephemeralPublicKey).toBeDefined();
    expect(payload.encryptedSessionKey).toBeDefined();
    expect(payload.nonce).toBeDefined();
    expect(payload.expiresAt).toBeDefined();
  });

  it('sets 30-second expiry', async () => {
    const before = Date.now();
    const result = await generateSyncQR({
      sessionToken: 'token',
      userKey: new Uint8Array(32),
    });

    const expiresAt = new Date(result.expiresAt).getTime();
    const expectedMin = before + 29000; // 29s minimum
    const expectedMax = before + 31000; // 31s maximum (allows for test execution time)

    expect(expiresAt).toBeGreaterThanOrEqual(expectedMin);
    expect(expiresAt).toBeLessThanOrEqual(expectedMax);
  });

  it('encrypts session data (ciphertext differs from plaintext)', async () => {
    const sessionToken = 'my-secret-token';
    const result = await generateSyncQR({
      sessionToken,
      userKey: new Uint8Array(32),
    });

    const payload: QRSyncPayload = JSON.parse(result.qrData);
    // The encrypted session key should not contain the raw token
    expect(payload.encryptedSessionKey).not.toContain(sessionToken);
  });

  it('generates unique payloads per call', async () => {
    const opts = {
      sessionToken: 'same-token',
      userKey: new Uint8Array(32),
    };

    const result1 = await generateSyncQR(opts);
    const result2 = await generateSyncQR(opts);

    expect(result1.qrData).not.toBe(result2.qrData);
    expect(result1.privateKey).not.toBe(result2.privateKey);
  });

  it('returns non-empty privateKey', async () => {
    const result = await generateSyncQR({
      sessionToken: 'tok',
      userKey: new Uint8Array(32),
    });

    expect(result.privateKey.length).toBeGreaterThan(0);
  });
});

// ─── processSyncQR ───────────────────────────────────────────────────────────

describe('processSyncQR', () => {
  it('decrypts session data from valid payload', async () => {
    const sessionToken = 'test-session-token-xyz';
    const userKey = crypto.getRandomValues(new Uint8Array(32));

    const generated = await generateSyncQR({ sessionToken, userKey });
    const processed = await processSyncQR({ qrData: generated.qrData });

    expect(processed).not.toBeNull();
    expect(processed!.sessionToken).toBe(sessionToken);
    expect(processed!.userKey).toEqual(userKey);
  });

  it('rejects expired payload', async () => {
    const payload: QRSyncPayload = {
      ephemeralPublicKey: 'fake-key',
      encryptedSessionKey: 'fake-data',
      nonce: 'fake-nonce',
      expiresAt: new Date(Date.now() - 1000).toISOString(), // Already expired
    };

    const result = await processSyncQR({ qrData: JSON.stringify(payload) });
    expect(result).toBeNull();
  });

  it('handles invalid JSON gracefully', async () => {
    const result = await processSyncQR({ qrData: 'not-json{{{' });
    expect(result).toBeNull();
  });

  it('handles empty qrData gracefully', async () => {
    const result = await processSyncQR({ qrData: '' });
    expect(result).toBeNull();
  });

  it('handles missing required fields in payload', async () => {
    const incomplete = JSON.stringify({ ephemeralPublicKey: 'key-only' });
    const result = await processSyncQR({ qrData: incomplete });
    expect(result).toBeNull();
  });

  it('round-trip: generate → process recovers original data', async () => {
    const originalToken = 'session-round-trip-test';
    const originalKey = crypto.getRandomValues(new Uint8Array(32));

    const generated = await generateSyncQR({
      sessionToken: originalToken,
      userKey: originalKey,
    });

    const processed = await processSyncQR({ qrData: generated.qrData });

    expect(processed).not.toBeNull();
    expect(processed!.sessionToken).toBe(originalToken);
    expect(new Uint8Array(processed!.userKey)).toEqual(new Uint8Array(originalKey));
  });

  it('round-trip works with long session tokens', async () => {
    const longToken = 'x'.repeat(1024);
    const userKey = crypto.getRandomValues(new Uint8Array(32));

    const generated = await generateSyncQR({ sessionToken: longToken, userKey });
    const processed = await processSyncQR({ qrData: generated.qrData });

    expect(processed).not.toBeNull();
    expect(processed!.sessionToken).toBe(longToken);
  });

  it('round-trip works with binary user keys', async () => {
    const sessionToken = 'binary-key-test';
    const userKey = new Uint8Array(64);
    for (let i = 0; i < 64; i++) userKey[i] = i;

    const generated = await generateSyncQR({ sessionToken, userKey });
    const processed = await processSyncQR({ qrData: generated.qrData });

    expect(processed).not.toBeNull();
    expect(new Uint8Array(processed!.userKey)).toEqual(userKey);
  });
});

// ─── scanQRFromImage ─────────────────────────────────────────────────────────

describe('scanQRFromImage', () => {
  it('decodes valid QR sync payload from Uint8Array', async () => {
    const payload: QRSyncPayload = {
      ephemeralPublicKey: 'test-pub-key',
      encryptedSessionKey: 'encrypted-data',
      nonce: 'test-nonce',
      expiresAt: new Date(Date.now() + 30000).toISOString(),
    };
    const encoded = new TextEncoder().encode(JSON.stringify(payload));

    const result = await scanQRFromImage(encoded);
    expect(result).not.toBeNull();

    const parsed = JSON.parse(result!);
    expect(parsed.ephemeralPublicKey).toBe('test-pub-key');
  });

  it('returns null for non-payload Uint8Array', async () => {
    const randomData = crypto.getRandomValues(new Uint8Array(100));
    const result = await scanQRFromImage(randomData);
    expect(result).toBeNull();
  });

  it('returns null for ImageData (requires library)', async () => {
    // ImageData is not available in Node/happy-dom, use a plain object with width/height
    const imageData = { data: new Uint8Array(400), width: 10, height: 10 };
    const result = await scanQRFromImage(imageData as unknown as ImageData);
    expect(result).toBeNull();
  });
});

// ─── isPayloadExpired ────────────────────────────────────────────────────────

describe('isPayloadExpired', () => {
  it('returns false for non-expired payload', () => {
    const payload: QRSyncPayload = {
      ephemeralPublicKey: '',
      encryptedSessionKey: '',
      nonce: '',
      expiresAt: new Date(Date.now() + 30000).toISOString(),
    };
    expect(isPayloadExpired(payload)).toBe(false);
  });

  it('returns true for expired payload', () => {
    const payload: QRSyncPayload = {
      ephemeralPublicKey: '',
      encryptedSessionKey: '',
      nonce: '',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    };
    expect(isPayloadExpired(payload)).toBe(true);
  });

  it('returns true for payload that just expired', () => {
    const payload: QRSyncPayload = {
      ephemeralPublicKey: '',
      encryptedSessionKey: '',
      nonce: '',
      expiresAt: new Date(Date.now() - 1).toISOString(),
    };
    expect(isPayloadExpired(payload)).toBe(true);
  });
});

// ─── getRemainingSeconds ─────────────────────────────────────────────────────

describe('getRemainingSeconds', () => {
  it('returns positive seconds for non-expired payload', () => {
    const payload: QRSyncPayload = {
      ephemeralPublicKey: '',
      encryptedSessionKey: '',
      nonce: '',
      expiresAt: new Date(Date.now() + 15000).toISOString(),
    };
    const remaining = getRemainingSeconds(payload);
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(15);
  });

  it('returns 0 for expired payload', () => {
    const payload: QRSyncPayload = {
      ephemeralPublicKey: '',
      encryptedSessionKey: '',
      nonce: '',
      expiresAt: new Date(Date.now() - 5000).toISOString(),
    };
    expect(getRemainingSeconds(payload)).toBe(0);
  });

  it('calculates approximately 30 seconds for fresh payload', () => {
    const payload: QRSyncPayload = {
      ephemeralPublicKey: '',
      encryptedSessionKey: '',
      nonce: '',
      expiresAt: new Date(Date.now() + 30000).toISOString(),
    };
    const remaining = getRemainingSeconds(payload);
    expect(remaining).toBeGreaterThanOrEqual(29);
    expect(remaining).toBeLessThanOrEqual(31);
  });

  it('never returns negative values', () => {
    const payload: QRSyncPayload = {
      ephemeralPublicKey: '',
      encryptedSessionKey: '',
      nonce: '',
      expiresAt: new Date(Date.now() - 999999).toISOString(),
    };
    expect(getRemainingSeconds(payload)).toBe(0);
  });
});
