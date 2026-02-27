/**
 * Attachment view utilities — display file attachments with size formatting,
 * icon mapping, image detection, and quota validation.
 *
 * Follows the same utility-function pattern as trash.ts.
 * Used by the mobile vault UI for file attachment list views.
 */

/** Maximum file size per attachment (10 MB) */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Maximum total storage quota per user (100 MB) */
export const MAX_TOTAL_QUOTA = 100 * 1024 * 1024;

/** Display-ready attachment list item */
export interface AttachmentListItem {
  /** Attachment ID */
  id: string;
  /** Original file name */
  fileName: string;
  /** File size in bytes */
  fileSize: number;
  /** MIME type (e.g. "image/png", "application/pdf") */
  mimeType: string;
  /** ISO 8601 creation timestamp */
  createdAt: string;
}

/** Validation result for file size or quota checks */
export interface ValidationResult {
  /** Whether the validation passed */
  valid: boolean;
  /** Error message if validation failed */
  error?: string;
}

/**
 * Format a file size in bytes to a human-readable string.
 *
 * - < 1 KB: "N B"
 * - < 1 MB: "N.N KB"
 * - < 1 GB: "N.N MB"
 * - >= 1 GB: "N.N GB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Get an icon identifier based on MIME type.
 * Returns a semantic icon name for use in the UI layer.
 */
export function getAttachmentIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType === 'application/pdf') return 'pdf';
  if (
    mimeType === 'application/zip' ||
    mimeType === 'application/x-zip-compressed' ||
    mimeType === 'application/gzip' ||
    mimeType === 'application/x-tar'
  ) {
    return 'archive';
  }
  if (
    mimeType === 'text/plain' ||
    mimeType === 'text/csv' ||
    mimeType === 'text/html' ||
    mimeType === 'application/json' ||
    mimeType === 'application/xml'
  ) {
    return 'text';
  }
  if (
    mimeType === 'application/msword' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return 'document';
  }
  if (
    mimeType === 'application/vnd.ms-excel' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    return 'spreadsheet';
  }
  return 'file';
}

/**
 * Check if an attachment's MIME type indicates a previewable image.
 * Only common web-safe image formats are considered previewable.
 */
export function isImageAttachment(mimeType: string): boolean {
  const previewable = [
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'image/bmp',
  ];
  return previewable.includes(mimeType);
}

/**
 * Convert a raw attachment object into a display-ready AttachmentListItem.
 */
export function toAttachmentListItem(raw: {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
}): AttachmentListItem {
  return {
    id: raw.id,
    fileName: raw.fileName,
    fileSize: raw.fileSize,
    mimeType: raw.mimeType,
    createdAt: raw.createdAt,
  };
}

/**
 * Process an array of raw attachments into display-ready AttachmentListItems.
 * Sorted by createdAt descending (newest first).
 */
export function processAttachmentList(
  items: Array<{
    id: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    createdAt: string;
  }>
): AttachmentListItem[] {
  return items
    .map(toAttachmentListItem)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Get a human-readable summary of the attachment list.
 * e.g. "3 files, 2.1 MB" or "No attachments"
 */
export function getAttachmentSummary(items: AttachmentListItem[]): string {
  if (items.length === 0) return 'No attachments';

  const totalSize = items.reduce((sum, item) => sum + item.fileSize, 0);
  const fileLabel = items.length === 1 ? '1 file' : `${items.length} files`;
  return `${fileLabel}, ${formatFileSize(totalSize)}`;
}

/**
 * Validate that a file does not exceed the per-file size limit.
 */
export function validateFileSize(size: number): ValidationResult {
  if (size <= 0) {
    return { valid: false, error: 'File is empty' };
  }
  if (size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File exceeds maximum size of ${formatFileSize(MAX_FILE_SIZE)}`,
    };
  }
  return { valid: true };
}

/**
 * Validate that uploading a new file would not exceed the user's total quota.
 *
 * @param currentUsage - Current total usage in bytes
 * @param newFileSize - Size of the file to upload in bytes
 */
export function validateQuota(currentUsage: number, newFileSize: number): ValidationResult {
  if (currentUsage + newFileSize > MAX_TOTAL_QUOTA) {
    const remaining = Math.max(0, MAX_TOTAL_QUOTA - currentUsage);
    return {
      valid: false,
      error: `Quota exceeded. ${formatFileSize(remaining)} remaining of ${formatFileSize(MAX_TOTAL_QUOTA)}`,
    };
  }
  return { valid: true };
}
