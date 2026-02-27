/**
 * Tests for Credential Manager plugin bridge and utilities.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock @capacitor/core ─────────────────────────────────────────────────────

const mockPlugin = vi.hoisted(() => ({
  _pluginName: 'CredentialManager',
  isAvailable: vi.fn().mockResolvedValue({ available: true }),
  createPasskey: vi.fn().mockResolvedValue({
    credentialId: 'Y3JlZC0xMjM',
    publicKey: 'cHVibGljLWtleQ',
    attestationObject: 'YXR0ZXN0YXRpb24',
    clientDataJSON: 'Y2xpZW50LWRhdGE',
  }),
  authenticate: vi.fn().mockResolvedValue({
    credentialId: 'Y3JlZC0xMjM',
    authenticatorData: 'YXV0aC1kYXRh',
    signature: 'c2lnbmF0dXJl',
    clientDataJSON: 'Y2xpZW50LWRhdGE',
  }),
  getStoredPasskeys: vi.fn().mockResolvedValue({
    passkeys: [
      { credentialId: 'cred-1', rpId: 'example.com', userName: 'user@example.com' },
      { credentialId: 'cred-2', rpId: 'other.com', userName: 'user@other.com' },
    ],
  }),
  deletePasskey: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@capacitor/core', () => ({
  registerPlugin: vi.fn(() => mockPlugin),
}));

import {
  isCredentialManagerAvailable,
  createPasskey,
  authenticateWithPasskey,
  getStoredPasskeys,
  deletePasskey,
  base64urlToUint8Array,
  uint8ArrayToBase64url,
  isAndroid14OrHigher,
  formatCredentialId,
  getPasskeyDisplayName,
  type PasskeyCreationOptions,
  type PasskeyAuthenticationOptions,
} from '../plugins/credential-manager';

// ─── base64url encode/decode ──────────────────────────────────────────────────

describe('base64urlToUint8Array', () => {
  it('decodes a simple base64url string', () => {
    // "hello" in base64url is "aGVsbG8"
    const result = base64urlToUint8Array('aGVsbG8');
    expect(result).toBeInstanceOf(Uint8Array);
    const text = new TextDecoder().decode(result);
    expect(text).toBe('hello');
  });

  it('handles base64url characters (- and _)', () => {
    // base64url uses - instead of + and _ instead of /
    const bytes = new Uint8Array([251, 239]); // produces +/ in standard base64
    const encoded = uint8ArrayToBase64url(bytes);
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    const decoded = base64urlToUint8Array(encoded);
    expect(decoded).toEqual(bytes);
  });

  it('handles strings needing padding', () => {
    // "a" is "YQ" in base64url (needs == padding)
    const result = base64urlToUint8Array('YQ');
    expect(new TextDecoder().decode(result)).toBe('a');
  });

  it('handles empty string', () => {
    const result = base64urlToUint8Array('');
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(0);
  });
});

describe('uint8ArrayToBase64url', () => {
  it('encodes bytes to base64url without padding', () => {
    const bytes = new TextEncoder().encode('hello');
    const result = uint8ArrayToBase64url(bytes);
    expect(result).toBe('aGVsbG8');
    expect(result).not.toContain('=');
  });

  it('round-trips with base64urlToUint8Array', () => {
    const original = new Uint8Array([0, 1, 127, 128, 255]);
    const encoded = uint8ArrayToBase64url(original);
    const decoded = base64urlToUint8Array(encoded);
    expect(decoded).toEqual(original);
  });

  it('encodes empty array', () => {
    const result = uint8ArrayToBase64url(new Uint8Array(0));
    expect(result).toBe('');
  });

  it('produces URL-safe characters only', () => {
    // Generate bytes that would produce + and / in standard base64
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i;
    const result = uint8ArrayToBase64url(bytes);
    expect(result).not.toContain('+');
    expect(result).not.toContain('/');
    expect(result).not.toContain('=');
  });
});

// ─── isAndroid14OrHigher ──────────────────────────────────────────────────────

describe('isAndroid14OrHigher', () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  it('returns false when navigator is undefined', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    expect(isAndroid14OrHigher()).toBe(false);
  });

  it('returns false for non-Android user agent', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' },
      writable: true,
      configurable: true,
    });
    expect(isAndroid14OrHigher()).toBe(false);
  });

  it('returns true for Android 14', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)' },
      writable: true,
      configurable: true,
    });
    expect(isAndroid14OrHigher()).toBe(true);
  });

  it('returns true for Android 15', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9)' },
      writable: true,
      configurable: true,
    });
    expect(isAndroid14OrHigher()).toBe(true);
  });

  it('returns false for Android 13', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7)' },
      writable: true,
      configurable: true,
    });
    expect(isAndroid14OrHigher()).toBe(false);
  });
});

// ─── formatCredentialId ───────────────────────────────────────────────────────

describe('formatCredentialId', () => {
  it('returns short IDs unchanged', () => {
    expect(formatCredentialId('abcd1234')).toBe('abcd1234');
  });

  it('returns IDs at 16 chars unchanged', () => {
    expect(formatCredentialId('1234567890123456')).toBe('1234567890123456');
  });

  it('truncates long IDs with ellipsis', () => {
    const longId = 'abcdefghijklmnopqrstuvwxyz123456';
    const result = formatCredentialId(longId);
    expect(result.length).toBeLessThan(longId.length);
    expect(result).toContain('…');
    expect(result.startsWith('abcdefgh')).toBe(true);
    expect(result.endsWith('3456')).toBe(true);
  });

  it('preserves first 8 and last 4 characters', () => {
    const id = 'AABBCCDDEE112233445566';
    const result = formatCredentialId(id);
    expect(result).toBe('AABBCCDD…5566');
  });
});

// ─── getPasskeyDisplayName ────────────────────────────────────────────────────

describe('getPasskeyDisplayName', () => {
  it('formats rpName and userName', () => {
    expect(getPasskeyDisplayName('Example', 'user@example.com')).toBe('Example (user@example.com)');
  });

  it('handles empty rpName', () => {
    expect(getPasskeyDisplayName('', 'user')).toBe(' (user)');
  });

  it('handles empty userName', () => {
    expect(getPasskeyDisplayName('Site', '')).toBe('Site ()');
  });
});

// ─── isCredentialManagerAvailable ─────────────────────────────────────────────

describe('isCredentialManagerAvailable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when available', async () => {
    mockPlugin.isAvailable.mockResolvedValueOnce({ available: true });
    const result = await isCredentialManagerAvailable();
    expect(result).toBe(true);
  });

  it('returns false when unavailable', async () => {
    mockPlugin.isAvailable.mockResolvedValueOnce({ available: false });
    const result = await isCredentialManagerAvailable();
    expect(result).toBe(false);
  });

  it('returns false on error', async () => {
    mockPlugin.isAvailable.mockRejectedValueOnce(new Error('Not supported'));
    const result = await isCredentialManagerAvailable();
    expect(result).toBe(false);
  });
});

// ─── createPasskey ────────────────────────────────────────────────────────────

describe('createPasskey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPlugin.isAvailable.mockResolvedValue({ available: true });
  });

  it('creates passkey with default options', async () => {
    const options: PasskeyCreationOptions = {
      rpId: 'example.com',
      rpName: 'Example',
      userName: 'user@example.com',
      userDisplayName: 'User',
      userId: 'dXNlci0x',
      challenge: 'Y2hhbGxlbmdl',
    };
    const result = await createPasskey(options);
    expect(result.credentialId).toBeDefined();
    expect(result.publicKey).toBeDefined();
    expect(mockPlugin.createPasskey).toHaveBeenCalledWith(
      expect.objectContaining({
        rpId: 'example.com',
        algorithms: [-7],
        timeout: 60000,
        attestation: 'none',
      })
    );
  });

  it('throws when Credential Manager is unavailable', async () => {
    mockPlugin.isAvailable.mockResolvedValueOnce({ available: false });
    await expect(
      createPasskey({
        rpId: 'example.com',
        rpName: 'Example',
        userName: 'user',
        userDisplayName: 'User',
        userId: 'dXNlci0x',
        challenge: 'Y2hhbGxlbmdl',
      })
    ).rejects.toThrow('not available');
  });
});

// ─── authenticateWithPasskey ──────────────────────────────────────────────────

describe('authenticateWithPasskey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPlugin.isAvailable.mockResolvedValue({ available: true });
  });

  it('authenticates with default options', async () => {
    const options: PasskeyAuthenticationOptions = {
      rpId: 'example.com',
      challenge: 'Y2hhbGxlbmdl',
    };
    const result = await authenticateWithPasskey(options);
    expect(result.credentialId).toBeDefined();
    expect(result.authenticatorData).toBeDefined();
    expect(result.signature).toBeDefined();
    expect(mockPlugin.authenticate).toHaveBeenCalledWith(
      expect.objectContaining({
        rpId: 'example.com',
        timeout: 60000,
        userVerification: 'preferred',
      })
    );
  });

  it('throws when Credential Manager is unavailable', async () => {
    mockPlugin.isAvailable.mockResolvedValueOnce({ available: false });
    await expect(
      authenticateWithPasskey({
        rpId: 'example.com',
        challenge: 'Y2hhbGxlbmdl',
      })
    ).rejects.toThrow('not available');
  });
});

// ─── getStoredPasskeys ────────────────────────────────────────────────────────

describe('getStoredPasskeys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns all passkeys when no rpId filter', async () => {
    const result = await getStoredPasskeys();
    expect(result).toHaveLength(2);
    expect(result[0].credentialId).toBe('cred-1');
  });

  it('passes rpId filter to native plugin', async () => {
    await getStoredPasskeys('example.com');
    expect(mockPlugin.getStoredPasskeys).toHaveBeenCalledWith({ rpId: 'example.com' });
  });

  it('returns empty array on error', async () => {
    mockPlugin.getStoredPasskeys.mockRejectedValueOnce(new Error('Failed'));
    const result = await getStoredPasskeys();
    expect(result).toEqual([]);
  });
});

// ─── deletePasskey ────────────────────────────────────────────────────────────

describe('deletePasskey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls native plugin with credential ID', async () => {
    await deletePasskey('cred-1');
    expect(mockPlugin.deletePasskey).toHaveBeenCalledWith({ credentialId: 'cred-1' });
  });
});
