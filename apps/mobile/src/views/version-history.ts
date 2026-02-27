/**
 * Version history view utilities — display item revision history
 * with relative timestamps and sorted version lists.
 *
 * Used by the mobile vault detail screen to show version history
 * and allow restoring previous versions.
 */

/** Maximum number of versions to display in the history list */
export const MAX_VERSIONS = 10;

/** Raw version record from the API */
export interface ItemVersion {
  id: string;
  revisionDate: string;
  createdAt: string;
}

/** Display-ready version list item with formatted timestamps */
export interface VersionListItem {
  id: string;
  revisionDate: string;
  createdAt: string;
  relativeTime: string;
  formattedDate: string;
}

/**
 * Format a date string into a human-readable relative time.
 *
 * - < 1 minute: "Just now"
 * - < 60 minutes: "5m ago"
 * - < 24 hours: "2h ago"
 * - < 30 days: "3d ago"
 * - Otherwise: locale date string
 */
export function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

/**
 * Convert a raw ItemVersion into a display-ready VersionListItem.
 */
export function toVersionListItem(version: ItemVersion): VersionListItem {
  return {
    id: version.id,
    revisionDate: version.revisionDate,
    createdAt: version.createdAt,
    relativeTime: formatRelativeTime(version.revisionDate),
    formattedDate: new Date(version.revisionDate).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
}

/**
 * Process an array of versions into display-ready VersionListItems.
 * Sorted by revisionDate descending (newest first).
 */
export function processVersionList(versions: ItemVersion[]): VersionListItem[] {
  return versions
    .slice()
    .sort((a, b) => new Date(b.revisionDate).getTime() - new Date(a.revisionDate).getTime())
    .map(toVersionListItem);
}

/**
 * Get a human-readable summary of the version list.
 * E.g. "5 versions", "1 version", or "No history".
 */
export function getVersionSummary(versions: VersionListItem[]): string {
  if (versions.length === 0) return 'No history';
  if (versions.length === 1) return '1 version';
  return `${versions.length} versions`;
}
