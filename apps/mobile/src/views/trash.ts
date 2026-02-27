/**
 * Trash view utilities — display deleted items with countdown timers,
 * restore and permanent delete actions.
 *
 * Deleted items are soft-deleted server-side with a deletedAt timestamp.
 * The API returns a daysRemaining field indicating days until permanent deletion.
 * Default retention is 30 days.
 */

/** Vault item type discriminant (matches @lockbox/types VaultItemType) */
type VaultItemType = 'login' | 'note' | 'card' | 'identity';

/** Default retention period in days before permanent deletion */
export const TRASH_RETENTION_DAYS = 30;

/** Trash item from the server with deletion metadata */
export interface TrashItem {
  id: string;
  name: string;
  type: VaultItemType;
  deletedAt: string; // ISO 8601
  daysRemaining: number;
  encryptedData: string;
  folderId?: string;
  tags: string[];
  favorite: boolean;
}

/** Display-ready trash list item */
export interface TrashListItem {
  id: string;
  name: string;
  type: VaultItemType;
  deletedAt: string;
  daysRemaining: number;
  countdownLabel: string;
  isUrgent: boolean;
}

/** Trash action types */
export type TrashAction = 'restore' | 'permanent_delete';

/**
 * Format days remaining into a human-readable countdown label.
 *
 * - 0 days: "Deleting today"
 * - 1 day: "1 day remaining"
 * - N days: "N days remaining"
 */
export function formatDaysRemaining(daysRemaining: number): string {
  if (daysRemaining <= 0) return 'Deleting today';
  if (daysRemaining === 1) return '1 day remaining';
  return `${daysRemaining} days remaining`;
}

/**
 * Determine if a trash item's deletion is urgent (≤ 3 days remaining).
 * Used for visual warning indicators.
 */
export function isUrgentDeletion(daysRemaining: number): boolean {
  return daysRemaining <= 3;
}

/**
 * Process a raw trash item into a display-ready TrashListItem.
 */
export function toTrashListItem(item: TrashItem): TrashListItem {
  return {
    id: item.id,
    name: item.name,
    type: item.type,
    deletedAt: item.deletedAt,
    daysRemaining: item.daysRemaining,
    countdownLabel: formatDaysRemaining(item.daysRemaining),
    isUrgent: isUrgentDeletion(item.daysRemaining),
  };
}

/**
 * Process an array of trash items into display-ready TrashListItems.
 * Sorted by daysRemaining ascending (most urgent first).
 */
export function processTrashList(items: TrashItem[]): TrashListItem[] {
  return items.map(toTrashListItem).sort((a, b) => a.daysRemaining - b.daysRemaining);
}

/**
 * Calculate days remaining from a deletedAt timestamp.
 * Uses the current date and TRASH_RETENTION_DAYS constant.
 * Returns 0 if already past the retention period.
 */
export function calculateDaysRemaining(deletedAt: string, now?: Date): number {
  const deletedDate = new Date(deletedAt);
  const currentDate = now ?? new Date();
  const expiryDate = new Date(deletedDate.getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const msRemaining = expiryDate.getTime() - currentDate.getTime();
  const days = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));
  return Math.max(0, days);
}

/**
 * Format the deletedAt date for display.
 * Returns a locale-appropriate date string.
 */
export function formatDeletedDate(deletedAt: string): string {
  const date = new Date(deletedAt);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Group trash items by type for sectioned display.
 */
export function groupTrashByType(items: TrashListItem[]): Map<VaultItemType, TrashListItem[]> {
  const groups = new Map<VaultItemType, TrashListItem[]>();
  for (const item of items) {
    const group = groups.get(item.type);
    if (group) {
      group.push(item);
    } else {
      groups.set(item.type, [item]);
    }
  }
  return groups;
}

/**
 * Get a summary of the trash contents.
 */
export function getTrashSummary(items: TrashListItem[]): {
  total: number;
  urgent: number;
  byType: Record<string, number>;
} {
  const byType: Record<string, number> = {};
  let urgent = 0;

  for (const item of items) {
    byType[item.type] = (byType[item.type] ?? 0) + 1;
    if (item.isUrgent) urgent++;
  }

  return { total: items.length, urgent, byType };
}
