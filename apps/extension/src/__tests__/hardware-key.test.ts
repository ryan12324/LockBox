/**
 * Tests for hardware security key registration, authentication, and management.
 * Tests the pure functions from lib/hardware-key.ts in isolation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  wrapMasterKey,
  unwrapMasterKey,
  isHardwareKeySupported,
  buildSetupRequest,
  extractPublicKeyFromAttestation,
  requestHardwareKeyChallenge,
  authenticateWithHardwareKey,
  listHardwareKeys,
  removeHardwareKey,
  registerHardwareKey,
} from '../../lib/hardware-key.js';
import type { HardwareKeySetupRequest } from '@lockbox/types';

// ─── Master key wrapping ──────────────────────────────────────────────────────

describe('wrapMasterKey / unwrapMasterKey', () => {
  it('round-trips a master key through wrap/unwrap', async () => {
    const masterKey = crypto.getRandomValues(new Uint8Array(32));
    const publicKeyBytes = crypto.getRandomValues(new Uint8Array(65));

    const wrapped = await wrapMasterKey(masterKey, publicKeyBytes);
    const unwrapped = await unwrapMasterKey(wrapped, publicKeyBytes);

    expect(unwrapped).toEqual(masterKey);
  });

  it('produces different ciphertext each time (random IV)', async () => {
    const masterKey = crypto.getRandomValues(new Uint8Array(32));
    const publicKeyBytes = crypto.getRandomValues(new Uint8Array(65));

    const wrapped1 = await wrapMasterKey(masterKey, publicKeyBytes);
    const wrapped2 = await wrapMasterKey(masterKey, publicKeyBytes);

    expect(wrapped1).not.toBe(wrapped2);
  });

  it('wrapped format is base64url(iv).base64url(ciphertext)', async () => {
    const masterKey = crypto.getRandomValues(new Uint8Array(32));
    const publicKeyBytes = crypto.getRandomValues(new Uint8Array(65));

    const wrapped = await wrapMasterKey(masterKey, publicKeyBytes);
    const parts = wrapped.split('.');

    expect(parts.length).toBe(2);
    expect(parts[0].length).toBeGreaterThan(0);
    expect(parts[1].length).toBeGreaterThan(0);
  });

  it('fails to unwrap with different public key', async () => {
    const masterKey = crypto.getRandomValues(new Uint8Array(32));
    const publicKeyBytes1 = crypto.getRandomValues(new Uint8Array(65));
    const publicKeyBytes2 = crypto.getRandomValues(new Uint8Array(65));

    const wrapped = await wrapMasterKey(masterKey, publicKeyBytes1);

    await expect(unwrapMasterKey(wrapped, publicKeyBytes2)).rejects.toThrow();
  });

  it('fails to unwrap with tampered ciphertext', async () => {
    const masterKey = crypto.getRandomValues(new Uint8Array(32));
    const publicKeyBytes = crypto.getRandomValues(new Uint8Array(65));

    const wrapped = await wrapMasterKey(masterKey, publicKeyBytes);
    // Tamper with the ciphertext part
    const parts = wrapped.split('.');
    const tamperedCiphertext = parts[1].slice(0, -2) + 'XX';
    const tampered = `${parts[0]}.${tamperedCiphertext}`;

    await expect(unwrapMasterKey(tampered, publicKeyBytes)).rejects.toThrow();
  });

  it('rejects invalid wrapped format (no dot separator)', async () => {
    const publicKeyBytes = crypto.getRandomValues(new Uint8Array(65));
    await expect(unwrapMasterKey('invalid-no-dot', publicKeyBytes)).rejects.toThrow(
      'Invalid wrapped master key format'
    );
  });

  it('wraps keys of different sizes', async () => {
    const publicKeyBytes = crypto.getRandomValues(new Uint8Array(65));

    // 16-byte key
    const key16 = crypto.getRandomValues(new Uint8Array(16));
    const wrapped16 = await wrapMasterKey(key16, publicKeyBytes);
    const unwrapped16 = await unwrapMasterKey(wrapped16, publicKeyBytes);
    expect(unwrapped16).toEqual(key16);

    // 64-byte key
    const key64 = crypto.getRandomValues(new Uint8Array(64));
    const wrapped64 = await wrapMasterKey(key64, publicKeyBytes);
    const unwrapped64 = await unwrapMasterKey(wrapped64, publicKeyBytes);
    expect(unwrapped64).toEqual(key64);
  });
});

// ─── Hardware key support detection ───────────────────────────────────────────

describe('isHardwareKeySupported', () => {
  it('returns a boolean', () => {
    const result = isHardwareKeySupported();
    expect(typeof result).toBe('boolean');
  });

  it('checks for navigator.credentials presence', () => {
    // In jsdom, navigator.credentials is typically undefined
    const result = isHardwareKeySupported();
    // The result depends on the test environment
    expect(typeof result).toBe('boolean');
  });
});

// ─── buildSetupRequest ────────────────────────────────────────────────────────

describe('buildSetupRequest', () => {
  it('builds a setup request with yubikey-piv type', () => {
    const request = buildSetupRequest('yubikey-piv', 'pk-123', 'wrapped-key');
    expect(request.keyType).toBe('yubikey-piv');
    expect(request.publicKey).toBe('pk-123');
    expect(request.wrappedMasterKey).toBe('wrapped-key');
    expect(request.attestation).toBeUndefined();
  });

  it('builds a setup request with fido2 type', () => {
    const request = buildSetupRequest('fido2', 'pk-456', 'wrapped-key-2');
    expect(request.keyType).toBe('fido2');
    expect(request.publicKey).toBe('pk-456');
    expect(request.wrappedMasterKey).toBe('wrapped-key-2');
  });

  it('includes attestation when provided', () => {
    const request = buildSetupRequest('fido2', 'pk-789', 'wrapped-key-3', 'attestation-data');
    expect(request.attestation).toBe('attestation-data');
  });

  it('returns correct interface shape', () => {
    const request: HardwareKeySetupRequest = buildSetupRequest('yubikey-piv', 'pk', 'wk');
    expect(request).toHaveProperty('keyType');
    expect(request).toHaveProperty('publicKey');
    expect(request).toHaveProperty('wrappedMasterKey');
  });
});

// ─── extractPublicKeyFromAttestation ──────────────────────────────────────────

describe('extractPublicKeyFromAttestation', () => {
  it('returns null when getPublicKey returns null', () => {
    const mockResponse = {
      getPublicKey: () => null,
      clientDataJSON: new ArrayBuffer(0),
      attestationObject: new ArrayBuffer(0),
      getAuthenticatorData: () => new ArrayBuffer(0),
      getPublicKeyAlgorithm: () => -7,
      getTransports: () => [] as string[],
    } as unknown as AuthenticatorAttestationResponse;

    const result = extractPublicKeyFromAttestation(mockResponse);
    expect(result).toBeNull();
  });

  it('returns Uint8Array when getPublicKey returns data', () => {
    const publicKeyData = new Uint8Array([1, 2, 3, 4, 5]).buffer;
    const mockResponse = {
      getPublicKey: () => publicKeyData,
      clientDataJSON: new ArrayBuffer(0),
      attestationObject: new ArrayBuffer(0),
      getAuthenticatorData: () => new ArrayBuffer(0),
      getPublicKeyAlgorithm: () => -7,
      getTransports: () => [] as string[],
    } as unknown as AuthenticatorAttestationResponse;

    const result = extractPublicKeyFromAttestation(mockResponse);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result!.length).toBe(5);
  });
});

// ─── API interaction: requestHardwareKeyChallenge ─────────────────────────────

describe('requestHardwareKeyChallenge', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends POST to correct endpoint', async () => {
    const mockResponse = {
      ok: true,
      json: () =>
        Promise.resolve({
          challenge: 'test-challenge',
          keyId: 'key-1',
          expiresAt: '2025-12-31T23:59:59Z',
        }),
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    await requestHardwareKeyChallenge('https://api.example.com', 'key-1');

    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.com/api/auth/hardware-key/challenge',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ keyId: 'key-1' }),
      })
    );
  });

  it('returns challenge response on success', async () => {
    const expected = {
      challenge: 'abc-challenge',
      keyId: 'key-2',
      expiresAt: '2025-12-31T00:00:00Z',
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(expected),
    } as Response);

    const result = await requestHardwareKeyChallenge('https://api.test.com', 'key-2');
    expect(result).toEqual(expected);
  });

  it('throws on non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: 'Key not found' }),
    } as unknown as Response);

    await expect(requestHardwareKeyChallenge('https://api.test.com', 'bad-key')).rejects.toThrow(
      'Key not found'
    );
  });
});

// ─── API interaction: listHardwareKeys ────────────────────────────────────────

describe('listHardwareKeys', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends GET with authorization header', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          keys: [{ id: 'k1', keyType: 'fido2', createdAt: '2025-01-01T00:00:00Z' }],
        }),
    } as Response);

    await listHardwareKeys('https://api.test.com', 'my-token');

    expect(fetch).toHaveBeenCalledWith(
      'https://api.test.com/api/auth/hardware-keys',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer my-token',
        }),
      })
    );
  });

  it('returns parsed keys array', async () => {
    const keysData = [
      { id: 'k1', keyType: 'fido2', createdAt: '2025-01-01T00:00:00Z' },
      { id: 'k2', keyType: 'yubikey-piv', createdAt: '2025-02-01T00:00:00Z' },
    ];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ keys: keysData }),
    } as Response);

    const result = await listHardwareKeys('https://api.test.com', 'token');
    expect(result).toEqual(keysData);
    expect(result).toHaveLength(2);
  });

  it('throws on error response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'Unauthorized' }),
    } as unknown as Response);

    await expect(listHardwareKeys('https://api.test.com', 'bad-token')).rejects.toThrow(
      'Unauthorized'
    );
  });
});

// ─── API interaction: removeHardwareKey ───────────────────────────────────────

describe('removeHardwareKey', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends DELETE to correct endpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response);

    await removeHardwareKey('https://api.test.com', 'token', 'key-to-remove');

    expect(fetch).toHaveBeenCalledWith(
      'https://api.test.com/api/auth/hardware-keys/key-to-remove',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({
          Authorization: 'Bearer token',
        }),
      })
    );
  });

  it('resolves on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response);

    await expect(
      removeHardwareKey('https://api.test.com', 'token', 'key-1')
    ).resolves.toBeUndefined();
  });

  it('throws on error response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ error: 'Forbidden' }),
    } as unknown as Response);

    await expect(removeHardwareKey('https://api.test.com', 'token', 'key-1')).rejects.toThrow(
      'Forbidden'
    );
  });

  it('URL-encodes the keyId', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response);

    await removeHardwareKey('https://api.test.com', 'token', 'key with spaces');

    expect(fetch).toHaveBeenCalledWith(
      'https://api.test.com/api/auth/hardware-keys/key%20with%20spaces',
      expect.anything()
    );
  });
});

// ─── Error handling: WebAuthn not available ───────────────────────────────────

describe('registerHardwareKey - error handling', () => {
  it('throws when navigator.credentials is undefined', async () => {
    // In jsdom, navigator.credentials is undefined by default
    const origCredentials = navigator.credentials;
    Object.defineProperty(navigator, 'credentials', {
      value: undefined,
      configurable: true,
    });

    await expect(
      registerHardwareKey({
        userId: 'user-1',
        email: 'test@example.com',
        masterKey: new Uint8Array(32),
      })
    ).rejects.toThrow('WebAuthn is not available');

    Object.defineProperty(navigator, 'credentials', {
      value: origCredentials,
      configurable: true,
    });
  });
});

describe('authenticateWithHardwareKey - error handling', () => {
  it('throws when navigator.credentials is undefined', async () => {
    const origCredentials = navigator.credentials;
    Object.defineProperty(navigator, 'credentials', {
      value: undefined,
      configurable: true,
    });

    await expect(
      authenticateWithHardwareKey({
        apiUrl: 'https://api.test.com',
        keyId: 'key-1',
        challenge: 'Y2hhbGxlbmdl', // base64url of "challenge"
      })
    ).rejects.toThrow('WebAuthn is not available');

    Object.defineProperty(navigator, 'credentials', {
      value: origCredentials,
      configurable: true,
    });
  });
});
