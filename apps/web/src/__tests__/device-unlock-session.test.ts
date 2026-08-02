import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../lib/api.js';
import {
  validateDeviceUnlockSession,
} from '../lib/device-unlock-session.js';

describe('device unlock session validation', () => {
  afterEach(() => vi.restoreAllMocks());

  it('allows device key release only for a live matching account session', async () => {
    vi.spyOn(api.auth, 'me').mockResolvedValue({
      id: 'account-a',
      email: 'person@example.com',
      kdfConfig: { type: 'pbkdf2', iterations: 600_000 },
      salt: 'AAAAAAAAAAAAAAAAAAAAAA==',
    });

    await expect(validateDeviceUnlockSession('session-token', 'account-a')).resolves.toBeUndefined();
  });

  it('marks a revoked session as requiring full master-password login', async () => {
    vi.spyOn(api.auth, 'me').mockRejectedValue(new ApiError(401, 'Unauthorized'));

    await expect(
      validateDeviceUnlockSession('revoked-token', 'account-a')
    ).rejects.toMatchObject({ revoked: true });
  });

  it('rejects a valid token for a different account scope', async () => {
    vi.spyOn(api.auth, 'me').mockResolvedValue({
      id: 'account-b',
      email: 'other@example.com',
      kdfConfig: { type: 'pbkdf2', iterations: 600_000 },
      salt: 'AAAAAAAAAAAAAAAAAAAAAA==',
    });

    await expect(
      validateDeviceUnlockSession('session-token', 'account-a')
    ).rejects.toMatchObject({ revoked: true });
  });

  it('does not release a device key when revocation cannot be checked', async () => {
    vi.spyOn(api.auth, 'me').mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(
      validateDeviceUnlockSession('session-token', 'account-a')
    ).rejects.toMatchObject({
      revoked: false,
      message: expect.stringContaining('master password'),
    });
  });
});
