/**
 * Tests for two-factor authentication module — login flow and setup utilities.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isTwoFactorChallenge,
  isValidTotpCode,
  isValidBackupCode,
  createTwoFactorLoginState,
  toggleBackupCodeMode,
  validate2FACode,
  setup2FA,
  verify2FASetup,
  disable2FA,
  executeTwoFactorLogin,
  TwoFactorError,
  type TwoFactorChallenge,
  type TwoFactorLoginState,
  type TwoFactorValidateResponse,
} from '../auth/two-factor';

// ─── Mock fetch ───────────────────────────────────────────────────────────────

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockClear();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetchResponse(data: unknown, ok = true, status = 200): void {
  mockFetch.mockResolvedValueOnce({
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
  });
}

// ─── isTwoFactorChallenge ─────────────────────────────────────────────────────

describe('isTwoFactorChallenge', () => {
  it('returns true for valid challenge', () => {
    const response = { requires2FA: true, tempToken: 'abc-123' };
    expect(isTwoFactorChallenge(response)).toBe(true);
  });

  it('returns false for normal login response', () => {
    const response = { token: 'session-token', user: {} };
    expect(isTwoFactorChallenge(response)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isTwoFactorChallenge(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isTwoFactorChallenge(undefined)).toBe(false);
  });

  it('returns false for non-object', () => {
    expect(isTwoFactorChallenge('string')).toBe(false);
  });

  it('returns false when requires2FA is not true', () => {
    expect(isTwoFactorChallenge({ requires2FA: false, tempToken: 'abc' })).toBe(false);
  });

  it('returns false when tempToken is missing', () => {
    expect(isTwoFactorChallenge({ requires2FA: true })).toBe(false);
  });

  it('returns false when tempToken is not a string', () => {
    expect(isTwoFactorChallenge({ requires2FA: true, tempToken: 123 })).toBe(false);
  });
});

// ─── isValidTotpCode ──────────────────────────────────────────────────────────

describe('isValidTotpCode', () => {
  it('returns true for 6-digit string', () => {
    expect(isValidTotpCode('123456')).toBe(true);
  });

  it('returns true for 000000', () => {
    expect(isValidTotpCode('000000')).toBe(true);
  });

  it('returns false for 5 digits', () => {
    expect(isValidTotpCode('12345')).toBe(false);
  });

  it('returns false for 7 digits', () => {
    expect(isValidTotpCode('1234567')).toBe(false);
  });

  it('returns false for letters', () => {
    expect(isValidTotpCode('abcdef')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isValidTotpCode('')).toBe(false);
  });

  it('returns false for mixed', () => {
    expect(isValidTotpCode('12ab56')).toBe(false);
  });
});

// ─── isValidBackupCode ────────────────────────────────────────────────────────

describe('isValidBackupCode', () => {
  it('returns true for 8-char alphanumeric code', () => {
    expect(isValidBackupCode('abcd1234')).toBe(true);
  });

  it('returns true for exactly 6 chars', () => {
    expect(isValidBackupCode('abc123')).toBe(true);
  });

  it('returns false for 5 chars', () => {
    expect(isValidBackupCode('abc12')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isValidBackupCode('')).toBe(false);
  });

  it('returns false for whitespace only', () => {
    expect(isValidBackupCode('     ')).toBe(false);
  });

  it('trims whitespace before checking length', () => {
    expect(isValidBackupCode('  ab  ')).toBe(false);
    expect(isValidBackupCode(' abcdef ')).toBe(true);
  });
});

// ─── createTwoFactorLoginState ────────────────────────────────────────────────

describe('createTwoFactorLoginState', () => {
  it('creates code_entry state with tempToken', () => {
    const state = createTwoFactorLoginState('temp-token-123');
    expect(state.step).toBe('code_entry');
    if (state.step === 'code_entry') {
      expect(state.tempToken).toBe('temp-token-123');
      expect(state.useBackupCode).toBe(false);
    }
  });
});

// ─── toggleBackupCodeMode ─────────────────────────────────────────────────────

describe('toggleBackupCodeMode', () => {
  it('toggles from TOTP to backup code mode', () => {
    const state: TwoFactorLoginState = {
      step: 'code_entry',
      tempToken: 'token',
      useBackupCode: false,
    };
    const result = toggleBackupCodeMode(state);
    expect(result.step).toBe('code_entry');
    if (result.step === 'code_entry') {
      expect(result.useBackupCode).toBe(true);
    }
  });

  it('toggles from backup code to TOTP mode', () => {
    const state: TwoFactorLoginState = {
      step: 'code_entry',
      tempToken: 'token',
      useBackupCode: true,
    };
    const result = toggleBackupCodeMode(state);
    if (result.step === 'code_entry') {
      expect(result.useBackupCode).toBe(false);
    }
  });

  it('recovers from error state', () => {
    const state: TwoFactorLoginState = {
      step: 'error',
      tempToken: 'token',
      error: 'Invalid code',
      useBackupCode: false,
    };
    const result = toggleBackupCodeMode(state);
    expect(result.step).toBe('code_entry');
    if (result.step === 'code_entry') {
      expect(result.useBackupCode).toBe(true);
    }
  });

  it('returns unchanged state for validating step', () => {
    const state: TwoFactorLoginState = { step: 'validating', tempToken: 'token' };
    const result = toggleBackupCodeMode(state);
    expect(result).toBe(state);
  });

  it('returns unchanged state for idle step', () => {
    const state: TwoFactorLoginState = { step: 'idle' };
    const result = toggleBackupCodeMode(state);
    expect(result).toBe(state);
  });
});

// ─── validate2FACode ──────────────────────────────────────────────────────────

describe('validate2FACode', () => {
  it('sends tempToken and code to validation endpoint', async () => {
    const responseData = {
      token: 'session-token',
      user: {
        id: 'u1',
        email: 'test@test.com',
        encryptedUserKey: 'key',
        kdfConfig: {},
        salt: 'salt',
      },
    };
    mockFetchResponse(responseData);

    const result = await validate2FACode('temp-token', '123456', 'https://api.test.com');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.test.com/api/auth/2fa/validate');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ tempToken: 'temp-token', code: '123456' });
    expect(result.token).toBe('session-token');
  });

  it('throws TwoFactorError on failure', async () => {
    mockFetchResponse({ error: 'Invalid code' }, false, 401);

    await expect(validate2FACode('temp', '000000', 'https://api.test.com')).rejects.toThrow(
      TwoFactorError
    );
  });

  it('includes error message from API', async () => {
    mockFetchResponse({ error: 'Code expired' }, false, 400);

    try {
      await validate2FACode('temp', '000000', 'https://api.test.com');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(TwoFactorError);
      expect((err as TwoFactorError).message).toBe('Code expired');
      expect((err as TwoFactorError).status).toBe(400);
    }
  });
});

// ─── setup2FA ─────────────────────────────────────────────────────────────────

describe('setup2FA', () => {
  it('sends authenticated request to setup endpoint', async () => {
    const responseData = {
      secret: 'JBSWY3DPEHPK3PXP',
      otpauthUri: 'otpauth://totp/Lockbox?secret=...',
    };
    mockFetchResponse(responseData);

    const result = await setup2FA('auth-token', 'https://api.test.com');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.test.com/api/auth/2fa/setup');
    expect(options.method).toBe('POST');
    expect(options.headers['Authorization']).toBe('Bearer auth-token');
    expect(result.otpauthUri).toContain('otpauth://');
  });

  it('throws on error', async () => {
    mockFetchResponse({ error: 'Unauthorized' }, false, 401);
    await expect(setup2FA('bad-token', 'https://api.test.com')).rejects.toThrow(TwoFactorError);
  });
});

// ─── verify2FASetup ───────────────────────────────────────────────────────────

describe('verify2FASetup', () => {
  it('sends code to verification endpoint', async () => {
    const responseData = { enabled: true, backupCodes: ['code1', 'code2', 'code3'] };
    mockFetchResponse(responseData);

    const result = await verify2FASetup('123456', 'auth-token', 'https://api.test.com');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.test.com/api/auth/2fa/verify');
    expect(JSON.parse(options.body)).toEqual({ code: '123456' });
    expect(result.enabled).toBe(true);
    expect(result.backupCodes).toHaveLength(3);
  });

  it('throws on invalid code', async () => {
    mockFetchResponse({ error: 'Invalid verification code' }, false, 400);
    await expect(verify2FASetup('000000', 'token', 'https://api.test.com')).rejects.toThrow(
      TwoFactorError
    );
  });
});

// ─── disable2FA ───────────────────────────────────────────────────────────────

describe('disable2FA', () => {
  it('sends authenticated request to disable endpoint', async () => {
    const responseData = { disabled: true };
    mockFetchResponse(responseData);

    const result = await disable2FA('auth-token', 'https://api.test.com');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.test.com/api/auth/2fa/disable');
    expect(options.method).toBe('POST');
    expect(result.disabled).toBe(true);
  });
});

// ─── executeTwoFactorLogin ────────────────────────────────────────────────────

describe('executeTwoFactorLogin', () => {
  it('calls onSuccess on successful validation', async () => {
    const responseData: TwoFactorValidateResponse = {
      token: 'session-token',
      user: {
        id: 'u1',
        email: 'test@test.com',
        encryptedUserKey: 'key',
        kdfConfig: { algorithm: 'argon2id', iterations: 3, memory: 65536, parallelism: 4 },
        salt: 'salt123',
      },
    };
    mockFetchResponse(responseData);

    const onSuccess = vi.fn();
    const onError = vi.fn();

    await executeTwoFactorLogin('temp-token', '123456', onSuccess, onError, 'https://api.test.com');

    expect(onSuccess).toHaveBeenCalledOnce();
    expect(onSuccess).toHaveBeenCalledWith(responseData);
    expect(onError).not.toHaveBeenCalled();
  });

  it('calls onError on TwoFactorError', async () => {
    mockFetchResponse({ error: 'Invalid code' }, false, 401);

    const onSuccess = vi.fn();
    const onError = vi.fn();

    await executeTwoFactorLogin('temp-token', '000000', onSuccess, onError, 'https://api.test.com');

    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith('Invalid code');
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('calls onError with generic message on unexpected error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network failure'));

    const onSuccess = vi.fn();
    const onError = vi.fn();

    await executeTwoFactorLogin('temp-token', '123456', onSuccess, onError, 'https://api.test.com');

    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith('An unexpected error occurred during 2FA validation');
    expect(onSuccess).not.toHaveBeenCalled();
  });
});

// ─── TwoFactorError ───────────────────────────────────────────────────────────

describe('TwoFactorError', () => {
  it('has correct name and status', () => {
    const err = new TwoFactorError(401, 'Unauthorized');
    expect(err.name).toBe('TwoFactorError');
    expect(err.status).toBe(401);
    expect(err.message).toBe('Unauthorized');
  });

  it('is an instance of Error', () => {
    const err = new TwoFactorError(500, 'Server error');
    expect(err).toBeInstanceOf(Error);
  });
});
