import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LoginItem, CardItem, SecureNoteItem, VaultItem, Folder } from '@lockbox/types';


const m = vi.hoisted(() => ({
  searchFn: vi.fn(),
  indexFn: vi.fn(),
  initializeFn: vi.fn(),
  generatePassword: vi.fn(),
  checkPassword: vi.fn(),
  analyzeVaultHealth: vi.fn(),
}));

vi.mock('../../search/semantic.js', () => ({
  SemanticSearch: vi.fn().mockImplementation(function () {
    return { search: m.searchFn, index: m.indexFn };
  }),
}));

vi.mock('../../search/embeddings.js', () => ({
  KeywordEmbeddingProvider: vi.fn().mockImplementation(function () {
    return { initialize: m.initializeFn };
  }),
}));

vi.mock('@lockbox/generator', () => ({
  generatePassword: m.generatePassword,
}));

vi.mock('@lockbox/crypto', () => ({
  checkPassword: m.checkPassword,
}));

vi.mock('../../health/analyzer.js', () => ({
  analyzeVaultHealth: m.analyzeVaultHealth,
}));

import { ToolExecutor } from '../executor.js';
import type { AgentContext } from '../executor.js';

function makeLoginItem(overrides?: Partial<LoginItem>): LoginItem {
  return {
    id: 'login-1',
    type: 'login',
    name: 'GitHub',
    username: 'user@example.com',
    password: 'super-secret-password',
    uris: ['https://github.com'],
    totp: 'otpauth://totp/GitHub:user?secret=JBSWY3DPEHPK3PXP',
    tags: ['dev'],
    folderId: 'folder-1',
    favorite: true,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    revisionDate: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeCardItem(overrides?: Partial<CardItem>): CardItem {
  return {
    id: 'card-1',
    type: 'card',
    name: 'Visa Ending 4242',
    cardholderName: 'John Doe',
    number: '4111111111114242',
    expMonth: '12',
    expYear: '2028',
    cvv: '123',
    brand: 'Visa',
    tags: ['finance'],
    favorite: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    revisionDate: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeNoteItem(overrides?: Partial<SecureNoteItem>): SecureNoteItem {
  return {
    id: 'note-1',
    type: 'note',
    name: 'Recovery Codes',
    content: 'abc-def-ghi',
    tags: [],
    favorite: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    revisionDate: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeFolders(): Folder[] {
  return [
    { id: 'folder-1', name: 'Work', createdAt: '2025-01-01T00:00:00.000Z' },
    { id: 'folder-2', name: 'Personal', createdAt: '2025-01-01T00:00:00.000Z' },
  ];
}

function makeContext(vault?: VaultItem[], folders?: Folder[]): AgentContext {
  return {
    vault: vault ?? [makeLoginItem(), makeCardItem(), makeNoteItem()],
    folders: folders ?? makeFolders(),
    onCreateItem: vi.fn().mockResolvedValue(makeLoginItem({ id: 'new-1', name: 'New Item' })),
    onUpdateItem: vi
      .fn()
      .mockImplementation((id: string, changes: Partial<VaultItem>) =>
        Promise.resolve({ ...makeLoginItem({ id }), ...changes })
      ),
    onDeleteItem: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ToolExecutor', () => {
  let executor: ToolExecutor;
  let context: AgentContext;

  beforeEach(() => {
    vi.clearAllMocks();
    m.initializeFn.mockResolvedValue(true);
    m.indexFn.mockResolvedValue(undefined);
    m.searchFn.mockResolvedValue([]);
    m.generatePassword.mockReturnValue('G3n3r@tedP@ss!');
    m.checkPassword.mockResolvedValue({
      hashPrefix: 'ABCDE',
      found: false,
      count: 0,
      checkedAt: '2025-01-01T00:00:00.000Z',
    });
    m.analyzeVaultHealth.mockResolvedValue({
      totalItems: 2,
      weak: 0,
      reused: 0,
      old: 0,
      breached: 0,
      strong: 2,
      overallScore: 100,
    });
    context = makeContext();
    executor = new ToolExecutor(context);
  });

  describe('unknown tool', () => {
    it('returns error for unknown tool name', async () => {
      const result = await executor.execute({ name: 'nonexistent', arguments: {} });
      expect(result.error).toBe('Unknown tool: nonexistent');
      expect(result.result).toBeNull();
    });
  });

  describe('search_vault', () => {
    it('returns sanitized matching items', async () => {
      const loginItem = makeLoginItem();
      m.searchFn.mockResolvedValue([{ item: loginItem, score: 0.95, matchType: 'exact' }]);

      const result = await executor.execute({
        name: 'search_vault',
        arguments: { query: 'github' },
      });

      expect(result.error).toBeUndefined();
      const items = result.result as Record<string, unknown>[];
      expect(items).toHaveLength(1);
      expect(items[0]).toHaveProperty('name', 'GitHub');
      expect(items[0]).toHaveProperty('username', 'user@example.com');
      expect(items[0]).toHaveProperty('score', 0.95);
      expect(items[0]).not.toHaveProperty('password');
      expect(items[0]).not.toHaveProperty('totp');
    });

    it('passes limit to search', async () => {
      m.searchFn.mockResolvedValue([]);

      await executor.execute({
        name: 'search_vault',
        arguments: { query: 'test', limit: 5 },
      });

      expect(m.searchFn).toHaveBeenCalledWith('test', { limit: 5 });
    });

    it('returns error for missing query', async () => {
      const result = await executor.execute({
        name: 'search_vault',
        arguments: {},
      });
      expect(result.error).toContain('query');
    });
  });

  describe('get_item', () => {
    it('returns sanitized LoginItem (no password, no totp)', async () => {
      const result = await executor.execute({
        name: 'get_item',
        arguments: { id: 'login-1' },
      });

      expect(result.error).toBeUndefined();
      const item = result.result as Record<string, unknown>;
      expect(item.name).toBe('GitHub');
      expect(item.username).toBe('user@example.com');
      expect(item.uris).toEqual(['https://github.com']);
      expect(item.tags).toEqual(['dev']);
      expect(item.folderId).toBe('folder-1');
      expect(item.favorite).toBe(true);
      expect(item).not.toHaveProperty('password');
      expect(item).not.toHaveProperty('totp');
    });

    it('returns sanitized CardItem (no full number, no cvv)', async () => {
      const result = await executor.execute({
        name: 'get_item',
        arguments: { id: 'card-1' },
      });

      expect(result.error).toBeUndefined();
      const item = result.result as Record<string, unknown>;
      expect(item.cardholderName).toBe('John Doe');
      expect(item.brand).toBe('Visa');
      expect(item.last4).toBe('4242');
      expect(item.expMonth).toBe('12');
      expect(item.expYear).toBe('2028');
      expect(item).not.toHaveProperty('number');
      expect(item).not.toHaveProperty('cvv');
    });

    it('returns SecureNoteItem with content', async () => {
      const result = await executor.execute({
        name: 'get_item',
        arguments: { id: 'note-1' },
      });

      expect(result.error).toBeUndefined();
      const item = result.result as Record<string, unknown>;
      expect(item.name).toBe('Recovery Codes');
      expect(item.content).toBe('abc-def-ghi');
    });

    it('returns error for missing id', async () => {
      const result = await executor.execute({
        name: 'get_item',
        arguments: {},
      });
      expect(result.error).toContain('id');
    });

    it('returns error for nonexistent item', async () => {
      const result = await executor.execute({
        name: 'get_item',
        arguments: { id: 'not-found' },
      });
      expect(result.error).toContain('Item not found');
    });
  });

  describe('create_item', () => {
    it('calls onCreateItem callback and returns sanitized result', async () => {
      const result = await executor.execute({
        name: 'create_item',
        arguments: {
          type: 'login',
          name: 'New Login',
          data: { username: 'test', password: 'pass123' },
        },
      });

      expect(result.error).toBeUndefined();
      expect(context.onCreateItem).toHaveBeenCalledOnce();
      const item = result.result as Record<string, unknown>;
      expect(item).not.toHaveProperty('password');
    });

    it('returns error for missing parameters', async () => {
      const result = await executor.execute({
        name: 'create_item',
        arguments: { type: 'login' },
      });
      expect(result.error).toBeDefined();
    });
  });

  describe('update_item', () => {
    it('calls onUpdateItem callback and returns sanitized result', async () => {
      const result = await executor.execute({
        name: 'update_item',
        arguments: { id: 'login-1', changes: { name: 'Updated' } },
      });

      expect(result.error).toBeUndefined();
      expect(context.onUpdateItem).toHaveBeenCalledWith('login-1', { name: 'Updated' });
      const item = result.result as Record<string, unknown>;
      expect(item).not.toHaveProperty('password');
    });

    it('returns error for missing id', async () => {
      const result = await executor.execute({
        name: 'update_item',
        arguments: { changes: { name: 'Updated' } },
      });
      expect(result.error).toContain('id');
    });

    it('returns error for missing changes', async () => {
      const result = await executor.execute({
        name: 'update_item',
        arguments: { id: 'login-1' },
      });
      expect(result.error).toContain('changes');
    });
  });

  describe('delete_item', () => {
    it('calls onDeleteItem callback', async () => {
      const result = await executor.execute({
        name: 'delete_item',
        arguments: { id: 'login-1' },
      });

      expect(result.error).toBeUndefined();
      expect(context.onDeleteItem).toHaveBeenCalledWith('login-1');
      const data = result.result as Record<string, unknown>;
      expect(data.deleted).toBe(true);
      expect(data.id).toBe('login-1');
    });

    it('returns error for missing id', async () => {
      const result = await executor.execute({
        name: 'delete_item',
        arguments: {},
      });
      expect(result.error).toContain('id');
    });
  });

  describe('generate_password', () => {
    it('returns a generated password', async () => {
      const result = await executor.execute({
        name: 'generate_password',
        arguments: {},
      });

      expect(result.error).toBeUndefined();
      const data = result.result as Record<string, unknown>;
      expect(data.password).toBe('G3n3r@tedP@ss!');
      expect(m.generatePassword).toHaveBeenCalled();
    });

    it('passes options to generator (maps special to symbols)', async () => {
      await executor.execute({
        name: 'generate_password',
        arguments: { length: 32, special: false, uppercase: true },
      });

      expect(m.generatePassword).toHaveBeenCalledWith({
        length: 32,
        symbols: false,
        uppercase: true,
      });
    });
  });

  describe('check_breach', () => {
    it('returns breach result without the password', async () => {
      m.checkPassword.mockResolvedValue({
        hashPrefix: 'ABCDE',
        found: true,
        count: 42,
        checkedAt: '2025-01-01T00:00:00.000Z',
      });

      const result = await executor.execute({
        name: 'check_breach',
        arguments: { password: 'password123' },
      });

      expect(result.error).toBeUndefined();
      const data = result.result as Record<string, unknown>;
      expect(data.found).toBe(true);
      expect(data.count).toBe(42);
      expect(data).not.toHaveProperty('password');
      expect(data).not.toHaveProperty('hashPrefix');
    });

    it('returns error for missing password', async () => {
      const result = await executor.execute({
        name: 'check_breach',
        arguments: {},
      });
      expect(result.error).toContain('password');
    });
  });

  describe('get_health_report', () => {
    it('returns vault health summary', async () => {
      const result = await executor.execute({
        name: 'get_health_report',
        arguments: {},
      });

      expect(result.error).toBeUndefined();
      const data = result.result as Record<string, unknown>;
      expect(data.totalItems).toBe(2);
      expect(data.overallScore).toBe(100);
      expect(m.analyzeVaultHealth).toHaveBeenCalled();
    });

    it('only passes LoginItems to analyzeVaultHealth', async () => {
      await executor.execute({
        name: 'get_health_report',
        arguments: {},
      });

      const passedItems = m.analyzeVaultHealth.mock.calls[0][0] as VaultItem[];
      expect(passedItems).toHaveLength(1);
      expect(passedItems[0].type).toBe('login');
    });
  });

  describe('list_folders', () => {
    it('returns all folders', async () => {
      const result = await executor.execute({
        name: 'list_folders',
        arguments: {},
      });

      expect(result.error).toBeUndefined();
      const folders = result.result as Folder[];
      expect(folders).toHaveLength(2);
      expect(folders[0].name).toBe('Work');
      expect(folders[1].name).toBe('Personal');
    });
  });

  describe('organize_item', () => {
    it('calls onUpdateItem with folder and tag changes', async () => {
      const result = await executor.execute({
        name: 'organize_item',
        arguments: {
          id: 'login-1',
          folderId: 'folder-2',
          addTags: ['important'],
          removeTags: ['dev'],
        },
      });

      expect(result.error).toBeUndefined();
      expect(context.onUpdateItem).toHaveBeenCalledWith('login-1', {
        folderId: 'folder-2',
        tags: ['important'],
      });
    });

    it('returns error for nonexistent item', async () => {
      const result = await executor.execute({
        name: 'organize_item',
        arguments: { id: 'not-found' },
      });
      expect(result.error).toContain('Item not found');
    });

    it('handles addTags without duplicates', async () => {
      await executor.execute({
        name: 'organize_item',
        arguments: { id: 'login-1', addTags: ['dev', 'new-tag'] },
      });

      expect(context.onUpdateItem).toHaveBeenCalledWith('login-1', {
        tags: ['dev', 'new-tag'],
      });
    });

    it('returns error for missing id', async () => {
      const result = await executor.execute({
        name: 'organize_item',
        arguments: {},
      });
      expect(result.error).toContain('id');
    });
  });

  describe('error handling', () => {
    it('catches thrown errors and returns error result', async () => {
      vi.mocked(context.onDeleteItem).mockRejectedValue(new Error('Network failure'));

      const result = await executor.execute({
        name: 'delete_item',
        arguments: { id: 'login-1' },
      });

      expect(result.error).toBe('Network failure');
      expect(result.result).toBeNull();
    });

    it('handles non-Error thrown values', async () => {
      vi.mocked(context.onDeleteItem).mockRejectedValue('string error');

      const result = await executor.execute({
        name: 'delete_item',
        arguments: { id: 'login-1' },
      });

      expect(result.error).toBe('string error');
    });
  });
});
