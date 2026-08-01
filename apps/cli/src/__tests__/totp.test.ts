import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedLoginResponse, LoginResponse } from '@lockbox/types';
import { completeTwoFactorLogin } from '../commands/login.js';
import { generateItemTotp } from '../commands/totp.js';

const authenticated: AuthenticatedLoginResponse = {
  token: 'session',
  user: {
    id: 'user',
    email: 'user@example.com',
    kdfConfig: { type: 'argon2id', iterations: 3, memory: 65_536, parallelism: 4 },
    salt: 'salt',
    encryptedUserKey: 'key',
  },
};

describe('CLI TOTP support', () => {
  it('generates codes from raw imported Base32 keys', async () => {
    const result = await generateItemTotp(
      {
        type: 'login',
        name: 'Example',
        totp: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
      },
      59_000,
    );
    expect(result.code).toBe('287082');
    expect(result.remaining).toBe(1);
  });

  it('honors otpauth URI options', async () => {
    const result = await generateItemTotp(
      {
        type: 'login',
        totp: 'otpauth://totp/Example:user?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&digits=8&period=30&algorithm=SHA1',
      },
      59_000,
    );
    expect(result.code).toBe('94287082');
    expect(result.digits).toBe(8);
  });

  it('completes an account 2FA challenge before returning a session', async () => {
    const challenge: LoginResponse = { requires2FA: true, tempToken: 'temporary' };
    const validateTwoFactor = vi.fn().mockResolvedValue(authenticated);
    const result = await completeTwoFactorLogin(
      challenge,
      { auth: { validateTwoFactor } } as never,
      async () => '123456',
    );
    expect(validateTwoFactor).toHaveBeenCalledWith('temporary', '123456');
    expect(result).toBe(authenticated);
  });
});
