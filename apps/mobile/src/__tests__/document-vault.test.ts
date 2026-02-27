/**
 * Tests for Document Vault view — rendering, file size formatting,
 * preview detection, upload/download, and quota management.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  formatFileSize,
  getDocumentIcon,
  getPreviewType,
  canPreviewDocument,
  renderDocumentItem,
  renderDocumentDetail,
  uploadDocument,
  downloadDocument,
  getDocumentQuota,
} from '../views/document-vault';
import type {
  DocumentPreviewType,
  DocumentListItemData,
  DocumentDetailData,
  DocumentQuota,
} from '../views/document-vault';
import type { DocumentItem } from '@lockbox/types';

// ─── Mock fetch ───────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDocumentItem(overrides: Partial<DocumentItem> = {}): DocumentItem {
  return {
    id: 'doc-1',
    type: 'document',
    name: 'test-document.pdf',
    mimeType: 'application/pdf',
    size: 1024,
    tags: ['important'],
    favorite: false,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    revisionDate: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeJsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024)),
    headers: new Headers(),
  } as Response;
}

// ─── formatFileSize ──────────────────────────────────────────────────────────

describe('formatFileSize', () => {
  it('formats 0 bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });

  it('formats bytes (< 1024)', () => {
    expect(formatFileSize(512)).toBe('512 B');
  });

  it('formats 1 byte', () => {
    expect(formatFileSize(1)).toBe('1 B');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
  });

  it('formats kilobytes with decimal', () => {
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });

  it('formats megabytes', () => {
    expect(formatFileSize(1048576)).toBe('1.00 MB');
  });

  it('formats megabytes with decimal', () => {
    expect(formatFileSize(1572864)).toBe('1.50 MB');
  });

  it('formats gigabytes', () => {
    expect(formatFileSize(1073741824)).toBe('1.00 GB');
  });

  it('formats terabytes', () => {
    expect(formatFileSize(1099511627776)).toBe('1.00 TB');
  });

  it('formats negative as 0 B', () => {
    expect(formatFileSize(-100)).toBe('0 B');
  });

  it('formats large byte value', () => {
    expect(formatFileSize(999)).toBe('999 B');
  });

  it('formats 10 MB', () => {
    const result = formatFileSize(10 * 1024 * 1024);
    expect(result).toBe('10.00 MB');
  });
});

// ─── getDocumentIcon ──────────────────────────────────────────────────────────

describe('getDocumentIcon', () => {
  it('returns file-pdf for PDF', () => {
    expect(getDocumentIcon('application/pdf')).toBe('file-pdf');
  });

  it('returns file-image for PNG', () => {
    expect(getDocumentIcon('image/png')).toBe('file-image');
  });

  it('returns file-image for JPEG', () => {
    expect(getDocumentIcon('image/jpeg')).toBe('file-image');
  });

  it('returns file-archive for ZIP', () => {
    expect(getDocumentIcon('application/zip')).toBe('file-archive');
  });

  it('returns file-text for plain text', () => {
    expect(getDocumentIcon('text/plain')).toBe('file-text');
  });

  it('returns file-code for JSON', () => {
    expect(getDocumentIcon('application/json')).toBe('file-code');
  });

  it('returns file for unknown MIME type', () => {
    expect(getDocumentIcon('application/octet-stream')).toBe('file');
  });

  it('returns file for empty string', () => {
    expect(getDocumentIcon('')).toBe('file');
  });
});

// ─── getPreviewType ──────────────────────────────────────────────────────────

describe('getPreviewType', () => {
  it('returns image for PNG', () => {
    expect(getPreviewType('image/png')).toBe('image');
  });

  it('returns image for JPEG', () => {
    expect(getPreviewType('image/jpeg')).toBe('image');
  });

  it('returns image for GIF', () => {
    expect(getPreviewType('image/gif')).toBe('image');
  });

  it('returns image for WebP', () => {
    expect(getPreviewType('image/webp')).toBe('image');
  });

  it('returns image for SVG', () => {
    expect(getPreviewType('image/svg+xml')).toBe('image');
  });

  it('returns pdf for PDF', () => {
    expect(getPreviewType('application/pdf')).toBe('pdf');
  });

  it('returns none for ZIP', () => {
    expect(getPreviewType('application/zip')).toBe('none');
  });

  it('returns none for unknown type', () => {
    expect(getPreviewType('application/octet-stream')).toBe('none');
  });

  it('returns none for plain text', () => {
    expect(getPreviewType('text/plain')).toBe('none');
  });
});

// ─── canPreviewDocument ──────────────────────────────────────────────────────

describe('canPreviewDocument', () => {
  it('returns true for images', () => {
    expect(canPreviewDocument('image/png')).toBe(true);
  });

  it('returns true for PDF', () => {
    expect(canPreviewDocument('application/pdf')).toBe(true);
  });

  it('returns false for ZIP', () => {
    expect(canPreviewDocument('application/zip')).toBe(false);
  });

  it('returns false for unknown types', () => {
    expect(canPreviewDocument('application/octet-stream')).toBe(false);
  });
});

// ─── renderDocumentItem ──────────────────────────────────────────────────────

describe('renderDocumentItem', () => {
  it('produces correct data for PDF', () => {
    const item = makeDocumentItem();
    const result = renderDocumentItem(item);
    expect(result.icon).toBe('file-pdf');
    expect(result.title).toBe('test-document.pdf');
    expect(result.mimeType).toBe('application/pdf');
    expect(result.size).toBe('1.0 KB');
  });

  it('uses description as subtitle when available', () => {
    const item = makeDocumentItem({ description: 'My passport scan' });
    const result = renderDocumentItem(item);
    expect(result.subtitle).toBe('My passport scan');
  });

  it('falls back to MIME type as subtitle', () => {
    const item = makeDocumentItem({ description: undefined });
    const result = renderDocumentItem(item);
    expect(result.subtitle).toBe('application/pdf');
  });

  it('handles image document', () => {
    const item = makeDocumentItem({ name: 'photo.png', mimeType: 'image/png', size: 2048 });
    const result = renderDocumentItem(item);
    expect(result.icon).toBe('file-image');
    expect(result.title).toBe('photo.png');
    expect(result.size).toBe('2.0 KB');
  });

  it('handles large file size', () => {
    const item = makeDocumentItem({ size: 5 * 1024 * 1024 });
    const result = renderDocumentItem(item);
    expect(result.size).toBe('5.00 MB');
  });
});

// ─── renderDocumentDetail ────────────────────────────────────────────────────

describe('renderDocumentDetail', () => {
  it('renders PDF with correct preview type', () => {
    const item = makeDocumentItem();
    const result = renderDocumentDetail(item);
    expect(result.previewType).toBe('pdf');
    expect(result.canPreview).toBe(true);
    expect(result.name).toBe('test-document.pdf');
  });

  it('renders image with correct preview type', () => {
    const item = makeDocumentItem({ mimeType: 'image/png' });
    const result = renderDocumentDetail(item);
    expect(result.previewType).toBe('image');
    expect(result.canPreview).toBe(true);
  });

  it('renders ZIP with no preview', () => {
    const item = makeDocumentItem({ mimeType: 'application/zip' });
    const result = renderDocumentDetail(item);
    expect(result.previewType).toBe('none');
    expect(result.canPreview).toBe(false);
  });

  it('includes formatted size', () => {
    const item = makeDocumentItem({ size: 1048576 });
    const result = renderDocumentDetail(item);
    expect(result.formattedSize).toBe('1.00 MB');
    expect(result.size).toBe('1048576');
  });

  it('includes tags', () => {
    const item = makeDocumentItem({ tags: ['personal', 'id'] });
    const result = renderDocumentDetail(item);
    expect(result.tags).toEqual(['personal', 'id']);
  });

  it('defaults description to empty string', () => {
    const item = makeDocumentItem({ description: undefined });
    const result = renderDocumentDetail(item);
    expect(result.description).toBe('');
  });

  it('includes description when present', () => {
    const item = makeDocumentItem({ description: 'Important doc' });
    const result = renderDocumentDetail(item);
    expect(result.description).toBe('Important doc');
  });

  it('includes mimeType', () => {
    const item = makeDocumentItem({ mimeType: 'image/jpeg' });
    const result = renderDocumentDetail(item);
    expect(result.mimeType).toBe('image/jpeg');
  });
});

// ─── uploadDocument ──────────────────────────────────────────────────────────

describe('uploadDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls correct API endpoint with PUT', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse({ size: 1024 }));

    await uploadDocument({
      apiUrl: 'https://api.lockbox.dev',
      token: 'token-123',
      itemId: 'doc-1',
      fileData: new ArrayBuffer(1024),
      contentType: 'application/pdf',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.lockbox.dev/api/vault/documents/doc-1',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          'Content-Type': 'application/pdf',
          Authorization: 'Bearer token-123',
        }),
      })
    );
  });

  it('returns success and size', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse({ size: 2048 }));

    const result = await uploadDocument({
      apiUrl: 'https://api.lockbox.dev',
      token: 'token',
      itemId: 'doc-1',
      fileData: new ArrayBuffer(2048),
      contentType: 'image/png',
    });

    expect(result.success).toBe(true);
    expect(result.size).toBe(2048);
  });

  it('throws on upload failure', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse({}, 413));

    await expect(
      uploadDocument({
        apiUrl: 'https://api.lockbox.dev',
        token: 'token',
        itemId: 'doc-1',
        fileData: new ArrayBuffer(100),
        contentType: 'application/pdf',
      })
    ).rejects.toThrow('Document upload failed: 413');
  });

  it('URL-encodes itemId', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse({ size: 100 }));

    await uploadDocument({
      apiUrl: 'https://api.lockbox.dev',
      token: 'token',
      itemId: 'doc/with+special',
      fileData: new ArrayBuffer(100),
      contentType: 'text/plain',
    });

    expect(mockFetch.mock.calls[0][0]).toContain('doc%2Fwith%2Bspecial');
  });
});

// ─── downloadDocument ────────────────────────────────────────────────────────

describe('downloadDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ArrayBuffer on success', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse({}));

    const result = await downloadDocument({
      apiUrl: 'https://api.lockbox.dev',
      token: 'token-123',
      itemId: 'doc-1',
    });

    expect(result).toBeInstanceOf(ArrayBuffer);
  });

  it('sends authorization header', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse({}));

    await downloadDocument({
      apiUrl: 'https://api.lockbox.dev',
      token: 'my-token',
      itemId: 'doc-1',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.lockbox.dev/api/vault/documents/doc-1',
      expect.objectContaining({
        headers: { Authorization: 'Bearer my-token' },
      })
    );
  });

  it('throws on download failure', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse({}, 404));

    await expect(
      downloadDocument({
        apiUrl: 'https://api.lockbox.dev',
        token: 'token',
        itemId: 'nonexistent',
      })
    ).rejects.toThrow('Document download failed: 404');
  });
});

// ─── getDocumentQuota ────────────────────────────────────────────────────────

describe('getDocumentQuota', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns formatted quota values', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse({ used: 5242880, limit: 104857600 }));

    const result = await getDocumentQuota('https://api.lockbox.dev', 'token');

    expect(result.used).toBe(5242880);
    expect(result.limit).toBe(104857600);
    expect(result.formattedUsed).toBe('5.00 MB');
    expect(result.formattedLimit).toBe('100.00 MB');
  });

  it('sends authorization header', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse({ used: 0, limit: 100 }));

    await getDocumentQuota('https://api.lockbox.dev', 'my-token');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.lockbox.dev/api/vault/documents/quota',
      expect.objectContaining({
        headers: { Authorization: 'Bearer my-token' },
      })
    );
  });

  it('throws on failure', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse({}, 500));

    await expect(getDocumentQuota('https://api.lockbox.dev', 'token')).rejects.toThrow(
      'Failed to get document quota: 500'
    );
  });

  it('formats zero usage', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse({ used: 0, limit: 1073741824 }));

    const result = await getDocumentQuota('https://api.lockbox.dev', 'token');
    expect(result.formattedUsed).toBe('0 B');
    expect(result.formattedLimit).toBe('1.00 GB');
  });
});

// ─── Type structures ──────────────────────────────────────────────────────────

describe('DocumentPreviewType', () => {
  it('accepts valid values', () => {
    const types: DocumentPreviewType[] = ['image', 'pdf', 'none'];
    expect(types).toHaveLength(3);
  });
});

describe('DocumentListItemData type', () => {
  it('matches expected shape', () => {
    const data: DocumentListItemData = {
      icon: 'file-pdf',
      title: 'doc.pdf',
      subtitle: 'A document',
      mimeType: 'application/pdf',
      size: '1.0 KB',
    };
    expect(data.icon).toBe('file-pdf');
    expect(data.title).toBe('doc.pdf');
  });
});

describe('DocumentDetailData type', () => {
  it('matches expected shape', () => {
    const data: DocumentDetailData = {
      name: 'doc.pdf',
      description: 'Test',
      mimeType: 'application/pdf',
      size: '1024',
      formattedSize: '1.0 KB',
      tags: ['test'],
      canPreview: true,
      previewType: 'pdf',
    };
    expect(data.canPreview).toBe(true);
    expect(data.previewType).toBe('pdf');
  });
});

describe('DocumentQuota type', () => {
  it('matches expected shape', () => {
    const quota: DocumentQuota = {
      used: 1000,
      limit: 10000,
      formattedUsed: '1000 B',
      formattedLimit: '9.8 KB',
    };
    expect(quota.used).toBe(1000);
    expect(quota.limit).toBe(10000);
  });
});
