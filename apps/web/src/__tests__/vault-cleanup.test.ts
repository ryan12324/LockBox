import { describe, expect, it } from 'vitest';
import type { LoginItem } from '@lockbox/types';
import {
  buildMergedLogin,
  findCleanupCandidates,
  findDuplicateLoginGroups,
  getLocalFolderSuggestion,
  normalizeLoginLocation,
} from '../lib/vault-cleanup.js';

function login(overrides: Partial<LoginItem> = {}): LoginItem {
  const now = '2026-08-01T12:00:00.000Z';
  return {
    id: crypto.randomUUID(),
    type: 'login',
    name: 'Example',
    username: 'ryan@example.com',
    password: 'correct horse battery staple',
    uris: ['https://www.example.com/login'],
    tags: [],
    favorite: false,
    createdAt: now,
    updatedAt: now,
    revisionDate: now,
    ...overrides,
  };
}

describe('vault cleanup analysis', () => {
  it('finds missing login details without flagging complete logins', () => {
    const incomplete = login({ id: 'incomplete', username: '', password: '', uris: [] });
    const candidates = findCleanupCandidates([incomplete, login({ id: 'complete' })]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].issues.map((issue) => issue.field)).toEqual([
      'username',
      'password',
      'destination',
    ]);
  });

  it('normalizes website and Android destinations locally', () => {
    expect(normalizeLoginLocation('https://www.Example.com/sign-in')).toBe('example.com');
    expect(normalizeLoginLocation('androidapp://COM.EXAMPLE.APP/')).toBe(
      'androidapp://com.example.app'
    );
  });

  it('groups matching accounts while leaving separate usernames alone', () => {
    const first = login({ id: 'one' });
    const duplicate = login({ id: 'two', name: 'Example login', uris: ['example.com'] });
    const separateAccount = login({ id: 'three', username: 'other@example.com', password: 'other' });

    const groups = findDuplicateLoginGroups([first, duplicate, separateAccount]);

    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((item) => item.id).sort()).toEqual(['one', 'two']);
    expect(groups[0].reasons).toContain('same website or app');
    expect(groups[0].reasons).toContain('same username');
  });

  it('merges reviewed fields and unions non-conflicting data', () => {
    const first = login({
      id: 'keep',
      password: 'new-password',
      uris: ['https://example.com'],
      tags: ['Work'],
    });
    const second = login({
      id: 'remove',
      username: 'preferred@example.com',
      password: 'old-password',
      uris: ['https://accounts.example.com'],
      tags: ['Important'],
      favorite: true,
    });

    const merged = buildMergedLogin(
      [first, second],
      first.id,
      { username: second.id, password: first.id },
      '2026-08-01T13:00:00.000Z'
    );

    expect(merged.id).toBe('keep');
    expect(merged.username).toBe('preferred@example.com');
    expect(merged.password).toBe('new-password');
    expect(merged.uris).toEqual(['https://example.com', 'https://accounts.example.com']);
    expect(merged.tags).toEqual(['Work', 'Important']);
    expect(merged.favorite).toBe(true);
  });

  it('offers deterministic local folder suggestions without a network model', () => {
    expect(getLocalFolderSuggestion(login({ name: 'GitHub', uris: ['github.com'] }))).toEqual({
      folderName: 'Work',
      reason: 'work-related service',
    });
    expect(getLocalFolderSuggestion(login({ name: 'GitHub', folderId: 'existing' }))).toBeNull();
  });
});
