import { describe, it, expect } from 'vitest';
import { suggestTags, suggestFolder, detectDuplicates } from '../categorizer.js';
import type { VaultItem, LoginItem, Folder, SecureNoteItem, CardItem } from '@lockbox/types';

function makeLogin(overrides: Partial<LoginItem>): LoginItem {
  return {
    id: crypto.randomUUID(),
    type: 'login',
    name: 'Test',
    username: 'user@test.com',
    password: 'pass123',
    uris: ['https://test.com'],
    tags: [],
    favorite: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    revisionDate: new Date().toISOString(),
    ...overrides,
  };
}

function makeFolder(name: string): Folder {
  return { id: crypto.randomUUID(), name, createdAt: new Date().toISOString() };
}

describe('suggestTags', () => {
  it('suggests banking for chase.com', () => {
    const item = makeLogin({ name: 'Chase', uris: ['https://chase.com'] });
    expect(suggestTags(item)).toContain('banking');
  });
  it('suggests dev for github.com', () => {
    const item = makeLogin({ name: 'GitHub', uris: ['https://github.com'] });
    expect(suggestTags(item)).toContain('dev');
  });
  it('suggests entertainment for netflix.com', () => {
    const item = makeLogin({ name: 'Netflix', uris: ['https://netflix.com'] });
    expect(suggestTags(item)).toContain('entertainment');
  });
  it('suggests social for facebook.com', () => {
    const item = makeLogin({ name: 'Facebook', uris: ['https://facebook.com'] });
    expect(suggestTags(item)).toContain('social');
  });
  it('returns empty for unknown domain', () => {
    const item = makeLogin({ name: 'Random Site', uris: ['https://unknownxyz123.com'] });
    expect(suggestTags(item)).toEqual([]);
  });
  it('uses name keywords as fallback', () => {
    const item = makeLogin({ name: 'My Bank Account', uris: ['https://mylocal.example.com'] });
    expect(suggestTags(item)).toContain('banking');
  });
  it('returns max 3 tags', () => {
    const item = makeLogin({ name: 'Work Bank Email', uris: ['https://gmail.com'] });
    expect(suggestTags(item).length).toBeLessThanOrEqual(3);
  });
  it('handles www prefix', () => {
    const item = makeLogin({ uris: ['https://www.github.com'] });
    expect(suggestTags(item)).toContain('dev');
  });
  it('handles secure notes', () => {
    const note: SecureNoteItem = {
      id: '1',
      type: 'note',
      name: 'Bank Notes',
      content: 'secret',
      tags: [],
      favorite: false,
      createdAt: '',
      updatedAt: '',
      revisionDate: '',
    };
    expect(suggestTags(note)).toContain('banking');
  });
});

describe('suggestFolder', () => {
  it('matches banking item to Finance folder', () => {
    const item = makeLogin({ uris: ['https://chase.com'] });
    const folders = [makeFolder('Finance'), makeFolder('Social')];
    expect(suggestFolder(item, folders)).toBe(folders[0].id);
  });
  it('returns null when no folder matches', () => {
    const item = makeLogin({ name: 'Random', uris: ['https://unknown.com'] });
    const folders = [makeFolder('Finance')];
    expect(suggestFolder(item, folders)).toBeNull();
  });
  it('returns null with empty folders', () => {
    const item = makeLogin({ uris: ['https://github.com'] });
    expect(suggestFolder(item, [])).toBeNull();
  });
});

describe('detectDuplicates', () => {
  it('groups items with same URI domain', () => {
    const a = makeLogin({ uris: ['https://github.com/login'] });
    const b = makeLogin({ uris: ['https://github.com/auth'] });
    const groups = detectDuplicates([a, b]);
    expect(groups.some((g) => g.reason === 'same-uri')).toBe(true);
  });
  it('groups items with same username on different domains', () => {
    const a = makeLogin({ username: 'shared@email.com', uris: ['https://site-a.com'] });
    const b = makeLogin({ username: 'shared@email.com', uris: ['https://site-b.com'] });
    const groups = detectDuplicates([a, b]);
    expect(groups.some((g) => g.reason === 'same-credentials')).toBe(true);
  });
  it('returns empty for unique items', () => {
    const a = makeLogin({ username: 'a@a.com', uris: ['https://a.com'] });
    const b = makeLogin({ username: 'b@b.com', uris: ['https://b.com'] });
    expect(detectDuplicates([a, b])).toEqual([]);
  });
  it('returns empty for empty array', () => {
    expect(detectDuplicates([])).toEqual([]);
  });
  it('handles items without URIs', () => {
    const a = makeLogin({ uris: [] });
    const b = makeLogin({ uris: [] });
    expect(detectDuplicates([a, b])).toEqual([]);
  });
});
