import { describe, expect, it } from 'vitest';
import { base32Encode } from '@lockbox/totp';

import {
  decryptStoredTotpSecret,
  encryptTotpSecret,
  TotpSecretUnavailableError,
} from '../services/totp-secret.js';

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

const CURRENT_KEY = toBase64(new Uint8Array(32).fill(41));
const PREVIOUS_KEY = toBase64(new Uint8Array(32).fill(17));
const SECRET = Uint8Array.from({ length: 20 }, (_, index) => index + 1);
const USER_ID = 'user-a';

describe('account TOTP secret encryption', () => {
  it('stores a randomized versioned envelope and decrypts it', async () => {
    const first = await encryptTotpSecret(SECRET, USER_ID, CURRENT_KEY);
    const second = await encryptTotpSecret(SECRET, USER_ID, CURRENT_KEY);

    expect(first).toMatch(/^v1\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/);
    expect(first).not.toBe(second);
    expect(first).not.toContain(base32Encode(SECRET));

    const decrypted = await decryptStoredTotpSecret(first, USER_ID, {
      TOTP_ENCRYPTION_KEY: CURRENT_KEY,
    });
    expect(decrypted.secret).toEqual(SECRET);
    expect(decrypted.migratedEnvelope).toBeUndefined();
  });

  it('binds ciphertext to the owning user', async () => {
    const envelope = await encryptTotpSecret(SECRET, USER_ID, CURRENT_KEY);

    await expect(
      decryptStoredTotpSecret(envelope, 'user-b', {
        TOTP_ENCRYPTION_KEY: CURRENT_KEY,
      }),
    ).rejects.toBeInstanceOf(TotpSecretUnavailableError);
  });

  it('rejects missing, malformed, and incorrect keys', async () => {
    const envelope = await encryptTotpSecret(SECRET, USER_ID, CURRENT_KEY);

    await expect(decryptStoredTotpSecret(envelope, USER_ID, {})).rejects.toBeInstanceOf(
      TotpSecretUnavailableError,
    );
    await expect(
      decryptStoredTotpSecret(envelope, USER_ID, { TOTP_ENCRYPTION_KEY: 'not-a-key' }),
    ).rejects.toBeInstanceOf(TotpSecretUnavailableError);
    await expect(
      decryptStoredTotpSecret(envelope, USER_ID, {
        TOTP_ENCRYPTION_KEY: toBase64(new Uint8Array(32).fill(99)),
      }),
    ).rejects.toBeInstanceOf(TotpSecretUnavailableError);
  });

  it('rewraps envelopes decrypted with the previous rotation key', async () => {
    const oldEnvelope = await encryptTotpSecret(SECRET, USER_ID, PREVIOUS_KEY);
    const decrypted = await decryptStoredTotpSecret(oldEnvelope, USER_ID, {
      TOTP_ENCRYPTION_KEY: CURRENT_KEY,
      TOTP_ENCRYPTION_KEY_PREVIOUS: PREVIOUS_KEY,
    });

    expect(decrypted.secret).toEqual(SECRET);
    expect(decrypted.migratedEnvelope).toMatch(/^v1\./);
    expect(decrypted.migratedEnvelope).not.toBe(oldEnvelope);

    const rotated = await decryptStoredTotpSecret(decrypted.migratedEnvelope!, USER_ID, {
      TOTP_ENCRYPTION_KEY: CURRENT_KEY,
    });
    expect(rotated.secret).toEqual(SECRET);
  });

  it('upgrades an exact legacy Base32 row to an encrypted envelope', async () => {
    const legacy = base32Encode(SECRET);
    const decrypted = await decryptStoredTotpSecret(legacy, USER_ID, {
      TOTP_ENCRYPTION_KEY: CURRENT_KEY,
    });

    expect(decrypted.secret).toEqual(SECRET);
    expect(decrypted.migratedEnvelope).toMatch(/^v1\./);
    expect(decrypted.migratedEnvelope).not.toContain(legacy);
  });

  it('rejects malformed or unknown-version envelopes', async () => {
    await expect(
      decryptStoredTotpSecret('v1.bad.bad', USER_ID, {
        TOTP_ENCRYPTION_KEY: CURRENT_KEY,
      }),
    ).rejects.toBeInstanceOf(TotpSecretUnavailableError);
    await expect(
      decryptStoredTotpSecret('v2.anything', USER_ID, {
        TOTP_ENCRYPTION_KEY: CURRENT_KEY,
      }),
    ).rejects.toBeInstanceOf(TotpSecretUnavailableError);
  });
});
