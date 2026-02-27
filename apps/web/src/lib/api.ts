/**
 * API client — thin fetch wrapper with auth header injection.
 */

const API_BASE = import.meta.env.VITE_API_URL ?? '';

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
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...fetchOptions, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(res.status, (data as { error?: string }).error ?? res.statusText);
  }

  return data as T;
}

export const api = {
  auth: {
    register: (body: object, token?: string) =>
      request('/api/auth/register', { method: 'POST', body: JSON.stringify(body), token }),
    login: (body: object) =>
      request('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
    kdfParams: (email: string) =>
      request(`/api/auth/kdf-params?email=${encodeURIComponent(email)}`),
    logout: (token: string) =>
      request('/api/auth/logout', { method: 'POST', token }),
    me: (token: string) => request('/api/auth/me', { token }),
    changePassword: (body: object, token: string) =>
      request('/api/auth/change-password', { method: 'POST', body: JSON.stringify(body), token }),
  },
  vault: {
    list: (token: string, params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return request<{ items: unknown[]; folders: Array<{ id: string; name: string; parentId?: string; createdAt: string }> }>(`/api/vault${qs}`, { token });
    },
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
      request('/api/vault/folders', { method: 'POST', body: JSON.stringify(body), token }),
    updateFolder: (id: string, body: object, token: string) =>
      request(`/api/vault/folders/${id}`, { method: 'PUT', body: JSON.stringify(body), token }),
    deleteFolder: (id: string, token: string) =>
      request(`/api/vault/folders/${id}`, { method: 'DELETE', token }),
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
      request<{ success: boolean }>('/api/auth/keypair', { method: 'POST', body: JSON.stringify(body), token }),
    get: (token: string) =>
      request<{ publicKey: string; encryptedPrivateKey: string; createdAt: string }>('/api/auth/keypair', { token }),
    getPublicKey: (userId: string, token: string) =>
      request<{ userId: string; publicKey: string }>(`/api/auth/keypair/public/${userId}`, { token }),
  },

  // ─── Teams ───────────────────────────────────────────────
  teams: {
    create: (body: { name: string }, token: string) =>
      request<{ team: { id: string; name: string; createdAt: string }; membership: { teamId: string; userId: string; email: string; role: string; createdAt: string } }>('/api/teams', { method: 'POST', body: JSON.stringify(body), token }),
    list: (token: string) =>
      request<{ teams: Array<{ id: string; name: string; createdBy: string; createdAt: string; role: string }> }>('/api/teams', { token }),
    get: (teamId: string, token: string) =>
      request<{ team: { id: string; name: string; createdAt: string }; members: Array<{ teamId: string; userId: string; email: string; role: string; customPermissions?: unknown; createdAt: string }> }>(`/api/teams/${teamId}`, { token }),
    update: (teamId: string, body: { name: string }, token: string) =>
      request<{ team: { id: string; name: string; createdAt: string } }>(`/api/teams/${teamId}`, { method: 'PUT', body: JSON.stringify(body), token }),
    delete: (teamId: string, token: string) =>
      request<{ success: boolean }>(`/api/teams/${teamId}`, { method: 'DELETE', token }),
    invite: (teamId: string, body: { email: string; role: string; customPermissions?: unknown }, token: string) =>
      request<{ invite: { id: string; teamId: string; email: string; role: string; expiresAt: string; createdAt: string; token: string } }>(`/api/teams/${teamId}/invite`, { method: 'POST', body: JSON.stringify(body), token }),
    acceptInvite: (body: { token: string }, authToken: string) =>
      request<{ team: { id: string; name: string; createdAt: string }; role: string }>('/api/teams/accept-invite', { method: 'POST', body: JSON.stringify(body), token: authToken }),
    removeMember: (teamId: string, memberId: string, token: string) =>
      request<{ success: boolean }>(`/api/teams/${teamId}/members/${memberId}`, { method: 'DELETE', token }),
    updateMemberRole: (teamId: string, memberId: string, body: { role: string; customPermissions?: unknown }, token: string) =>
      request<{ success: boolean; role: string }>(`/api/teams/${teamId}/members/${memberId}/role`, { method: 'PUT', body: JSON.stringify(body), token }),
    listInvites: (teamId: string, token: string) =>
      request<{ invites: Array<{ id: string; teamId: string; email: string; token: string; role: string; expiresAt: string; createdAt: string; createdBy: string }> }>(`/api/teams/${teamId}/invites`, { token }),
    cancelInvite: (teamId: string, inviteId: string, token: string) =>
      request<{ success: boolean }>(`/api/teams/${teamId}/invites/${inviteId}`, { method: 'DELETE', token }),
  },

  // ─── Sharing ─────────────────────────────────────────────
  sharing: {
    shareFolder: (folderId: string, body: { teamId: string; permissionLevel: string; memberKeys: Array<{ userId: string; encryptedFolderKey: string }> }, token: string) =>
      request<{ success: boolean; folderId: string; teamId: string }>(`/api/sharing/folders/${folderId}/share`, { method: 'POST', body: JSON.stringify(body), token }),
    unshareFolder: (folderId: string, token: string) =>
      request<{ success: boolean }>(`/api/sharing/folders/${folderId}/unshare`, { method: 'DELETE', token }),
    getFolderKeys: (folderId: string, token: string) =>
      request<{ keys: Array<{ folderId: string; userId: string; encryptedFolderKey: string; grantedBy: string; grantedAt: string }> }>(`/api/sharing/folders/${folderId}/keys`, { token }),
    addFolderKey: (folderId: string, body: { targetUserId: string; encryptedFolderKey: string }, token: string) =>
      request<{ success: boolean }>(`/api/sharing/folders/${folderId}/keys`, { method: 'POST', body: JSON.stringify(body), token }),
    removeFolderKey: (folderId: string, targetUserId: string, token: string) =>
      request<{ success: boolean }>(`/api/sharing/folders/${folderId}/keys/${targetUserId}`, { method: 'DELETE', token }),
    listSharedFolders: (token: string) =>
      request<{ sharedFolders: Array<{ folderId: string; teamId: string; ownerUserId: string; permissionLevel: string; createdAt: string; folderName: string }> }>('/api/sharing/folders', { token }),
    listSharedFolderItems: (folderId: string, token: string) =>
      request<{ items: Array<{ id: string; userId: string; type: string; encryptedData: string; folderId: string; tags: string | null; favorite: number; revisionDate: string; createdAt: string; deletedAt: string | null }> }>(`/api/sharing/folders/${folderId}/items`, { token }),
  },

  // ─── Share Links ─────────────────────────────────────────
  shareLinks: {
    create: (body: { id: string; encryptedItem: string; tokenHash: string; expiresInSeconds: number; maxViews: number; itemName: string }, token: string) =>
      request<{ id: string; expiresAt: string; maxViews: number }>('/api/share-links', { method: 'POST', body: JSON.stringify(body), token }),
    redeem: (shareId: string, bearerToken: string) =>
      request<{ encryptedItem: string; viewCount: number; maxViews: number }>(`/api/share-links/${shareId}/redeem`, { token: bearerToken }),
    list: (token: string) =>
      request<{ shareLinks: Array<{ id: string; itemName: string; expiresAt: string; maxViews: number; viewCount: number; createdAt: string; isExpired: boolean; isExhausted: boolean }> }>('/api/share-links', { token }),
    delete: (shareId: string, token: string) =>
      request<{ success: boolean }>(`/api/share-links/${shareId}`, { method: 'DELETE', token }),
  },
};
