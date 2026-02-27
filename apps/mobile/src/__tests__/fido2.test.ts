/**
 * Tests for FIDO2 hardware key plugin — registration, authentication,
 * key management, API integration, and error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks (must be before vi.mock) ──────────────────────────────────

const mockFido2Plugin = vi.hoisted(() => ({
  _pluginName: 'Fido2',
  isAvailable: vi.fn().mockResolvedValue({ available: true }),
  register: vi.fn().mockResolvedValue({
    keyId: 'test-key-id-base64url',
    publicKey: 'dGVzdC1wdWJsaWMta2V5LWRhdGEtMzItYnl0ZXM=',
    attestation: 'test-attestation-base64url',
  }),
  authenticate: vi.fn().mockResolvedValue({
    signature: 'test-signature-base64url',
    authenticatorData: 'test-auth-data-base64url',
    clientDataJSON: 'test-client-data-base64url',
  }),
}));

vi.mock('@capacitor/core', () => ({
  registerPlugin: vi.fn((name: string) => {
    if (name === 'Fido2') return mockFido2Plugin;
    return {};
  }),
}));

// ─── Mock fetch ───────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ─── Import after mocks ──────────────────────────────────────────────────────

import {
  Fido2,
  registerFido2Key,
  authenticateFido2,
  wrapMasterKey,
  setupHardwareKey,
  unlockWithHardwareKey,
  listHardwareKeys,
  removeHardwareKey,
} from '../plugins/fido2';
import type {
  Fido2RegistrationResult,
  Fido2AuthenticationResult,
  Fido2RegistrationOptions,
  Fido2AuthenticationOptions,
  HardwareKeyInfo,
} from '../plugins/fido2';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeJsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    headers: new Headers(),
  } as Response;
}

function resetMocks(): void {
  vi.clearAllMocks();
  mockFido2Plugin.isAvailable.mockResolvedValue({ available: true });
  mockFido2Plugin.register.mockResolvedValue({
    keyId: 'test-key-id-base64url',
    publicKey: 'dGVzdC1wdWJsaWMta2V5LWRhdGEtMzItYnl0ZXM=',
    attestation: 'test-attestation-base64url',
  });
  mockFido2Plugin.authenticate.mockResolvedValue({
    signature: 'test-signature-base64url',
    authenticatorData: 'test-auth-data-base64url',
    clientDataJSON: 'test-client-data-base64url',
  });
}

// ─── Fido2 Plugin interface ──────────────────────────────────────────────────

describe('Fido2 Plugin interface', () => {
  beforeEach(resetMocks);

  it('registers as "Fido2" plugin', () => {
    expect(Fido2).toBeDefined();
    expect((Fido2 as unknown as Record<string, unknown>)._pluginName).toBe('Fido2');
  });

  it('isAvailable returns availability status', async () => {
    const result = await Fido2.isAvailable();
    expect(result).toHaveProperty('available');
    expect(typeof result.available).toBe('boolean');
  });

  it('register returns credential data', async () => {
    const result = await Fido2.register({
      userId: 'user-1',
      email: 'test@example.com',
      rpId: 'example.com',
      rpName: 'Example',
    });
    expect(result).toHaveProperty('keyId');
    expect(result).toHaveProperty('publicKey');
    expect(result).toHaveProperty('attestation');
  });

  it('authenticate returns signature data', async () => {
    const result = await Fido2.authenticate({
      challenge: 'test-challenge',
      rpId: 'example.com',
      allowCredentials: [{ id: 'key-1', type: 'public-key' }],
    });
    expect(result).toHaveProperty('signature');
    expect(result).toHaveProperty('authenticatorData');
    expect(result).toHaveProperty('clientDataJSON');
  });
});

// ─── registerFido2Key ─────────────────────────────────────────────────────────

describe('registerFido2Key', () => {
  beforeEach(resetMocks);

  it('creates credential with correct FIDO2 options', async () => {
    const options: Fido2RegistrationOptions = {
      userId: 'user-123',
      email: 'alice@lockbox.dev',
      rpId: 'lockbox.dev',
      rpName: 'Lockbox',
    };
    await registerFido2Key(options);
    expect(mockFido2Plugin.register).toHaveBeenCalledWith(options);
  });

  it('extracts public key from registration result', async () => {
    const result = await registerFido2Key({
      userId: 'user-123',
      email: 'alice@lockbox.dev',
      rpId: 'lockbox.dev',
      rpName: 'Lockbox',
    });
    expect(result.publicKey).toBe('dGVzdC1wdWJsaWMta2V5LWRhdGEtMzItYnl0ZXM=');
  });

  it('extracts attestation from registration result', async () => {
    const result = await registerFido2Key({
      userId: 'user-123',
      email: 'alice@lockbox.dev',
      rpId: 'lockbox.dev',
      rpName: 'Lockbox',
    });
    expect(result.attestation).toBe('test-attestation-base64url');
  });

  it('extracts keyId from registration result', async () => {
    const result = await registerFido2Key({
      userId: 'user-123',
      email: 'alice@lockbox.dev',
      rpId: 'lockbox.dev',
      rpName: 'Lockbox',
    });
    expect(result.keyId).toBe('test-key-id-base64url');
  });

  it('checks availability before registering', async () => {
    await registerFido2Key({
      userId: 'user-123',
      email: 'test@test.com',
      rpId: 'test.com',
      rpName: 'Test',
    });
    expect(mockFido2Plugin.isAvailable).toHaveBeenCalled();
  });

  it('throws when FIDO2 is not available', async () => {
    mockFido2Plugin.isAvailable.mockResolvedValue({ available: false });
    await expect(
      registerFido2Key({
        userId: 'user-123',
        email: 'test@test.com',
        rpId: 'test.com',
        rpName: 'Test',
      })
    ).rejects.toThrow('FIDO2 hardware key support is not available on this device');
  });

  it('throws when native plugin throws (user cancels)', async () => {
    mockFido2Plugin.register.mockRejectedValue(new Error('User cancelled'));
    await expect(
      registerFido2Key({
        userId: 'user-123',
        email: 'test@test.com',
        rpId: 'test.com',
        rpName: 'Test',
      })
    ).rejects.toThrow('User cancelled');
  });
});

// ─── authenticateFido2 ────────────────────────────────────────────────────────

describe('authenticateFido2', () => {
  beforeEach(resetMocks);

  it('signs challenge with hardware key', async () => {
    const options: Fido2AuthenticationOptions = {
      challenge: 'random-challenge-base64',
      rpId: 'lockbox.dev',
      allowCredentials: [{ id: 'key-1', type: 'public-key' }],
    };
    const result = await authenticateFido2(options);
    expect(result.signature).toBe('test-signature-base64url');
    expect(mockFido2Plugin.authenticate).toHaveBeenCalledWith(options);
  });

  it('returns authenticator data', async () => {
    const result = await authenticateFido2({
      challenge: 'test-challenge',
      rpId: 'lockbox.dev',
      allowCredentials: [{ id: 'key-1', type: 'public-key' }],
    });
    expect(result.authenticatorData).toBe('test-auth-data-base64url');
  });

  it('returns client data JSON', async () => {
    const result = await authenticateFido2({
      challenge: 'test-challenge',
      rpId: 'lockbox.dev',
      allowCredentials: [{ id: 'key-1', type: 'public-key' }],
    });
    expect(result.clientDataJSON).toBe('test-client-data-base64url');
  });

  it('passes multiple allow credentials', async () => {
    const creds = [
      { id: 'key-1', type: 'public-key' },
      { id: 'key-2', type: 'public-key' },
    ];
    await authenticateFido2({
      challenge: 'test',
      rpId: 'lockbox.dev',
      allowCredentials: creds,
    });
    expect(mockFido2Plugin.authenticate).toHaveBeenCalledWith(
      expect.objectContaining({ allowCredentials: creds })
    );
  });

  it('throws when FIDO2 is not available', async () => {
    mockFido2Plugin.isAvailable.mockResolvedValue({ available: false });
    await expect(
      authenticateFido2({
        challenge: 'test',
        rpId: 'test.com',
        allowCredentials: [],
      })
    ).rejects.toThrow('FIDO2 hardware key support is not available on this device');
  });

  it('throws when user cancels authentication', async () => {
    mockFido2Plugin.authenticate.mockRejectedValue(new Error('User cancelled'));
    await expect(
      authenticateFido2({
        challenge: 'test',
        rpId: 'test.com',
        allowCredentials: [{ id: 'key-1', type: 'public-key' }],
      })
    ).rejects.toThrow('User cancelled');
  });
});

// ─── wrapMasterKey ────────────────────────────────────────────────────────────

describe('wrapMasterKey', () => {
  it('wraps a master key and returns encrypted format', async () => {
    const masterKey = crypto.getRandomValues(new Uint8Array(32));
    const publicKeyBase64 = btoa(
      String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))
    );
    const result = await wrapMasterKey(masterKey, publicKeyBase64);
    expect(typeof result).toBe('string');
    expect(result).toContain('.');
  });

  it('produces different outputs for same input (random IV)', async () => {
    const masterKey = crypto.getRandomValues(new Uint8Array(32));
    const publicKeyBase64 = btoa(
      String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))
    );
    const result1 = await wrapMasterKey(masterKey, publicKeyBase64);
    const result2 = await wrapMasterKey(masterKey, publicKeyBase64);
    expect(result1).not.toBe(result2);
  });

  it('output contains two base64 segments separated by dot', async () => {
    const masterKey = crypto.getRandomValues(new Uint8Array(32));
    const publicKeyBase64 = btoa(
      String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))
    );
    const result = await wrapMasterKey(masterKey, publicKeyBase64);
    const parts = result.split('.');
    expect(parts).toHaveLength(2);
    expect(parts[0].length).toBeGreaterThan(0);
    expect(parts[1].length).toBeGreaterThan(0);
  });
});

// ─── setupHardwareKey ─────────────────────────────────────────────────────────

describe('setupHardwareKey', () => {
  beforeEach(resetMocks);

  it('calls registration + API', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse({ keyId: 'server-key-id' }));

    const result = await setupHardwareKey({
      apiUrl: 'https://api.lockbox.dev',
      token: 'bearer-token-123',
      userId: 'user-1',
      email: 'alice@lockbox.dev',
      masterKey: crypto.getRandomValues(new Uint8Array(32)),
    });

    expect(mockFido2Plugin.register).toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalled();
    expect(result.keyId).toBe('server-key-id');
  });

  it('posts to correct API endpoint', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse({ keyId: 'key-1' }));

    await setupHardwareKey({
      apiUrl: 'https://api.lockbox.dev',
      token: 'token-123',
      userId: 'user-1',
      email: 'test@test.com',
      masterKey: crypto.getRandomValues(new Uint8Array(32)),
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.lockbox.dev/api/auth/hardware-key/setup',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer token-123',
        }),
      })
    );
  });

  it('sends correct body with keyType fido2', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse({ keyId: 'key-1' }));

    await setupHardwareKey({
      apiUrl: 'https://api.lockbox.dev',
      token: 'token',
      userId: 'user-1',
      email: 'test@test.com',
      masterKey: crypto.getRandomValues(new Uint8Array(32)),
    });

    const fetchCall = mockFetch.mock.calls[0];
    const body = JSON.parse(fetchCall[1].body as string);
    expect(body.keyType).toBe('fido2');
    expect(body.publicKey).toBeDefined();
    expect(body.wrappedMasterKey).toBeDefined();
    expect(body.attestation).toBeDefined();
  });

  it('throws on API error', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse({}, 500));

    await expect(
      setupHardwareKey({
        apiUrl: 'https://api.lockbox.dev',
        token: 'token',
        userId: 'user-1',
        email: 'test@test.com',
        masterKey: crypto.getRandomValues(new Uint8Array(32)),
      })
    ).rejects.toThrow('Hardware key setup failed: 500');
  });

  it('throws when FIDO2 not available during setup', async () => {
    mockFido2Plugin.isAvailable.mockResolvedValue({ available: false });

    await expect(
      setupHardwareKey({
        apiUrl: 'https://api.lockbox.dev',
        token: 'token',
        userId: 'user-1',
        email: 'test@test.com',
        masterKey: crypto.getRandomValues(new Uint8Array(32)),
      })
    ).rejects.toThrow('FIDO2 hardware key support is not available');
  });
});

// ─── unlockWithHardwareKey ────────────────────────────────────────────────────

describe('unlockWithHardwareKey', () => {
  beforeEach(resetMocks);

  it('calls challenge + auth + verify', async () => {
    mockFetch
      .mockResolvedValueOnce(
        makeJsonResponse({
          challenge: 'server-challenge',
          keyId: 'key-1',
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        })
      )
      .mockResolvedValueOnce(
        makeJsonResponse({
          token: 'session-token',
          wrappedMasterKey: 'wrapped-key-data',
        })
      );

    const result = await unlockWithHardwareKey({
      apiUrl: 'https://api.lockbox.dev',
      keyId: 'key-1',
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFido2Plugin.authenticate).toHaveBeenCalled();
    expect(result.token).toBe('session-token');
    expect(result.wrappedMasterKey).toBe('wrapped-key-data');
  });

  it('fetches challenge from correct endpoint', async () => {
    mockFetch
      .mockResolvedValueOnce(
        makeJsonResponse({ challenge: 'c', keyId: 'k', expiresAt: new Date().toISOString() })
      )
      .mockResolvedValueOnce(makeJsonResponse({ token: 't', wrappedMasterKey: 'w' }));

    await unlockWithHardwareKey({ apiUrl: 'https://api.lockbox.dev', keyId: 'my-key' });

    expect(mockFetch.mock.calls[0][0]).toContain('/api/auth/hardware-key/challenge');
    expect(mockFetch.mock.calls[0][0]).toContain('keyId=my-key');
  });

  it('posts verification to correct endpoint', async () => {
    mockFetch
      .mockResolvedValueOnce(
        makeJsonResponse({ challenge: 'c', keyId: 'k', expiresAt: new Date().toISOString() })
      )
      .mockResolvedValueOnce(makeJsonResponse({ token: 't', wrappedMasterKey: 'w' }));

    await unlockWithHardwareKey({ apiUrl: 'https://api.lockbox.dev', keyId: 'key-1' });

    expect(mockFetch.mock.calls[1][0]).toBe('https://api.lockbox.dev/api/auth/hardware-key/verify');
  });

  it('throws on challenge fetch failure', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({}, 401));

    await expect(
      unlockWithHardwareKey({ apiUrl: 'https://api.lockbox.dev', keyId: 'key-1' })
    ).rejects.toThrow('Failed to get challenge: 401');
  });

  it('throws on verify failure', async () => {
    mockFetch
      .mockResolvedValueOnce(
        makeJsonResponse({ challenge: 'c', keyId: 'k', expiresAt: new Date().toISOString() })
      )
      .mockResolvedValueOnce(makeJsonResponse({}, 403));

    await expect(
      unlockWithHardwareKey({ apiUrl: 'https://api.lockbox.dev', keyId: 'key-1' })
    ).rejects.toThrow('Hardware key verification failed: 403');
  });

  it('throws when FIDO2 not available during unlock', async () => {
    mockFetch.mockResolvedValueOnce(
      makeJsonResponse({ challenge: 'c', keyId: 'k', expiresAt: new Date().toISOString() })
    );
    mockFido2Plugin.isAvailable.mockResolvedValue({ available: false });

    await expect(
      unlockWithHardwareKey({ apiUrl: 'https://api.lockbox.dev', keyId: 'key-1' })
    ).rejects.toThrow('FIDO2 hardware key support is not available');
  });
});

// ─── listHardwareKeys ─────────────────────────────────────────────────────────

describe('listHardwareKeys', () => {
  beforeEach(() => vi.clearAllMocks());

  it('parses response with multiple keys', async () => {
    const keys: HardwareKeyInfo[] = [
      { id: 'key-1', keyType: 'fido2', createdAt: '2025-01-01T00:00:00Z' },
      { id: 'key-2', keyType: 'yubikey-piv', createdAt: '2025-02-01T00:00:00Z' },
    ];
    mockFetch.mockResolvedValue(makeJsonResponse({ keys }));

    const result = await listHardwareKeys('https://api.lockbox.dev', 'token-123');
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('key-1');
    expect(result[0].keyType).toBe('fido2');
    expect(result[1].id).toBe('key-2');
  });

  it('sends authorization header', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse({ keys: [] }));

    await listHardwareKeys('https://api.lockbox.dev', 'my-token');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.lockbox.dev/api/auth/hardware-key/list',
      expect.objectContaining({
        headers: { Authorization: 'Bearer my-token' },
      })
    );
  });

  it('returns empty array for no keys', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse({ keys: [] }));
    const result = await listHardwareKeys('https://api.lockbox.dev', 'token');
    expect(result).toHaveLength(0);
  });

  it('throws on network failure', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse({}, 500));
    await expect(listHardwareKeys('https://api.lockbox.dev', 'token')).rejects.toThrow(
      'Failed to list hardware keys: 500'
    );
  });

  it('preserves createdAt from response', async () => {
    const keys = [{ id: 'k', keyType: 'fido2', createdAt: '2025-06-15T12:00:00Z' }];
    mockFetch.mockResolvedValue(makeJsonResponse({ keys }));
    const result = await listHardwareKeys('https://api.lockbox.dev', 'token');
    expect(result[0].createdAt).toBe('2025-06-15T12:00:00Z');
  });
});

// ─── removeHardwareKey ────────────────────────────────────────────────────────

describe('removeHardwareKey', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls correct endpoint with DELETE method', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse(null, 204));

    await removeHardwareKey('https://api.lockbox.dev', 'token-123', 'key-to-delete');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.lockbox.dev/api/auth/hardware-key/key-to-delete',
      expect.objectContaining({
        method: 'DELETE',
        headers: { Authorization: 'Bearer token-123' },
      })
    );
  });

  it('resolves on success', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse(null, 204));
    await expect(
      removeHardwareKey('https://api.lockbox.dev', 'token', 'key-1')
    ).resolves.toBeUndefined();
  });

  it('throws on failure', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse({}, 404));
    await expect(
      removeHardwareKey('https://api.lockbox.dev', 'token', 'nonexistent')
    ).rejects.toThrow('Failed to remove hardware key: 404');
  });

  it('URL-encodes keyId', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse(null, 204));
    await removeHardwareKey('https://api.lockbox.dev', 'token', 'key/with+special');
    expect(mockFetch.mock.calls[0][0]).toContain('key%2Fwith%2Bspecial');
  });
});

// ─── Type structures ──────────────────────────────────────────────────────────

describe('Fido2RegistrationResult type', () => {
  it('matches expected shape', () => {
    const result: Fido2RegistrationResult = {
      keyId: 'abc',
      publicKey: 'def',
      attestation: 'ghi',
    };
    expect(result.keyId).toBe('abc');
    expect(result.publicKey).toBe('def');
    expect(result.attestation).toBe('ghi');
  });
});

describe('Fido2AuthenticationResult type', () => {
  it('matches expected shape', () => {
    const result: Fido2AuthenticationResult = {
      signature: 'sig',
      authenticatorData: 'auth-data',
      clientDataJSON: 'client-json',
    };
    expect(result.signature).toBe('sig');
    expect(result.authenticatorData).toBe('auth-data');
    expect(result.clientDataJSON).toBe('client-json');
  });
});

describe('HardwareKeyInfo type', () => {
  it('matches expected shape', () => {
    const info: HardwareKeyInfo = {
      id: 'key-1',
      keyType: 'fido2',
      createdAt: '2025-01-01T00:00:00Z',
    };
    expect(info.id).toBe('key-1');
    expect(info.keyType).toBe('fido2');
    expect(info.createdAt).toBe('2025-01-01T00:00:00Z');
  });
});
