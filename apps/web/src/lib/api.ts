/**
 * API client — thin fetch wrapper with auth header injection.
 */

import type { Attachment, EncryptedVaultItem, Folder, KdfConfig } from '@lockbox/types';
import { getApiUrl } from './server-connection.js';

export interface KdfParamsResponse {
  kdfConfig: KdfConfig;
  salt: string;
}

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
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token, ...fetchOptions } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(getApiUrl(path), { ...fetchOptions, headers });
  if (res.status === 204) return {} as T;

  const contentType = res.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) {
    if (!res.ok) throw new ApiError(res.status, res.statusText || 'Request failed');
    throw new ApiError(
      502,
      'The configured server did not return an Authwell API response. Reconnect your web vault.'
    );
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new ApiError(
      502,
      'The Authwell API returned malformed JSON. Try again or reconnect the web vault.'
    );
  }

  if (!res.ok) {
    throw new ApiError(res.status, (data as { error?: string }).error ?? res.statusText);
  }

  return data as T;
}

function decodedBase64Length(value: unknown): number | null {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 256 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  ) {
    return null;
  }
  try {
    return atob(value).length;
  } catch {
    return null;
  }
}

function isValidKdfConfig(value: unknown): value is KdfConfig {
  if (!value || typeof value !== 'object') return false;
  const config = value as Record<string, unknown>;
  if (!Number.isInteger(config.iterations)) return false;

  if (config.type === 'argon2id') {
    return (
      (config.iterations as number) >= 1 &&
      (config.iterations as number) <= 10 &&
      Number.isInteger(config.memory) &&
      (config.memory as number) >= 8_192 &&
      (config.memory as number) <= 1_048_576 &&
      Number.isInteger(config.parallelism) &&
      (config.parallelism as number) >= 1 &&
      (config.parallelism as number) <= 16
    );
  }

  return (
    config.type === 'pbkdf2' &&
    (config.iterations as number) >= 100_000 &&
    (config.iterations as number) <= 5_000_000
  );
}

/** Validate server-controlled KDF values before any value reaches a crypto decoder. */
export function validateKdfParams(value: unknown): KdfParamsResponse {
  if (!value || typeof value !== 'object') {
    throw new ApiError(502, 'The Authwell API returned invalid login parameters.');
  }
  const response = value as Record<string, unknown>;
  if (decodedBase64Length(response.salt) !== 16 || !isValidKdfConfig(response.kdfConfig)) {
    throw new ApiError(
      502,
      'The Authwell API returned invalid login parameters. Reconnect the web vault or update the server.'
    );
  }
  return response as unknown as KdfParamsResponse;
}

export const api = {
  auth: {
    registrationStatus: () =>
      request<{ enabled: boolean }>('/api/auth/registration-status'),
    register: (body: object, token?: string) =>
      request('/api/auth/register', { method: 'POST', body: JSON.stringify(body), token }),
    login: (body: object) =>
      request('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
    kdfParams: (email: string) =>
      request<unknown>(`/api/auth/kdf-params?email=${encodeURIComponent(email)}`).then(
        validateKdfParams
      ),
    logout: (token: string) => request('/api/auth/logout', { method: 'POST', token }),
    me: (token: string) =>
      request<{ id: string; email: string; kdfConfig: KdfConfig; salt: string }>(
        '/api/auth/me',
        { token }
      ),
    changePassword: (body: object, token: string) =>
      request('/api/auth/change-password', { method: 'POST', body: JSON.stringify(body), token }),
  },
  twoFactor: {
    status: (token: string) => request<{ enabled: boolean }>('/api/auth/2fa/status', { token }),
    setup: (token: string) =>
      request<{ secret: string; otpauthUri: string }>('/api/auth/2fa/setup', {
        method: 'POST',
        token,
      }),
    verify: (code: string, token: string) =>
      request<{ enabled: true; backupCodes: string[] }>('/api/auth/2fa/verify', {
        method: 'POST',
        body: JSON.stringify({ code }),
        token,
      }),
    validate: (tempToken: string, code: string) =>
      request<{
        token: string;
        user: {
          id: string;
          email: string;
          kdfConfig: import('@lockbox/types').KdfConfig;
          salt: string;
          encryptedUserKey: string;
        };
      }>('/api/auth/2fa/validate', {
        method: 'POST',
        body: JSON.stringify({ tempToken, code }),
      }),
    disable: (code: string, token: string) =>
      request<{ disabled: true }>('/api/auth/2fa/disable', {
        method: 'POST',
        body: JSON.stringify({ code }),
        token,
      }),
  },
  vault: {
    list: (token: string, params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return request<{ items: EncryptedVaultItem[]; folders: Folder[] }>(`/api/vault${qs}`, {
        token,
      });
    },
    getItem: (id: string, token: string) =>
      request<{ item: EncryptedVaultItem }>(`/api/vault/items/${id}`, { token }),
    createItem: (body: object, token: string) =>
      request('/api/vault/items', { method: 'POST', body: JSON.stringify(body), token }),
    updateItem: (id: string, body: object, token: string) =>
      request(`/api/vault/items/${id}`, { method: 'PUT', body: JSON.stringify(body), token }),
    deleteItem: (id: string, token: string) =>
      request(`/api/vault/items/${id}`, { method: 'DELETE', token }),
    restoreItem: (id: string, token: string) =>
      request(`/api/vault/items/${id}/restore`, { method: 'POST', token }),
    permanentDelete: (id: string, token: string) =>
      request(`/api/vault/items/${id}/permanent`, { method: 'DELETE', token }),
    createFolder: (body: object, token: string) =>
      request<{ folder: Folder }>('/api/vault/folders', {
        method: 'POST',
        body: JSON.stringify(body),
        token,
      }),
    updateFolder: (id: string, body: object, token: string) =>
      request(`/api/vault/folders/${id}`, { method: 'PUT', body: JSON.stringify(body), token }),
    deleteFolder: (id: string, token: string) =>
      request(`/api/vault/folders/${id}`, { method: 'DELETE', token }),
    setFolderTravel: (id: string, travelSafe: boolean, token: string) =>
      request(`/api/vault/folders/${id}/travel`, {
        method: 'PUT',
        body: JSON.stringify({ travelSafe }),
        token,
      }),
  },
  attachments: {
    list: (itemId: string, token: string) =>
      request<{
        attachments: Attachment[];
        quota: { used: number; limit: number };
      }>(`/api/vault/items/${itemId}/attachments`, { token }),
  },
  settings: {
    getTravelMode: (token: string) =>
      request<{ enabled: boolean }>('/api/settings/travel-mode', { token }),
    setTravelMode: (enabled: boolean, token: string) =>
      request<{ success: boolean }>('/api/settings/travel-mode', {
        method: 'PUT',
        body: JSON.stringify({ enabled }),
        token,
      }),
  },
  sync: {
    pull: (token: string, since?: string) => {
      const qs = since ? `?since=${encodeURIComponent(since)}` : '';
      return request(`/api/sync${qs}`, { token });
    },
    push: (body: object, token: string) =>
      request('/api/sync/push', { method: 'POST', body: JSON.stringify(body), token }),
  },

  // ─── Key Pairs ───────────────────────────────────────────
  keypair: {
    create: (body: { publicKey: string; encryptedPrivateKey: string }, token: string) =>
      request<{ success: boolean }>('/api/auth/keypair', {
        method: 'POST',
        body: JSON.stringify(body),
        token,
      }),
    get: (token: string) =>
      request<{ publicKey: string; encryptedPrivateKey: string; createdAt: string }>(
        '/api/auth/keypair',
        { token }
      ),
    getPublicKey: (userId: string, token: string) =>
      request<{ userId: string; publicKey: string }>(`/api/auth/keypair/public/${userId}`, {
        token,
      }),
  },

  // ─── Teams ───────────────────────────────────────────────
  teams: {
    create: (body: { name: string }, token: string) =>
      request<{
        team: { id: string; name: string; createdAt: string };
        membership: {
          teamId: string;
          userId: string;
          email: string;
          role: string;
          createdAt: string;
        };
      }>('/api/teams', { method: 'POST', body: JSON.stringify(body), token }),
    list: (token: string) =>
      request<{
        teams: Array<{
          id: string;
          name: string;
          createdBy: string;
          createdAt: string;
          role: string;
        }>;
      }>('/api/teams', { token }),
    get: (teamId: string, token: string) =>
      request<{
        team: { id: string; name: string; createdAt: string };
        members: Array<{
          teamId: string;
          userId: string;
          email: string;
          role: string;
          customPermissions?: unknown;
          createdAt: string;
        }>;
      }>(`/api/teams/${teamId}`, { token }),
    update: (teamId: string, body: { name: string }, token: string) =>
      request<{ team: { id: string; name: string; createdAt: string } }>(`/api/teams/${teamId}`, {
        method: 'PUT',
        body: JSON.stringify(body),
        token,
      }),
    delete: (teamId: string, token: string) =>
      request<{ success: boolean }>(`/api/teams/${teamId}`, { method: 'DELETE', token }),
    invite: (
      teamId: string,
      body: { email: string; role: string; customPermissions?: unknown },
      token: string
    ) =>
      request<{
        invite: {
          id: string;
          teamId: string;
          email: string;
          role: string;
          expiresAt: string;
          createdAt: string;
          token: string;
        };
      }>(`/api/teams/${teamId}/invite`, { method: 'POST', body: JSON.stringify(body), token }),
    acceptInvite: (body: { token: string }, authToken: string) =>
      request<{ team: { id: string; name: string; createdAt: string }; role: string }>(
        '/api/teams/accept-invite',
        { method: 'POST', body: JSON.stringify(body), token: authToken }
      ),
    removeMember: (teamId: string, memberId: string, token: string) =>
      request<{ success: boolean }>(`/api/teams/${teamId}/members/${memberId}`, {
        method: 'DELETE',
        token,
      }),
    updateMemberRole: (
      teamId: string,
      memberId: string,
      body: { role: string; customPermissions?: unknown },
      token: string
    ) =>
      request<{ success: boolean; role: string }>(`/api/teams/${teamId}/members/${memberId}/role`, {
        method: 'PUT',
        body: JSON.stringify(body),
        token,
      }),
    listInvites: (teamId: string, token: string) =>
      request<{
        invites: Array<{
          id: string;
          teamId: string;
          email: string;
          token: string;
          role: string;
          expiresAt: string;
          createdAt: string;
          createdBy: string;
        }>;
      }>(`/api/teams/${teamId}/invites`, { token }),
    cancelInvite: (teamId: string, inviteId: string, token: string) =>
      request<{ success: boolean }>(`/api/teams/${teamId}/invites/${inviteId}`, {
        method: 'DELETE',
        token,
      }),
  },

  // ─── Sharing ─────────────────────────────────────────────
  sharing: {
    shareFolder: (
      folderId: string,
      body: {
        teamId: string;
        permissionLevel: string;
        memberKeys: Array<{ userId: string; encryptedFolderKey: string }>;
      },
      token: string
    ) =>
      request<{ success: boolean; folderId: string; teamId: string }>(
        `/api/sharing/folders/${folderId}/share`,
        { method: 'POST', body: JSON.stringify(body), token }
      ),
    unshareFolder: (folderId: string, teamId: string, token: string) =>
      request<{ success: boolean }>(
        `/api/sharing/folders/${folderId}/unshare?teamId=${encodeURIComponent(teamId)}`,
        { method: 'DELETE', token }
      ),
    getFolderKeys: (folderId: string, token: string) =>
      request<{
        key: {
          folderId: string;
          userId: string;
          encryptedFolderKey: string;
          grantedBy: string;
          grantedAt: string;
        };
      }>(`/api/sharing/folders/${folderId}/keys`, { token }),
    addFolderKey: (
      folderId: string,
      body: { targetUserId: string; encryptedFolderKey: string },
      token: string
    ) =>
      request<{ success: boolean }>(`/api/sharing/folders/${folderId}/keys`, {
        method: 'POST',
        body: JSON.stringify(body),
        token,
      }),
    removeFolderKey: (folderId: string, targetUserId: string, token: string) =>
      request<{ success: boolean }>(`/api/sharing/folders/${folderId}/keys/${targetUserId}`, {
        method: 'DELETE',
        token,
      }),
    listSharedFolders: (token: string) =>
      request<{
        sharedFolders: Array<{
          folderId: string;
          teamId: string;
          ownerUserId: string;
          permissionLevel: string;
          createdAt: string;
          folderName: string;
        }>;
      }>('/api/sharing/folders', { token }),
    listSharedFolderItems: (folderId: string, token: string) =>
      request<{ items: EncryptedVaultItem[] }>(`/api/sharing/folders/${folderId}/items`, { token }),
  },

  // ─── Share Links ─────────────────────────────────────────
  shareLinks: {
    create: (
      body: {
        id: string;
        encryptedItem: string;
        tokenHash: string;
        expiresAt: string;
        maxViews: number;
        itemName: string;
      },
      token: string
    ) =>
      request<{ id: string; expiresAt: string; maxViews: number }>('/api/share-links', {
        method: 'POST',
        body: JSON.stringify(body),
        token,
      }),
    redeem: (shareId: string, bearerToken: string) =>
      request<{ encryptedItem: string; viewCount: number; maxViews: number }>(
        `/api/share-links/${shareId}/redeem`,
        { token: bearerToken }
      ),
    list: (token: string) =>
      request<{
        shareLinks: Array<{
          id: string;
          itemName: string;
          expiresAt: string;
          maxViews: number;
          viewCount: number;
          createdAt: string;
          isExpired: boolean;
          isExhausted: boolean;
        }>;
      }>('/api/share-links', { token }),
    delete: (shareId: string, token: string) =>
      request<{ success: boolean }>(`/api/share-links/${shareId}`, { method: 'DELETE', token }),
  },

  // ─── Email Aliases ───────────────────────────────────────────
  aliases: {
    getConfig: (token: string) =>
      request<{ provider: string; encryptedApiKey: string; baseUrl: string | null }>(
        '/api/settings/alias',
        { token }
      ),
    saveConfig: (
      body: { provider: string; encryptedApiKey: string; baseUrl?: string },
      token: string
    ) =>
      request<{ success: boolean }>('/api/settings/alias', {
        method: 'PUT',
        body: JSON.stringify(body),
        token,
      }),
    deleteConfig: (token: string) =>
      request<{ success: boolean }>('/api/settings/alias', { method: 'DELETE', token }),
    generate: (body: { provider: string; apiKey: string; baseUrl?: string }, token: string) =>
      request<{ alias: { email: string } }>('/api/aliases/generate', {
        method: 'POST',
        body: JSON.stringify(body),
        token,
      }),
    list: (provider: string, apiKey: string, token: string, baseUrl?: string) => {
      const headers: Record<string, string> = {
        'X-Alias-Provider': provider,
        'X-Alias-ApiKey': apiKey,
      };
      if (baseUrl) headers['X-Alias-BaseUrl'] = baseUrl;
      return request<{ aliases: Array<{ email: string; enabled: boolean; id: string }> }>(
        '/api/aliases',
        { token, headers }
      );
    },
  },
  // ─── Documents ────────────────────────────────────────────
  documents: {
    upload: async (itemId: string, file: Blob, plaintextSize: number, token: string) => {
      const body = new FormData();
      body.append('file', file, 'document.lockbox');
      body.append('plaintextSize', String(plaintextSize));
      const res = await fetch(getApiUrl(`/api/vault/items/${itemId}/document`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        size?: number;
        error?: string;
      };
      if (!res.ok) throw new ApiError(res.status, data.error ?? res.statusText);
      return data as { success: boolean; size: number };
    },
    download: async (itemId: string, token: string) => {
      const res = await fetch(getApiUrl(`/api/vault/items/${itemId}/document`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new ApiError(res.status, data.error ?? res.statusText);
      }
      return res.arrayBuffer();
    },
    delete: (itemId: string, token: string) =>
      request<{ success: boolean }>(`/api/vault/items/${itemId}/document`, {
        method: 'DELETE',
        token,
      }),
    quota: (token: string) =>
      request<{ used: number; limit: number }>('/api/vault/documents/quota', { token }),
  },
};
