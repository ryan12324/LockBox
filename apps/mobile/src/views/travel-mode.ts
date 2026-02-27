/**
 * Travel mode view utilities — folder safety settings, hidden item counts,
 * and confirmation messages for enabling/disabling travel mode.
 *
 * Travel mode hides vault items not in "travel safe" folders,
 * protecting sensitive data at border crossings.
 */

/** Current travel mode state for display */
export interface TravelModeState {
  enabled: boolean;
  safeFolderCount: number;
  totalFolderCount: number;
  hiddenItemCount: number;
}

/** Folder with travel safety setting */
export interface FolderTravelSetting {
  id: string;
  name: string;
  travelSafe: boolean;
  itemCount: number;
}

/**
 * Get the warning message shown on the travel mode settings screen.
 */
export function getTravelModeWarning(): string {
  return 'Travel mode hides all vault items except those in folders marked as travel safe. Items are not deleted — they are hidden until travel mode is disabled.';
}

/**
 * Get the description of what travel mode does.
 */
export function getTravelModeDescription(): string {
  return 'Protect sensitive vault items when crossing borders. Only items in travel-safe folders will be visible while travel mode is active.';
}

/**
 * Get the confirmation message when enabling travel mode.
 */
export function getConfirmEnableMessage(hiddenCount: number): string {
  if (hiddenCount === 0) {
    return 'No items will be hidden. All your items are in travel-safe folders.';
  }
  if (hiddenCount === 1) {
    return '1 item will be hidden while travel mode is active. Are you sure?';
  }
  return `${hiddenCount} items will be hidden while travel mode is active. Are you sure?`;
}

/**
 * Get the confirmation message when disabling travel mode.
 */
export function getConfirmDisableMessage(): string {
  return 'All hidden items will become visible again. Disable travel mode?';
}

/**
 * Convert a raw folder object into a FolderTravelSetting.
 * Handles travelSafe as boolean or number (SQLite returns 0/1).
 */
export function toFolderTravelItem(
  folder: { id: string; name: string; travelSafe?: boolean | number },
  itemCount: number
): FolderTravelSetting {
  return {
    id: folder.id,
    name: folder.name,
    travelSafe: folder.travelSafe === true || folder.travelSafe === 1,
    itemCount,
  };
}

/**
 * Process a list of folders with their item counts into FolderTravelSettings.
 * Counts items per folder based on matching folderId.
 */
export function processFolderList(
  folders: Array<{ id: string; name: string; travelSafe?: boolean | number }>,
  items: Array<{ folderId?: string | null }>
): FolderTravelSetting[] {
  return folders.map((folder) => {
    const itemCount = items.filter((item) => item.folderId === folder.id).length;
    return toFolderTravelItem(folder, itemCount);
  });
}

/**
 * Calculate the overall travel mode state from folder settings and items.
 */
export function calculateTravelModeState(
  enabled: boolean,
  folders: FolderTravelSetting[],
  totalItems: number
): TravelModeState {
  const safeFolderCount = folders.filter((f) => f.travelSafe).length;
  const safeItemCount = folders
    .filter((f) => f.travelSafe)
    .reduce((sum, f) => sum + f.itemCount, 0);

  return {
    enabled,
    safeFolderCount,
    totalFolderCount: folders.length,
    hiddenItemCount: totalItems - safeItemCount,
  };
}

/**
 * Count how many items would be hidden in travel mode.
 * Items not in any safe folder (including items with no folder) are hidden.
 */
export function getHiddenItemCount(
  items: Array<{ folderId?: string | null }>,
  safeFolderIds: string[]
): number {
  return items.filter((item) => {
    if (!item.folderId) return true;
    return !safeFolderIds.includes(item.folderId);
  }).length;
}
