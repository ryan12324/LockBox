/**
 * API client for the extension.
 * Uses the stored API base URL and session token.
 */

import { getApiBaseUrl } from './storage.js';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, ...fetchOptions } = options;
  const apiBase = await getApiBaseUrl();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${apiBase}${path}`, { ...fetchOptions, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(res.status, (data as { error?: string }).error ?? res.statusText);
  }

  return data as T;
}

export const api = {
  auth: {
    kdfParams: (email: string) =>
      request(`/api/auth/kdf-params?email=${encodeURIComponent(email)}`),
    login: (body: object) =>
      request('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
    logout: (token: string) =>
      request('/api/auth/logout', { method: 'POST', token }),
    me: (token: string) => request('/api/auth/me', { token }),
  },
  vault: {
    list: (token: string) => request('/api/vault', { token }),
  },
  sync: {
    pull: (token: string, since?: string) => {
      const qs = since ? `?since=${encodeURIComponent(since)}` : '';
      return request(`/api/sync${qs}`, { token });
    },
  },
};
