/**
 * Coordinates fail-closed, server-backed item refreshes.
 *
 * The coordinator deliberately never accepts a cached item as a fallback. Calls
 * for the same item are deduplicated so one user action cannot fan out into
 * multiple server reads.
 */
export function createItemRefreshCoordinator<T extends { id: string }>(deps: {
  isPersonalItem: (itemId: string) => boolean;
  refreshPersonalItem: (itemId: string) => Promise<T>;
  commitPersonalItem: (item: T) => void;
  findSharedFolderId: (itemId: string) => string | null;
  refreshSharedFolder: (folderId: string) => Promise<T[]>;
  commitSharedFolder: (folderId: string, items: T[]) => void;
}): (itemId: string) => Promise<T> {
  const inFlight = new Map<string, Promise<T>>();

  return async (itemId: string): Promise<T> => {
    const existing = inFlight.get(itemId);
    if (existing) return existing;

    const refresh = (async () => {
      if (deps.isPersonalItem(itemId)) {
        const item = await deps.refreshPersonalItem(itemId);
        if (item.id !== itemId) throw new Error('The server returned the wrong vault item.');
        deps.commitPersonalItem(item);
        return item;
      }

      const folderId = deps.findSharedFolderId(itemId);
      if (!folderId) throw new Error('Vault item not found. Refresh your vault and try again.');

      const items = await deps.refreshSharedFolder(folderId);
      deps.commitSharedFolder(folderId, items);
      const item = items.find((candidate) => candidate.id === itemId);
      if (!item) throw new Error('This shared item is no longer available.');
      return item;
    })();

    inFlight.set(itemId, refresh);
    try {
      return await refresh;
    } finally {
      if (inFlight.get(itemId) === refresh) inFlight.delete(itemId);
    }
  };
}
