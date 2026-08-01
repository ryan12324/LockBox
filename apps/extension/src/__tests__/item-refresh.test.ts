import { describe, expect, it, vi } from 'vitest';
import { createItemRefreshCoordinator } from '../../lib/item-refresh.js';

type Item = { id: string; revision: number };

function setup(overrides?: {
  refreshPersonalItem?: (itemId: string) => Promise<Item>;
  refreshSharedFolder?: (folderId: string) => Promise<Item[]>;
}) {
  const personal = new Map<string, Item>([['personal', { id: 'personal', revision: 1 }]]);
  const shared = new Map<string, Item[]>([['folder', [{ id: 'shared', revision: 1 }]]]);
  const refreshPersonalItem = vi.fn(
    overrides?.refreshPersonalItem ?? (async (id: string) => ({ id, revision: 2 }))
  );
  const refreshSharedFolder = vi.fn(
    overrides?.refreshSharedFolder ?? (async () => [{ id: 'shared', revision: 2 }])
  );
  const refresh = createItemRefreshCoordinator<Item>({
    isPersonalItem: (id) => personal.has(id),
    refreshPersonalItem,
    commitPersonalItem: (item) => personal.set(item.id, item),
    findSharedFolderId: (id) =>
      shared.get('folder')?.some((item) => item.id === id) ? 'folder' : null,
    refreshSharedFolder,
    commitSharedFolder: (folderId, items) => shared.set(folderId, items),
  });
  return { personal, shared, refresh, refreshPersonalItem, refreshSharedFolder };
}

describe('server-backed item refresh', () => {
  it('returns and commits the fresh personal revision', async () => {
    const { personal, refresh } = setup();
    await expect(refresh('personal')).resolves.toEqual({ id: 'personal', revision: 2 });
    expect(personal.get('personal')?.revision).toBe(2);
  });

  it('does not fall back to a cached personal item when the server fails', async () => {
    const { personal, refresh } = setup({
      refreshPersonalItem: async () => {
        throw new Error('offline');
      },
    });
    await expect(refresh('personal')).rejects.toThrow('offline');
    expect(personal.get('personal')?.revision).toBe(1);
  });

  it('replaces a shared-folder snapshot and rejects a removed item', async () => {
    const { shared, refresh } = setup({ refreshSharedFolder: async () => [] });
    await expect(refresh('shared')).rejects.toThrow('no longer available');
    expect(shared.get('folder')).toEqual([]);
  });

  it('deduplicates concurrent refreshes for the same item', async () => {
    let resolve!: (item: Item) => void;
    const pending = new Promise<Item>((done) => {
      resolve = done;
    });
    const { refresh, refreshPersonalItem } = setup({
      refreshPersonalItem: async () => pending,
    });
    const first = refresh('personal');
    const second = refresh('personal');
    resolve({ id: 'personal', revision: 2 });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { id: 'personal', revision: 2 },
      { id: 'personal', revision: 2 },
    ]);
    expect(refreshPersonalItem).toHaveBeenCalledTimes(1);
  });
});
