/**
 * API client for Lockbox CLI.
 * Ported from apps/web/src/lib/api.ts, adapted for Node fetch.
 */

import type {
  KdfConfig,
  LoginResponse,
  SyncResponse,
  EncryptedVaultItem,
  Folder,
} from '@lockbox/types';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  apiUrl: string,
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token, ...fetchOptions } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${apiUrl}${path}`, { ...fetchOptions, headers });
  const data: unknown = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(res.status, (data as { error?: string }).error ?? res.statusText);
  }

  return data as T;
}

export function createApi(apiUrl: string) {
  return {
    auth: {
      login: (body: { email: string; authHash: string }) =>
        request<LoginResponse>(apiUrl, '/api/auth/login', {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      kdfParams: (email: string) =>
        request<{ kdfConfig: KdfConfig; salt: string }>(
          apiUrl,
          `/api/auth/kdf-params?email=${encodeURIComponent(email)}`
        ),
      logout: (token: string) =>
        request<{ success: boolean }>(apiUrl, '/api/auth/logout', {
          method: 'POST',
          token,
        }),
      me: (token: string) =>
        request<{ id: string; email: string }>(apiUrl, '/api/auth/me', {
          token,
        }),
    },
    vault: {
      list: (token: string, params?: Record<string, string>) => {
        const qs = params ? '?' + new URLSearchParams(params).toString() : '';
        return request<{
          items: EncryptedVaultItem[];
          folders: Folder[];
        }>(apiUrl, `/api/vault${qs}`, { token });
      },
      getItem: (id: string, token: string) =>
        request<EncryptedVaultItem>(apiUrl, `/api/vault/items/${id}`, {
          token,
        }),
      createItem: (body: object, token: string) =>
        request<{ id: string }>(apiUrl, '/api/vault/items', {
          method: 'POST',
          body: JSON.stringify(body),
          token,
        }),
      deleteItem: (id: string, token: string) =>
        request<{ success: boolean }>(apiUrl, `/api/vault/items/${id}`, {
          method: 'DELETE',
          token,
        }),
    },
    sync: {
      pull: (token: string, since?: string) => {
        const qs = since ? `?since=${encodeURIComponent(since)}` : '';
        return request<SyncResponse>(apiUrl, `/api/sync${qs}`, { token });
      },
    },
  };
}

export type LockboxApi = ReturnType<typeof createApi>;
