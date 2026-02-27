/**
 * Document Vault — rendering utilities, upload/download helpers,
 * and quota management for document-type vault items.
 *
 * Handles all DocumentItem display, file size formatting,
 * preview type detection, and API interactions for document storage.
 */

import type { DocumentItem } from '@lockbox/types';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Preview type for document items */
export type DocumentPreviewType = 'image' | 'pdf' | 'none';

/** Rendered document list item data */
export interface DocumentListItemData {
  icon: string;
  title: string;
  subtitle: string;
  mimeType: string;
  size: string;
}

/** Rendered document detail data */
export interface DocumentDetailData {
  name: string;
  description: string;
  mimeType: string;
  size: string;
  formattedSize: string;
  tags: string[];
  canPreview: boolean;
  previewType: DocumentPreviewType;
}

/** Document quota information */
export interface DocumentQuota {
  used: number;
  limit: number;
  formattedUsed: string;
  formattedLimit: string;
}

// ─── MIME Type Mappings ───────────────────────────────────────────────────────

/** MIME types that support image preview */
const IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
]);

/** MIME types that support PDF preview */
const PDF_MIME_TYPES = new Set(['application/pdf']);

/** MIME type to icon mapping */
const MIME_ICON_MAP: Record<string, string> = {
  'application/pdf': 'file-pdf',
  'image/png': 'file-image',
  'image/jpeg': 'file-image',
  'image/jpg': 'file-image',
  'image/gif': 'file-image',
  'image/webp': 'file-image',
  'image/svg+xml': 'file-image',
  'image/bmp': 'file-image',
  'application/zip': 'file-archive',
  'application/x-zip-compressed': 'file-archive',
  'application/gzip': 'file-archive',
  'text/plain': 'file-text',
  'text/csv': 'file-text',
  'text/html': 'file-code',
  'application/json': 'file-code',
  'application/xml': 'file-code',
  'application/msword': 'file-word',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'file-word',
  'application/vnd.ms-excel': 'file-spreadsheet',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'file-spreadsheet',
  'application/vnd.ms-powerpoint': 'file-presentation',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'file-presentation',
};

// ─── File Size Formatting ─────────────────────────────────────────────────────

/**
 * Format a file size in bytes to a human-readable string.
 * Uses binary units: B, KB, MB, GB, TB.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 0) return '0 B';
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
  const value = bytes / Math.pow(k, i);

  // Use integer for bytes, 1 decimal for KB, 2 decimals for MB+
  if (i === 0) return `${Math.round(value)} B`;
  if (i === 1) return `${value.toFixed(1)} KB`;
  return `${value.toFixed(2)} ${units[i]}`;
}

// ─── Icon Resolution ──────────────────────────────────────────────────────────

/**
 * Get the icon identifier for a MIME type.
 * Falls back to 'file' for unknown types.
 */
export function getDocumentIcon(mimeType: string): string {
  return MIME_ICON_MAP[mimeType] ?? 'file';
}

// ─── Preview Detection ────────────────────────────────────────────────────────

/**
 * Determine whether a document can be previewed and what type of preview.
 */
export function getPreviewType(mimeType: string): DocumentPreviewType {
  if (IMAGE_MIME_TYPES.has(mimeType)) return 'image';
  if (PDF_MIME_TYPES.has(mimeType)) return 'pdf';
  return 'none';
}

/**
 * Check if a document can be previewed in-app.
 */
export function canPreviewDocument(mimeType: string): boolean {
  return getPreviewType(mimeType) !== 'none';
}

// ─── Document List Rendering ──────────────────────────────────────────────────

/**
 * Render a document item for list display.
 * Returns icon, title, subtitle (description or MIME), formatted size.
 */
export function renderDocumentItem(item: DocumentItem): DocumentListItemData {
  return {
    icon: getDocumentIcon(item.mimeType),
    title: item.name,
    subtitle: item.description ?? item.mimeType,
    mimeType: item.mimeType,
    size: formatFileSize(item.size),
  };
}

// ─── Document Detail Rendering ────────────────────────────────────────────────

/**
 * Render a document item for detail/preview display.
 * Includes preview type detection and formatted size.
 */
export function renderDocumentDetail(item: DocumentItem): DocumentDetailData {
  const previewType = getPreviewType(item.mimeType);
  return {
    name: item.name,
    description: item.description ?? '',
    mimeType: item.mimeType,
    size: String(item.size),
    formattedSize: formatFileSize(item.size),
    tags: item.tags ?? [],
    canPreview: previewType !== 'none',
    previewType,
  };
}

// ─── Document Upload ──────────────────────────────────────────────────────────

/**
 * Upload an encrypted document file to the API.
 * Returns success status and the stored file size.
 */
export async function uploadDocument(options: {
  apiUrl: string;
  token: string;
  itemId: string;
  fileData: ArrayBuffer;
  contentType: string;
}): Promise<{ success: boolean; size: number }> {
  const { apiUrl, token, itemId, fileData, contentType } = options;

  const response = await fetch(`${apiUrl}/api/vault/documents/${encodeURIComponent(itemId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      Authorization: `Bearer ${token}`,
    },
    body: fileData,
  });

  if (!response.ok) {
    throw new Error(`Document upload failed: ${response.status}`);
  }

  const data = (await response.json()) as { size: number };
  return { success: true, size: data.size };
}

// ─── Document Download ────────────────────────────────────────────────────────

/**
 * Download an encrypted document file from the API.
 * Returns the raw ArrayBuffer of encrypted file data.
 */
export async function downloadDocument(options: {
  apiUrl: string;
  token: string;
  itemId: string;
}): Promise<ArrayBuffer> {
  const { apiUrl, token, itemId } = options;

  const response = await fetch(`${apiUrl}/api/vault/documents/${encodeURIComponent(itemId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Document download failed: ${response.status}`);
  }

  return response.arrayBuffer();
}

// ─── Document Quota ───────────────────────────────────────────────────────────

/**
 * Get the document storage quota for the current user.
 * Returns used/limit in bytes and formatted strings.
 */
export async function getDocumentQuota(apiUrl: string, token: string): Promise<DocumentQuota> {
  const response = await fetch(`${apiUrl}/api/vault/documents/quota`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to get document quota: ${response.status}`);
  }

  const data = (await response.json()) as { used: number; limit: number };
  return {
    used: data.used,
    limit: data.limit,
    formattedUsed: formatFileSize(data.used),
    formattedLimit: formatFileSize(data.limit),
  };
}
