import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LoginItem, PasskeyItem, VaultItem } from '@lockbox/types';
import {
  getNativeAutofillStatus,
  getNativePasskeyStatus,
  openNativeBiometricEnrollment,
  openNativePasskeySettings,
  syncNativeAutofillIndex,
} from '../lib/native-autofill.js';
import { syncPendingNativePasskeys } from '../lib/native-passkey-sync.js';
import { clearServerConnection, setServerConnection } from '../lib/server-connection.js';

afterEach(() => {
  clearServerConnection();
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function installNativeBridge() {
  const nativePromise = vi.fn(async (plugin: string, method: string) => {
    if (plugin === 'Autofill' && method === 'isEnabled') {
      return {
        supported: true,
        enabled: true,
        biometricsReady: true,
        indexedCredentials: 4,
        indexedAt: 1_775_257_600_000,
        lastRequestAt: 1_775_257_660_000,
        lastMatchCount: 2,
      };
    }
    if (plugin === 'CredentialManager' && method === 'isProviderEnabled') {
      return { available: true, enabled: true };
    }
    return { indexed: 1 };
  });
  (window as unknown as { Capacitor: unknown }).Capacitor = {
    isNativePlatform: () => true,
    isPluginAvailable: () => true,
    nativePromise,
  };
  return nativePromise;
}

describe('Android passkey bridge', () => {
  it('reports system selection and encrypted index health', async () => {
    installNativeBridge();
    await expect(getNativeAutofillStatus()).resolves.toEqual({
      supported: true,
      enabled: true,
      biometricsReady: true,
      indexedCredentials: 4,
      indexedAt: 1_775_257_600_000,
      lastRequestAt: 1_775_257_660_000,
      lastMatchCount: 2,
      lastError: undefined,
    });
  });

  it('indexes canonical and HTTPS-shaped Android application URIs for native autofill', async () => {
    const nativePromise = installNativeBridge();
    const login: LoginItem = {
      id: 'octopus-login',
      type: 'login',
      name: 'Octopus Energy',
      username: 'ryan@example.test',
      password: 'encrypted-before-persistence',
      uris: [
        'androidapp://android.octopusenergy.octopus.energy',
        'https://android.octopusenergy.octopus.energy/',
      ],
      tags: [],
      favorite: false,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      revisionDate: '2026-08-01T00:00:00.000Z',
    };

    const updated = vi.fn();
    window.addEventListener('authwell:native-autofill-updated', updated, { once: true });
    await expect(syncNativeAutofillIndex(
      [login],
      'lockbox-user-1',
      new Uint8Array(32).fill(1)
    )).resolves.toEqual({
      passwords: 1,
      passkeys: 1,
    });

    expect(nativePromise).toHaveBeenCalledWith(
      'Autofill',
      'replaceCredentialIndex',
      expect.objectContaining({
        accountId: 'lockbox-user-1',
        saveAuthorization: expect.any(String),
        credentials: [expect.objectContaining({ id: login.id, uris: login.uris })],
      }),
    );
    expect(updated).toHaveBeenCalledOnce();
  });

  it('serializes password and passkey refreshes that share the Android Keystore key', async () => {
    let passwordRefreshFinished = false;
    const nativePromise = vi.fn(async (_plugin: string, method: string) => {
      if (method === 'replaceCredentialIndex') {
        await Promise.resolve();
        passwordRefreshFinished = true;
        return { indexed: 1 };
      }
      if (method === 'replacePasskeyIndex') {
        expect(passwordRefreshFinished).toBe(true);
        return { indexed: 0 };
      }
      return {};
    });
    (window as unknown as { Capacitor: unknown }).Capacitor = {
      isNativePlatform: () => true,
      isPluginAvailable: () => true,
      nativePromise,
    };

    await expect(syncNativeAutofillIndex(
      [],
      'lockbox-user-1',
      new Uint8Array(32).fill(2)
    )).resolves.toEqual({
      passwords: 1,
      passkeys: 0,
    });
  });

  it('protects and indexes decrypted vault passkeys through the native plugin', async () => {
    const nativePromise = installNativeBridge();
    const passkey: PasskeyItem = {
      id: 'vault-passkey-1',
      type: 'passkey',
      name: 'Example passkey',
      rpId: 'example.com',
      rpName: 'Example',
      userId: 'dXNlci0x',
      userName: 'alice@example.com',
      credentialId: 'Y3JlZGVudGlhbC0xMjM0NTY',
      publicKey: 'cHVibGljLWtleQ',
      privateKey: 'cHJpdmF0ZS1rZXktcGtjczg',
      counter: 0,
      transports: ['internal'],
      tags: ['passkey'],
      favorite: false,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      revisionDate: '2026-08-01T00:00:00.000Z',
    };

    await syncNativeAutofillIndex(
      [passkey] as VaultItem[],
      'lockbox-user-1',
      new Uint8Array(32).fill(3)
    );

    expect(nativePromise).toHaveBeenCalledWith(
      'Autofill',
      'replacePasskeyIndex',
      expect.objectContaining({
        passkeys: [
          expect.objectContaining({
            credentialId: passkey.credentialId,
            id: passkey.id,
            rpId: 'example.com',
            publicKey: passkey.publicKey,
            privateKey: passkey.privateKey,
          }),
        ],
      })
    );
    expect(nativePromise).toHaveBeenCalledWith(
      'Autofill',
      'replacePasskeyIndex',
      expect.objectContaining({ accountId: 'lockbox-user-1' })
    );
  });

  it('reports provider state and opens Android Credential Manager settings', async () => {
    const nativePromise = installNativeBridge();
    await expect(getNativePasskeyStatus()).resolves.toEqual({ supported: true, enabled: true });
    await openNativePasskeySettings();
    expect(nativePromise).toHaveBeenCalledWith(
      'CredentialManager',
      'requestEnableProvider',
      {}
    );
  });

  it('opens Android biometric enrollment when the encrypted index requires it', async () => {
    const nativePromise = installNativeBridge();
    await openNativeBiometricEnrollment();
    expect(nativePromise).toHaveBeenCalledWith(
      'Autofill',
      'requestBiometricEnrollment',
      {}
    );
  });

  it('biometrically exports and uploads an Android-created passkey', async () => {
    const exported = {
      credentialId: 'Y3JlZGVudGlhbC0xMjM0NTY',
      vaultItemId: 'android-passkey-item-1',
      rpId: 'example.com',
      rpName: 'Example',
      userId: 'dXNlci0x',
      userName: 'alice@example.com',
      userDisplayName: 'Alice',
      publicKey: 'cHVibGljLWtleQ',
      privateKey: 'cHJpdmF0ZS1rZXktcGtjczg',
      createdAt: '2026-08-01T00:00:00.000Z',
    };
    const nativePromise = vi.fn(async (plugin: string, method: string) => {
      if (plugin === 'CredentialManager' && method === 'getPendingPasskeys') {
        return { passkeys: [exported] };
      }
      if (plugin === 'CredentialManager' && method === 'exportPendingPasskey') {
        return exported;
      }
      return {};
    });
    (window as unknown as { Capacitor: unknown }).Capacitor = {
      isNativePlatform: () => true,
      isPluginAvailable: () => true,
      nativePromise,
    };
    setServerConnection({
      webBaseUrl: 'https://vault.example.com',
      apiBaseUrl: 'https://api.example.com',
    });
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ item: { id: exported.vaultItemId } }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await syncPendingNativePasskeys({
      items: [],
      existingItemIds: [],
      token: 'session-token',
      userKey: new Uint8Array(32).fill(7),
    });

    expect(result).toMatchObject({ syncedCount: 1, remainingCount: 0 });
    expect(result.addedItems[0]).toMatchObject({
      id: exported.vaultItemId,
      credentialId: exported.credentialId,
      privateKey: exported.privateKey,
    });
    const requestBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(requestBody).toMatchObject({ id: exported.vaultItemId, type: 'passkey' });
    expect(requestBody.encryptedData).not.toContain(exported.privateKey);
    expect(nativePromise).toHaveBeenCalledWith(
      'CredentialManager',
      'markPasskeySynced',
      { credentialId: exported.credentialId, vaultItemId: exported.vaultItemId }
    );
  });

  it('leaves a cancelled biometric export in the durable outbox', async () => {
    const nativePromise = vi.fn(async (_plugin: string, method: string) => {
      if (method === 'getPendingPasskeys') {
        return {
          passkeys: [{
            credentialId: 'Y3JlZGVudGlhbC0xMjM0NTY',
            vaultItemId: 'android-passkey-item-1',
            rpId: 'example.com',
            userName: 'alice@example.com',
          }],
        };
      }
      if (method === 'exportPendingPasskey') throw new Error('Passkey sync was cancelled');
      return {};
    });
    (window as unknown as { Capacitor: unknown }).Capacitor = {
      isNativePlatform: () => true,
      isPluginAvailable: () => true,
      nativePromise,
    };
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await syncPendingNativePasskeys({
      items: [],
      existingItemIds: [],
      token: 'session-token',
      userKey: new Uint8Array(32).fill(7),
    });

    expect(result).toEqual({ addedItems: [], syncedCount: 0, remainingCount: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('acknowledges an already uploaded stable item without another biometric prompt', async () => {
    const pending = {
      credentialId: 'Y3JlZGVudGlhbC0xMjM0NTY',
      vaultItemId: 'android-passkey-item-1',
      rpId: 'example.com',
      userName: 'alice@example.com',
    };
    const nativePromise = vi.fn(async (_plugin: string, method: string) => {
      if (method === 'getPendingPasskeys') return { passkeys: [pending] };
      return {};
    });
    (window as unknown as { Capacitor: unknown }).Capacitor = {
      isNativePlatform: () => true,
      isPluginAvailable: () => true,
      nativePromise,
    };
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await syncPendingNativePasskeys({
      items: [],
      existingItemIds: [pending.vaultItemId],
      token: 'session-token',
      userKey: new Uint8Array(32).fill(7),
    });

    expect(result).toEqual({ addedItems: [], syncedCount: 1, remainingCount: 0 });
    expect(nativePromise).not.toHaveBeenCalledWith(
      'CredentialManager',
      'exportPendingPasskey',
      expect.anything()
    );
    expect(nativePromise).toHaveBeenCalledWith(
      'CredentialManager',
      'markPasskeySynced',
      { credentialId: pending.credentialId, vaultItemId: pending.vaultItemId }
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
