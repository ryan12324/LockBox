/**
 * Tests for travel mode view utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  getTravelModeWarning,
  getTravelModeDescription,
  getConfirmEnableMessage,
  getConfirmDisableMessage,
  toFolderTravelItem,
  processFolderList,
  calculateTravelModeState,
  getHiddenItemCount,
  type FolderTravelSetting,
} from '../views/travel-mode';

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeFolder(overrides: Partial<FolderTravelSetting> = {}): FolderTravelSetting {
  return {
    id: 'folder-1',
    name: 'Personal',
    travelSafe: false,
    itemCount: 5,
    ...overrides,
  };
}

// ─── getTravelModeWarning ─────────────────────────────────────────────────────

describe('getTravelModeWarning', () => {
  it('returns a non-empty warning string', () => {
    const warning = getTravelModeWarning();
    expect(typeof warning).toBe('string');
    expect(warning.length).toBeGreaterThan(0);
  });

  it('mentions hiding items', () => {
    expect(getTravelModeWarning()).toContain('hid');
  });
});

// ─── getTravelModeDescription ─────────────────────────────────────────────────

describe('getTravelModeDescription', () => {
  it('returns a non-empty description string', () => {
    const desc = getTravelModeDescription();
    expect(typeof desc).toBe('string');
    expect(desc.length).toBeGreaterThan(0);
  });

  it('mentions border crossings or travel', () => {
    expect(getTravelModeDescription().toLowerCase()).toContain('travel');
  });
});

// ─── getConfirmEnableMessage ──────────────────────────────────────────────────

describe('getConfirmEnableMessage', () => {
  it('returns zero-hidden message when no items hidden', () => {
    const msg = getConfirmEnableMessage(0);
    expect(msg).toContain('No items');
  });

  it('returns singular message for 1 hidden item', () => {
    const msg = getConfirmEnableMessage(1);
    expect(msg).toContain('1 item');
    expect(msg).not.toContain('1 items');
  });

  it('returns plural message for multiple hidden items', () => {
    const msg = getConfirmEnableMessage(15);
    expect(msg).toContain('15 items');
  });

  it('includes confirmation prompt for hidden items', () => {
    const msg = getConfirmEnableMessage(5);
    expect(msg).toContain('Are you sure');
  });
});

// ─── getConfirmDisableMessage ─────────────────────────────────────────────────

describe('getConfirmDisableMessage', () => {
  it('returns a non-empty message', () => {
    const msg = getConfirmDisableMessage();
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
  });

  it('mentions items becoming visible', () => {
    expect(getConfirmDisableMessage()).toContain('visible');
  });
});

// ─── toFolderTravelItem ───────────────────────────────────────────────────────

describe('toFolderTravelItem', () => {
  it('converts folder with boolean travelSafe=true', () => {
    const folder = { id: 'f1', name: 'Work', travelSafe: true };
    const result = toFolderTravelItem(folder, 3);
    expect(result.id).toBe('f1');
    expect(result.name).toBe('Work');
    expect(result.travelSafe).toBe(true);
    expect(result.itemCount).toBe(3);
  });

  it('converts folder with boolean travelSafe=false', () => {
    const folder = { id: 'f2', name: 'Personal', travelSafe: false };
    const result = toFolderTravelItem(folder, 10);
    expect(result.travelSafe).toBe(false);
  });

  it('handles travelSafe as number 1 (SQLite true)', () => {
    const folder = { id: 'f3', name: 'Travel', travelSafe: 1 };
    const result = toFolderTravelItem(folder, 2);
    expect(result.travelSafe).toBe(true);
  });

  it('handles travelSafe as number 0 (SQLite false)', () => {
    const folder = { id: 'f4', name: 'Sensitive', travelSafe: 0 };
    const result = toFolderTravelItem(folder, 7);
    expect(result.travelSafe).toBe(false);
  });

  it('handles undefined travelSafe as false', () => {
    const folder = { id: 'f5', name: 'Default' };
    const result = toFolderTravelItem(folder, 1);
    expect(result.travelSafe).toBe(false);
  });
});

// ─── processFolderList ────────────────────────────────────────────────────────

describe('processFolderList', () => {
  it('counts items per folder correctly', () => {
    const folders = [
      { id: 'f1', name: 'Work', travelSafe: true },
      { id: 'f2', name: 'Personal', travelSafe: false },
    ];
    const items = [{ folderId: 'f1' }, { folderId: 'f1' }, { folderId: 'f2' }];
    const result = processFolderList(folders, items);
    expect(result).toHaveLength(2);
    expect(result[0].itemCount).toBe(2);
    expect(result[1].itemCount).toBe(1);
  });

  it('returns empty array for no folders', () => {
    expect(processFolderList([], [{ folderId: 'f1' }])).toHaveLength(0);
  });

  it('returns zero item count for folders with no matching items', () => {
    const folders = [{ id: 'f1', name: 'Empty' }];
    const result = processFolderList(folders, []);
    expect(result[0].itemCount).toBe(0);
  });

  it('handles items with null folderId', () => {
    const folders = [{ id: 'f1', name: 'Work' }];
    const items = [{ folderId: null }, { folderId: 'f1' }];
    const result = processFolderList(folders, items);
    expect(result[0].itemCount).toBe(1);
  });
});

// ─── calculateTravelModeState ─────────────────────────────────────────────────

describe('calculateTravelModeState', () => {
  it('calculates state with mixed safe/unsafe folders', () => {
    const folders: FolderTravelSetting[] = [
      makeFolder({ id: 'f1', travelSafe: true, itemCount: 3 }),
      makeFolder({ id: 'f2', travelSafe: false, itemCount: 7 }),
    ];
    const state = calculateTravelModeState(true, folders, 10);
    expect(state.enabled).toBe(true);
    expect(state.safeFolderCount).toBe(1);
    expect(state.totalFolderCount).toBe(2);
    expect(state.hiddenItemCount).toBe(7);
  });

  it('calculates state when all folders are safe', () => {
    const folders: FolderTravelSetting[] = [
      makeFolder({ id: 'f1', travelSafe: true, itemCount: 5 }),
      makeFolder({ id: 'f2', travelSafe: true, itemCount: 3 }),
    ];
    const state = calculateTravelModeState(true, folders, 8);
    expect(state.hiddenItemCount).toBe(0);
    expect(state.safeFolderCount).toBe(2);
  });

  it('calculates state when no folders are safe', () => {
    const folders: FolderTravelSetting[] = [
      makeFolder({ id: 'f1', travelSafe: false, itemCount: 5 }),
    ];
    const state = calculateTravelModeState(false, folders, 5);
    expect(state.enabled).toBe(false);
    expect(state.hiddenItemCount).toBe(5);
    expect(state.safeFolderCount).toBe(0);
  });

  it('handles empty folder list', () => {
    const state = calculateTravelModeState(false, [], 10);
    expect(state.safeFolderCount).toBe(0);
    expect(state.totalFolderCount).toBe(0);
    expect(state.hiddenItemCount).toBe(10);
  });
});

// ─── getHiddenItemCount ───────────────────────────────────────────────────────

describe('getHiddenItemCount', () => {
  it('counts items not in safe folders', () => {
    const items = [{ folderId: 'f1' }, { folderId: 'f2' }, { folderId: 'f3' }];
    const count = getHiddenItemCount(items, ['f1']);
    expect(count).toBe(2);
  });

  it('counts items with no folderId as hidden', () => {
    const items = [{ folderId: null }, { folderId: undefined }, { folderId: 'f1' }];
    const count = getHiddenItemCount(items, ['f1']);
    expect(count).toBe(2);
  });

  it('returns 0 when all items are in safe folders', () => {
    const items = [{ folderId: 'f1' }, { folderId: 'f2' }];
    const count = getHiddenItemCount(items, ['f1', 'f2']);
    expect(count).toBe(0);
  });

  it('returns total count when no folders are safe', () => {
    const items = [{ folderId: 'f1' }, { folderId: 'f2' }];
    const count = getHiddenItemCount(items, []);
    expect(count).toBe(2);
  });

  it('returns 0 for empty item list', () => {
    expect(getHiddenItemCount([], ['f1'])).toBe(0);
  });
});
