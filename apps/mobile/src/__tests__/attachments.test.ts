import { describe, it, expect } from 'vitest';
import {
  MAX_FILE_SIZE,
  MAX_TOTAL_QUOTA,
  formatFileSize,
  getAttachmentIcon,
  isImageAttachment,
  toAttachmentListItem,
  processAttachmentList,
  getAttachmentSummary,
  validateFileSize,
  validateQuota,
  type AttachmentListItem,
} from '../views/attachments';

// ─── Constants ────────────────────────────────────────────────────────────────

describe('attachment constants', () => {
  it('MAX_FILE_SIZE is 10 MB', () => {
    expect(MAX_FILE_SIZE).toBe(10 * 1024 * 1024);
  });

  it('MAX_TOTAL_QUOTA is 100 MB', () => {
    expect(MAX_TOTAL_QUOTA).toBe(100 * 1024 * 1024);
  });
});

// ─── formatFileSize ───────────────────────────────────────────────────────────

describe('formatFileSize', () => {
  it('formats bytes', () => {
    expect(formatFileSize(500)).toBe('500 B');
  });

  it('formats zero bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(2048)).toBe('2.0 KB');
  });

  it('formats megabytes', () => {
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('formats gigabytes', () => {
    expect(formatFileSize(2 * 1024 * 1024 * 1024)).toBe('2.0 GB');
  });

  it('formats fractional kilobytes', () => {
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });

  it('formats fractional megabytes', () => {
    expect(formatFileSize(2.1 * 1024 * 1024)).toBe('2.1 MB');
  });

  it('handles negative values as 0 B', () => {
    expect(formatFileSize(-100)).toBe('0 B');
  });

  it('formats 1023 bytes as bytes', () => {
    expect(formatFileSize(1023)).toBe('1023 B');
  });

  it('formats 1024 bytes as 1.0 KB', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
  });
});

// ─── getAttachmentIcon ────────────────────────────────────────────────────────

describe('getAttachmentIcon', () => {
  it('returns image for image types', () => {
    expect(getAttachmentIcon('image/png')).toBe('image');
    expect(getAttachmentIcon('image/jpeg')).toBe('image');
    expect(getAttachmentIcon('image/svg+xml')).toBe('image');
  });

  it('returns video for video types', () => {
    expect(getAttachmentIcon('video/mp4')).toBe('video');
  });

  it('returns audio for audio types', () => {
    expect(getAttachmentIcon('audio/mpeg')).toBe('audio');
  });

  it('returns pdf for PDF', () => {
    expect(getAttachmentIcon('application/pdf')).toBe('pdf');
  });

  it('returns archive for zip/gzip/tar', () => {
    expect(getAttachmentIcon('application/zip')).toBe('archive');
    expect(getAttachmentIcon('application/gzip')).toBe('archive');
    expect(getAttachmentIcon('application/x-tar')).toBe('archive');
  });

  it('returns text for text types', () => {
    expect(getAttachmentIcon('text/plain')).toBe('text');
    expect(getAttachmentIcon('text/csv')).toBe('text');
    expect(getAttachmentIcon('application/json')).toBe('text');
  });

  it('returns document for Word files', () => {
    expect(getAttachmentIcon('application/msword')).toBe('document');
    expect(
      getAttachmentIcon('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    ).toBe('document');
  });

  it('returns spreadsheet for Excel files', () => {
    expect(getAttachmentIcon('application/vnd.ms-excel')).toBe('spreadsheet');
    expect(
      getAttachmentIcon('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    ).toBe('spreadsheet');
  });

  it('returns file for unknown types', () => {
    expect(getAttachmentIcon('application/octet-stream')).toBe('file');
    expect(getAttachmentIcon('application/x-custom')).toBe('file');
  });
});

// ─── isImageAttachment ────────────────────────────────────────────────────────

describe('isImageAttachment', () => {
  it('returns true for PNG', () => {
    expect(isImageAttachment('image/png')).toBe(true);
  });

  it('returns true for JPEG', () => {
    expect(isImageAttachment('image/jpeg')).toBe(true);
  });

  it('returns true for GIF', () => {
    expect(isImageAttachment('image/gif')).toBe(true);
  });

  it('returns true for WebP', () => {
    expect(isImageAttachment('image/webp')).toBe(true);
  });

  it('returns true for SVG', () => {
    expect(isImageAttachment('image/svg+xml')).toBe(true);
  });

  it('returns true for BMP', () => {
    expect(isImageAttachment('image/bmp')).toBe(true);
  });

  it('returns false for TIFF', () => {
    expect(isImageAttachment('image/tiff')).toBe(false);
  });

  it('returns false for non-image types', () => {
    expect(isImageAttachment('application/pdf')).toBe(false);
    expect(isImageAttachment('text/plain')).toBe(false);
  });
});

// ─── toAttachmentListItem ─────────────────────────────────────────────────────

describe('toAttachmentListItem', () => {
  it('converts raw attachment to AttachmentListItem', () => {
    const raw = {
      id: 'att-1',
      fileName: 'photo.png',
      fileSize: 1024,
      mimeType: 'image/png',
      createdAt: '2025-01-15T10:00:00.000Z',
    };
    const result = toAttachmentListItem(raw);
    expect(result.id).toBe('att-1');
    expect(result.fileName).toBe('photo.png');
    expect(result.fileSize).toBe(1024);
    expect(result.mimeType).toBe('image/png');
    expect(result.createdAt).toBe('2025-01-15T10:00:00.000Z');
  });
});

// ─── processAttachmentList ────────────────────────────────────────────────────

describe('processAttachmentList', () => {
  it('sorts by createdAt descending (newest first)', () => {
    const items = [
      {
        id: 'a',
        fileName: 'old.txt',
        fileSize: 100,
        mimeType: 'text/plain',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
      {
        id: 'b',
        fileName: 'new.txt',
        fileSize: 200,
        mimeType: 'text/plain',
        createdAt: '2025-02-01T00:00:00.000Z',
      },
      {
        id: 'c',
        fileName: 'mid.txt',
        fileSize: 150,
        mimeType: 'text/plain',
        createdAt: '2025-01-15T00:00:00.000Z',
      },
    ];
    const result = processAttachmentList(items);
    expect(result[0].id).toBe('b');
    expect(result[1].id).toBe('c');
    expect(result[2].id).toBe('a');
  });

  it('returns empty array for empty input', () => {
    expect(processAttachmentList([])).toHaveLength(0);
  });

  it('processes single item', () => {
    const items = [
      {
        id: 'x',
        fileName: 'test.pdf',
        fileSize: 5000,
        mimeType: 'application/pdf',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    ];
    const result = processAttachmentList(items);
    expect(result).toHaveLength(1);
    expect(result[0].fileName).toBe('test.pdf');
  });
});

// ─── getAttachmentSummary ─────────────────────────────────────────────────────

describe('getAttachmentSummary', () => {
  it('returns "No attachments" for empty list', () => {
    expect(getAttachmentSummary([])).toBe('No attachments');
  });

  it('returns singular "1 file" for single item', () => {
    const items: AttachmentListItem[] = [
      {
        id: 'a',
        fileName: 'file.txt',
        fileSize: 1024,
        mimeType: 'text/plain',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    ];
    const summary = getAttachmentSummary(items);
    expect(summary).toBe('1 file, 1.0 KB');
  });

  it('returns plural "N files" for multiple items', () => {
    const items: AttachmentListItem[] = [
      {
        id: 'a',
        fileName: 'a.txt',
        fileSize: 1024,
        mimeType: 'text/plain',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
      {
        id: 'b',
        fileName: 'b.txt',
        fileSize: 2048,
        mimeType: 'text/plain',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
      {
        id: 'c',
        fileName: 'c.txt',
        fileSize: 512,
        mimeType: 'text/plain',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    ];
    const summary = getAttachmentSummary(items);
    expect(summary).toBe('3 files, 3.5 KB');
  });
});

// ─── validateFileSize ─────────────────────────────────────────────────────────

describe('validateFileSize', () => {
  it('passes for valid file size', () => {
    const result = validateFileSize(1024);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('fails for zero-byte file', () => {
    const result = validateFileSize(0);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('File is empty');
  });

  it('fails for negative size', () => {
    const result = validateFileSize(-1);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('File is empty');
  });

  it('passes for exactly MAX_FILE_SIZE', () => {
    const result = validateFileSize(MAX_FILE_SIZE);
    expect(result.valid).toBe(true);
  });

  it('fails for size exceeding MAX_FILE_SIZE', () => {
    const result = validateFileSize(MAX_FILE_SIZE + 1);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('exceeds maximum size');
  });
});

// ─── validateQuota ────────────────────────────────────────────────────────────

describe('validateQuota', () => {
  it('passes when under quota', () => {
    const result = validateQuota(50 * 1024 * 1024, 10 * 1024 * 1024);
    expect(result.valid).toBe(true);
  });

  it('passes when exactly at quota', () => {
    const result = validateQuota(90 * 1024 * 1024, 10 * 1024 * 1024);
    expect(result.valid).toBe(true);
  });

  it('fails when exceeding quota', () => {
    const result = validateQuota(95 * 1024 * 1024, 10 * 1024 * 1024);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Quota exceeded');
    expect(result.error).toContain('remaining');
  });

  it('fails with zero remaining', () => {
    const result = validateQuota(MAX_TOTAL_QUOTA, 1);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('0 B remaining');
  });

  it('passes for zero current usage', () => {
    const result = validateQuota(0, 1024);
    expect(result.valid).toBe(true);
  });
});
