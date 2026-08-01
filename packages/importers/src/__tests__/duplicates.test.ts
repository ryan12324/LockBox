import { describe, expect, it } from 'vitest';
import type { LoginItem, SecureNoteItem, VaultItem } from '@lockbox/types';
import { findImportDuplicates, vaultItemFingerprint } from '../duplicates.js';
import type { ImportRecord } from '../types.js';

function login(id: string, name: string, username: string, uri: string): LoginItem {
  return {
    id,
    type: 'login',
    name,
    username,
    password: 'not-used-for-duplicate-matching',
    uris: [uri],
    tags: [],
    favorite: false,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    revisionDate: '2026-08-01T00:00:00.000Z',
  };
}

function record(sourceId: string, item: VaultItem): ImportRecord {
  return { sourceId, sourceRow: 2, item, folderPath: [], issues: [], importable: true };
}

describe('import duplicate analysis', () => {
  it('normalises case, Unicode, URL roots, and fragments without comparing passwords', () => {
    const existing = login('existing', 'GitHub', 'Ryan@Example.com', 'https://github.com/');
    const imported = login(
      'incoming',
      'ＧｉｔＨｕｂ',
      'ryan@example.com',
      'https://GITHUB.com/#settings',
    );

    expect(vaultItemFingerprint(imported)).toBe(vaultItemFingerprint(existing));
    imported.password = 'different-password';
    expect(vaultItemFingerprint(imported)).toBe(vaultItemFingerprint(existing));
  });

  it('reports duplicates against the vault and earlier rows in the same file', () => {
    const first = login('one', 'Example', 'user', 'https://example.com');
    const same = login('two', 'example', 'USER', 'https://example.com/');
    const existing = login('vault-one', 'GitHub', 'ryan', 'https://github.com');
    const incomingExisting = login('three', 'github', 'Ryan', 'https://github.com/');

    expect(
      findImportDuplicates(
        [record('source-one', first), record('source-two', same), record('source-three', incomingExisting)],
        [existing],
      ),
    ).toEqual([
      { sourceId: 'source-two', duplicateSourceId: 'source-one', existingItemId: undefined },
      { sourceId: 'source-three', existingItemId: 'vault-one', duplicateSourceId: undefined },
    ]);
  });

  it('does not auto-skip secure notes that merely share a name', () => {
    const note = (id: string, content: string): SecureNoteItem => ({
      id,
      type: 'note',
      name: 'Recovery',
      content,
      tags: [],
      favorite: false,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      revisionDate: '2026-08-01T00:00:00.000Z',
    });

    expect(
      findImportDuplicates([record('incoming-note', note('incoming', 'new content'))], [
        note('existing', 'different content'),
      ]),
    ).toEqual([]);
  });
});
