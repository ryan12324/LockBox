import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toBase64 } from '@lockbox/crypto';
import {
  clearWebPrfUnlock,
  enrollWebPrfUnlock,
  getWebPrfUnlockStatus,
  unlockWithWebPrf,
} from '../lib/web-prf-unlock.js';

const STORAGE_KEY = 'authwell-web-prf-unlock-v1';
const SCOPE = 'https://vault.example#account-a';
const CREDENTIAL_ID = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
const PRF_RESULT = new Uint8Array(32).fill(29);

function publicKeyCredential(options: {
  enabled?: boolean;
  prfResult?: Uint8Array;
} = {}): PublicKeyCredential {
  return {
    type: 'public-key',
    rawId: CREDENTIAL_ID.slice().buffer,
    getClientExtensionResults: () => ({
      prf: {
        enabled: options.enabled,
        results: options.prfResult ? { first: options.prfResult.slice().buffer } : undefined,
      },
    }),
  } as unknown as PublicKeyCredential;
}

function installWebAuthn(options: {
  createCredential?: PublicKeyCredential;
  getCredential?: PublicKeyCredential;
  getError?: Error;
} = {}) {
  const create = vi.fn(async (_request?: CredentialCreationOptions) => options.createCredential ?? publicKeyCredential({
    enabled: true,
    prfResult: PRF_RESULT,
  }));
  const get = vi.fn(async (_request?: CredentialRequestOptions) => {
    if (options.getError) throw options.getError;
    return options.getCredential ?? publicKeyCredential({ prfResult: PRF_RESULT });
  });

  Object.defineProperty(globalThis, 'isSecureContext', {
    value: true,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'PublicKeyCredential', {
    value: function PublicKeyCredential() {},
    configurable: true,
  });
  Object.defineProperty(navigator, 'credentials', {
    value: { create, get },
    configurable: true,
  });
  return { create, get };
}

describe('desktop WebAuthn PRF vault unlock', () => {
  beforeEach(() => {
    localStorage.clear();
    Reflect.deleteProperty(globalThis, 'Capacitor');
    installWebAuthn();
  });

  it('stores only a PRF-wrapped vault key and unwraps it with the same credential', async () => {
    const userKey = new Uint8Array(64).fill(41);

    await enrollWebPrfUnlock(userKey, SCOPE, 'person@example.com');

    const serialized = localStorage.getItem(STORAGE_KEY);
    expect(serialized).not.toBeNull();
    expect(serialized).not.toContain(toBase64(userKey));
    expect(serialized).not.toContain('master password');
    await expect(unlockWithWebPrf(SCOPE)).resolves.toEqual(userKey);
  });

  it('binds the local wrapper to one server and account scope', async () => {
    await enrollWebPrfUnlock(new Uint8Array(64).fill(7), SCOPE, 'person@example.com');

    expect(getWebPrfUnlockStatus(SCOPE)).toMatchObject({
      supported: true,
      enrolled: true,
      replacementRequired: false,
    });
    expect(getWebPrfUnlockStatus('https://vault.example#account-b')).toMatchObject({
      enrolled: false,
      replacementRequired: true,
    });
    await expect(unlockWithWebPrf('https://vault.example#account-b')).resolves.toBeNull();
  });

  it('requires an assertion after registration when PRF evaluation is deferred', async () => {
    const { get } = installWebAuthn({
      createCredential: publicKeyCredential({ enabled: true }),
    });

    await enrollWebPrfUnlock(new Uint8Array(64).fill(9), SCOPE, 'person@example.com');

    expect(get).toHaveBeenCalledOnce();
    const request = get.mock.calls[0]?.[0];
    if (!request) throw new Error('WebAuthn assertion options were not provided');
    expect(request.publicKey?.extensions?.prf?.evalByCredential).toBeDefined();
  });

  it('does not persist a wrapper when the new credential has no PRF capability', async () => {
    installWebAuthn({
      createCredential: publicKeyCredential({ enabled: false }),
    });

    await expect(
      enrollWebPrfUnlock(new Uint8Array(64).fill(13), SCOPE, 'person@example.com')
    ).rejects.toMatchObject({ reason: 'prf-unavailable' });
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('stays locked when the passkey was cancelled or removed', async () => {
    await enrollWebPrfUnlock(new Uint8Array(64).fill(17), SCOPE, 'person@example.com');
    installWebAuthn({ getError: new DOMException('No credential', 'NotAllowedError') });

    await expect(unlockWithWebPrf(SCOPE)).rejects.toMatchObject({
      reason: 'cancelled-or-missing',
    });
  });

  it('stays locked when an assertion no longer returns PRF output', async () => {
    await enrollWebPrfUnlock(new Uint8Array(64).fill(19), SCOPE, 'person@example.com');
    installWebAuthn({ getCredential: publicKeyCredential() });

    await expect(unlockWithWebPrf(SCOPE)).rejects.toMatchObject({
      reason: 'prf-unavailable',
    });
  });

  it('deletes a tampered local envelope and requires password re-enrollment', async () => {
    await enrollWebPrfUnlock(new Uint8Array(64).fill(21), SCOPE, 'person@example.com');
    const serialized = localStorage.getItem(STORAGE_KEY);
    if (!serialized) throw new Error('PRF envelope was not stored');
    const record = JSON.parse(serialized) as Record<string, unknown>;
    record.wrappedVaultKey = `${String(record.wrappedVaultKey)}tampered`;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));

    await expect(unlockWithWebPrf(SCOPE)).rejects.toMatchObject({
      reason: 'corrupt-envelope',
    });
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('removes the wrapped key when device unlock is disabled', async () => {
    await enrollWebPrfUnlock(new Uint8Array(64).fill(23), SCOPE, 'person@example.com');

    clearWebPrfUnlock();

    expect(getWebPrfUnlockStatus(SCOPE).enrolled).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
