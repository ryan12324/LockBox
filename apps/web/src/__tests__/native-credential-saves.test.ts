import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LoginItem } from '@lockbox/types';
import { syncPendingNativeCredentialSaves } from '../lib/native-credential-save-sync.js';
import { deriveNativeCredentialSaveAuthorization } from '../lib/native-autofill.js';
import { clearServerConnection, setServerConnection } from '../lib/server-connection.js';

afterEach(() => {
  clearServerConnection();
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function installSavedLoginBridge(exported: {
  id: string;
  name: string;
  username: string;
  password: string;
  uri: string;
  createdAt: string;
}) {
  const nativePromise = vi.fn(async (plugin: string, method: string) => {
    if (plugin === 'Autofill' && method === 'getPendingCredentialSaves') {
      return { saves: [{ id: exported.id, createdAt: exported.createdAt }] };
    }
    if (plugin === 'Autofill' && method === 'exportPendingCredentialSave') {
      return exported;
    }
    return {};
  });
  (window as unknown as { Capacitor: unknown }).Capacitor = {
    isNativePlatform: () => true,
    isPluginAvailable: () => true,
    nativePromise,
  };
  return nativePromise;
}

describe('Android saved-login import', () => {
  it('derives a stable account-scoped proof without serializing the vault key', async () => {
    const userKey = new Uint8Array(64).fill(11);
    const first = await deriveNativeCredentialSaveAuthorization(userKey, 'account-1');
    const second = await deriveNativeCredentialSaveAuthorization(userKey, 'account-1');
    const otherAccount = await deriveNativeCredentialSaveAuthorization(userKey, 'account-2');

    expect(first).toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(otherAccount).not.toBe(first);
    expect(first).not.toContain('CwsLCwsL');
  });

  it('encrypts and uploads a new login before acknowledging the native outbox', async () => {
    const exported = {
      id: 'android-save-1',
      name: 'Example',
      username: 'alice@example.com',
      password: 'new-secret-password',
      uri: 'https://example.com',
      createdAt: '2026-08-02T20:00:00.000Z',
    };
    const nativePromise = installSavedLoginBridge(exported);
    setServerConnection({
      webBaseUrl: 'https://vault.example.com',
      apiBaseUrl: 'https://api.example.com',
    });
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ item: { id: exported.id } }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await syncPendingNativeCredentialSaves({
      items: [],
      existingItemIds: [],
      accountId: 'account-1',
      token: 'session-token',
      userKey: new Uint8Array(32).fill(7),
    });

    expect(result).toMatchObject({ syncedCount: 1, remainingCount: 0 });
    expect(result.changedItems[0]).toMatchObject({
      id: exported.id,
      type: 'login',
      username: exported.username,
      password: exported.password,
      uris: [exported.uri],
    });
    const request = fetchMock.mock.calls[0];
    expect(String(request?.[0])).toContain('/api/vault/items');
    const requestBody = JSON.parse(String((request?.[1] as RequestInit).body));
    expect(requestBody).toMatchObject({ id: exported.id, type: 'login' });
    expect(requestBody.encryptedData).not.toContain(exported.password);
    expect(nativePromise).toHaveBeenCalledWith(
      'Autofill',
      'markCredentialSaveSynced',
      expect.objectContaining({ id: exported.id, authorization: expect.any(String) })
    );
  });

  it('updates a matching login instead of creating a duplicate', async () => {
    const exported = {
      id: 'android-save-2',
      name: 'Example',
      username: 'alice@example.com',
      password: 'rotated-password',
      uri: 'https://example.com',
      createdAt: '2026-08-02T20:00:00.000Z',
    };
    const nativePromise = installSavedLoginBridge(exported);
    setServerConnection({
      webBaseUrl: 'https://vault.example.com',
      apiBaseUrl: 'https://api.example.com',
    });
    const existing: LoginItem = {
      id: 'existing-login',
      type: 'login',
      name: 'Example account',
      username: exported.username,
      password: 'old-password',
      uris: ['https://example.com/sign-in'],
      tags: ['work'],
      favorite: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
      revisionDate: '2026-07-01T00:00:00.000Z',
    };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ item: { id: existing.id } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await syncPendingNativeCredentialSaves({
      items: [existing],
      existingItemIds: [existing.id],
      accountId: 'account-1',
      token: 'session-token',
      userKey: new Uint8Array(32).fill(9),
    });

    expect(result.changedItems).toHaveLength(1);
    expect(result.changedItems[0]).toMatchObject({
      id: existing.id,
      password: exported.password,
      tags: existing.tags,
      favorite: true,
    });
    const request = fetchMock.mock.calls[0];
    expect(String(request?.[0])).toContain(`/api/vault/items/${existing.id}`);
    expect((request?.[1] as RequestInit).method).toBe('PUT');
    const requestBody = JSON.parse(String((request?.[1] as RequestInit).body));
    expect(requestBody.expectedRevisionDate).toBe(existing.revisionDate);
    expect(nativePromise).toHaveBeenCalledWith(
      'Autofill',
      'markCredentialSaveSynced',
      expect.objectContaining({ id: exported.id, authorization: expect.any(String) })
    );
  });

  it('keeps a cancelled biometric import pending without contacting the server', async () => {
    const pending = { id: 'android-save-3', createdAt: '2026-08-02T20:00:00.000Z' };
    const nativePromise = vi.fn(async (_plugin: string, method: string) => {
      if (method === 'getPendingCredentialSaves') return { saves: [pending] };
      if (method === 'exportPendingCredentialSave') throw new Error('cancelled');
      return {};
    });
    (window as unknown as { Capacitor: unknown }).Capacitor = {
      isNativePlatform: () => true,
      isPluginAvailable: () => true,
      nativePromise,
    };
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(syncPendingNativeCredentialSaves({
      items: [],
      existingItemIds: [],
      accountId: 'account-1',
      token: 'session-token',
      userKey: new Uint8Array(32).fill(3),
    })).resolves.toEqual({ changedItems: [], syncedCount: 0, remainingCount: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
