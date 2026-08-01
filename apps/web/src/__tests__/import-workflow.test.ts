import { describe, expect, it, vi } from 'vitest';
import type { Folder, LoginItem, SecureNoteItem } from '@lockbox/types';
import type { ImportRecord } from '@lockbox/importers';
import { runEncryptedImport } from '../lib/import-workflow.js';

function record(
  sourceId: string,
  name: string,
  folderPath: string[] = [],
  sourceRow = 2,
): ImportRecord {
  const item: LoginItem = {
    id: `item-${sourceId}`,
    type: 'login',
    name,
    username: `${name.toLowerCase()}@example.com`,
    password: `secret-${name}`,
    uris: [`https://${name.toLowerCase()}.example.com`],
    tags: [],
    favorite: false,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    revisionDate: '2026-08-01T00:00:00.000Z',
  };
  return { sourceId, sourceRow, item, folderPath, issues: [], importable: true };
}

function noteRecord(sourceId: string, name: string): ImportRecord {
  const item: SecureNoteItem = {
    id: `item-${sourceId}`,
    type: 'note',
    name,
    content: 'Recovered note body',
    tags: [],
    favorite: false,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    revisionDate: '2026-08-01T00:00:00.000Z',
  };
  return { sourceId, sourceRow: 2, item, folderPath: [], issues: [], importable: true };
}

describe('runEncryptedImport', () => {
  it('creates nested folders once, encrypts client-side, and sends only ciphertext plus metadata', async () => {
    const createdBodies: Array<Record<string, unknown>> = [];
    const folderBodies: Array<{ name: string; parentId: string | null }> = [];
    const encryptItem = vi.fn(async (item: LoginItem) => `ciphertext:${item.name}`);
    const createFolder = vi.fn(async (body: { name: string; parentId: string | null }) => {
      folderBodies.push(body);
      const folder: Folder = {
        id: `folder-${body.name.toLowerCase()}`,
        name: body.name,
        parentId: body.parentId ?? undefined,
        createdAt: '2026-08-01T00:00:00.000Z',
      };
      return { folder };
    });
    const records = [
      record('one', 'GitHub', ['Work', 'Engineering']),
      record('two', 'GitLab', ['Work', 'Engineering'], 3),
    ];

    const result = await runEncryptedImport({
      records,
      selectedSourceIds: new Set(['one', 'two']),
      duplicates: [],
      duplicateStrategy: 'skip',
      existingFolders: [],
      encryptItem: encryptItem as never,
      createFolder,
      createItem: async (body) => {
        createdBodies.push(body as unknown as Record<string, unknown>);
      },
    });

    expect(folderBodies).toEqual([
      { name: 'Work', parentId: null },
      { name: 'Engineering', parentId: 'folder-work' },
    ]);
    expect(encryptItem).toHaveBeenCalledTimes(2);
    expect(createdBodies).toHaveLength(2);
    expect(createdBodies[0]).toMatchObject({
      encryptedData: 'ciphertext:GitHub',
      folderId: 'folder-engineering',
      type: 'login',
    });
    expect(JSON.stringify(createdBodies)).not.toContain('secret-GitHub');
    expect(JSON.stringify(createdBodies)).not.toContain('github@example.com');
    expect(result).toMatchObject({ importedCount: 2, duplicateSkippedCount: 0, failures: [] });
  });

  it('reuses existing folders case-insensitively and skips detected duplicates by default', async () => {
    const existingFolders: Folder[] = [
      { id: 'work', name: 'Work', createdAt: '2026-08-01T00:00:00.000Z' },
      {
        id: 'engineering',
        name: 'engineering',
        parentId: 'work',
        createdAt: '2026-08-01T00:00:00.000Z',
      },
    ];
    const createItem = vi.fn(async () => ({}));
    const createFolder = vi.fn(async () => {
      throw new Error('should not create');
    });

    const result = await runEncryptedImport({
      records: [record('one', 'GitHub', ['work', 'ENGINEERING'])],
      selectedSourceIds: new Set(['one']),
      duplicates: [{ sourceId: 'one', existingItemId: 'existing' }],
      duplicateStrategy: 'skip',
      existingFolders,
      encryptItem: async () => 'ciphertext',
      createFolder,
      createItem,
    });

    expect(result.duplicateSkippedCount).toBe(1);
    expect(createFolder).not.toHaveBeenCalled();
    expect(createItem).not.toHaveBeenCalled();
  });

  it('keeps duplicates when requested and reports per-row failures without stopping the batch', async () => {
    const progress: Array<[number, number]> = [];
    const records = [record('one', 'GitHub'), record('two', 'GitLab', [], 3)];

    const result = await runEncryptedImport({
      records,
      selectedSourceIds: new Set(['one', 'two']),
      duplicates: [{ sourceId: 'one', existingItemId: 'existing' }],
      duplicateStrategy: 'keep-both',
      existingFolders: [],
      encryptItem: async (item) => {
        if (item.name === 'GitHub') throw new Error('Encryption failed safely');
        return 'ciphertext';
      },
      createFolder: async () => {
        throw new Error('unused');
      },
      createItem: async () => ({}),
      onProgress: (completed, total) => progress.push([completed, total]),
    });

    expect(result.importedCount).toBe(1);
    expect(result.duplicateSkippedCount).toBe(0);
    expect(result.failures).toEqual([
      {
        sourceId: 'one',
        sourceRow: 2,
        itemName: 'GitHub',
        message: 'Encryption failed safely',
      },
    ]);
    expect(progress[0]).toEqual([0, 2]);
    expect(progress.at(-1)).toEqual([2, 2]);
  });

  it('moves a matched legacy LastPass login to Trash only after its recovered note is created', async () => {
    const order: string[] = [];
    const result = await runEncryptedImport({
      records: [noteRecord('secure-note', 'Server recovery')],
      selectedSourceIds: new Set(['secure-note']),
      duplicates: [],
      legacyRepairs: [
        { sourceId: 'secure-note', existingItemId: 'legacy-http-sn-login' },
      ],
      duplicateStrategy: 'skip',
      existingFolders: [],
      encryptItem: async () => {
        order.push('encrypt');
        return 'ciphertext';
      },
      createFolder: async () => {
        throw new Error('unused');
      },
      createItem: async () => {
        order.push('create');
      },
      deleteItem: async (id) => {
        order.push(`trash:${id}`);
      },
    });

    expect(order).toEqual(['encrypt', 'create', 'trash:legacy-http-sn-login']);
    expect(result).toMatchObject({
      importedCount: 1,
      legacyRepairedCount: 1,
      failures: [],
      cleanupFailures: [],
    });
  });

  it('keeps the recovered note when legacy cleanup fails and reports the cleanup separately', async () => {
    const result = await runEncryptedImport({
      records: [noteRecord('secure-note', 'Server recovery')],
      selectedSourceIds: new Set(['secure-note']),
      duplicates: [],
      legacyRepairs: [
        { sourceId: 'secure-note', existingItemId: 'legacy-http-sn-login' },
      ],
      duplicateStrategy: 'skip',
      existingFolders: [],
      encryptItem: async () => 'ciphertext',
      createFolder: async () => {
        throw new Error('unused');
      },
      createItem: async () => ({}),
      deleteItem: async () => {
        throw new Error('Server unavailable');
      },
    });

    expect(result.importedCount).toBe(1);
    expect(result.legacyRepairedCount).toBe(0);
    expect(result.failures).toEqual([]);
    expect(result.cleanupFailures[0].message).toContain('Server unavailable');
  });
});
