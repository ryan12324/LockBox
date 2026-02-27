/**
 * Tests for version history view utilities.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MAX_VERSIONS,
  formatRelativeTime,
  toVersionListItem,
  processVersionList,
  getVersionSummary,
  type ItemVersion,
} from '../views/version-history';

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeVersion(overrides: Partial<ItemVersion> = {}): ItemVersion {
  return {
    id: 'ver-1',
    revisionDate: '2025-02-01T12:00:00.000Z',
    createdAt: '2025-02-01T12:00:00.000Z',
    ...overrides,
  };
}

// ─── MAX_VERSIONS ─────────────────────────────────────────────────────────────

describe('MAX_VERSIONS', () => {
  it('is 10', () => {
    expect(MAX_VERSIONS).toBe(10);
  });
});

// ─── formatRelativeTime ───────────────────────────────────────────────────────

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-02-10T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "Just now" for less than 1 minute ago', () => {
    const dateStr = new Date(Date.now() - 30_000).toISOString();
    expect(formatRelativeTime(dateStr)).toBe('Just now');
  });

  it('returns minutes ago for < 60 minutes', () => {
    const dateStr = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(formatRelativeTime(dateStr)).toBe('5m ago');
  });

  it('returns hours ago for < 24 hours', () => {
    const dateStr = new Date(Date.now() - 3 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(dateStr)).toBe('3h ago');
  });

  it('returns days ago for < 30 days', () => {
    const dateStr = new Date(Date.now() - 5 * 24 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(dateStr)).toBe('5d ago');
  });

  it('returns locale date for >= 30 days', () => {
    const dateStr = new Date(Date.now() - 60 * 24 * 60 * 60_000).toISOString();
    const result = formatRelativeTime(dateStr);
    // Should be a locale date string, not a relative time
    expect(result).not.toContain('ago');
    expect(result).not.toBe('Just now');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ─── toVersionListItem ────────────────────────────────────────────────────────

describe('toVersionListItem', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-02-10T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('converts ItemVersion to VersionListItem', () => {
    const version = makeVersion();
    const result = toVersionListItem(version);
    expect(result.id).toBe('ver-1');
    expect(result.revisionDate).toBe('2025-02-01T12:00:00.000Z');
    expect(result.createdAt).toBe('2025-02-01T12:00:00.000Z');
    expect(typeof result.relativeTime).toBe('string');
    expect(typeof result.formattedDate).toBe('string');
  });

  it('includes relativeTime from revisionDate', () => {
    const recent = makeVersion({
      revisionDate: new Date(Date.now() - 5 * 60_000).toISOString(),
    });
    const result = toVersionListItem(recent);
    expect(result.relativeTime).toBe('5m ago');
  });

  it('includes formatted date string', () => {
    const version = makeVersion();
    const result = toVersionListItem(version);
    expect(result.formattedDate.length).toBeGreaterThan(0);
  });
});

// ─── processVersionList ───────────────────────────────────────────────────────

describe('processVersionList', () => {
  it('sorts by revisionDate descending (newest first)', () => {
    const versions = [
      makeVersion({ id: 'old', revisionDate: '2025-01-01T00:00:00.000Z' }),
      makeVersion({ id: 'new', revisionDate: '2025-02-10T00:00:00.000Z' }),
      makeVersion({ id: 'mid', revisionDate: '2025-01-15T00:00:00.000Z' }),
    ];
    const result = processVersionList(versions);
    expect(result[0].id).toBe('new');
    expect(result[1].id).toBe('mid');
    expect(result[2].id).toBe('old');
  });

  it('returns empty array for empty input', () => {
    expect(processVersionList([])).toHaveLength(0);
  });

  it('does not mutate the original array', () => {
    const versions = [
      makeVersion({ id: 'a', revisionDate: '2025-02-01T00:00:00.000Z' }),
      makeVersion({ id: 'b', revisionDate: '2025-01-01T00:00:00.000Z' }),
    ];
    const originalFirst = versions[0].id;
    processVersionList(versions);
    expect(versions[0].id).toBe(originalFirst);
  });

  it('maps all items to VersionListItem', () => {
    const versions = [makeVersion({ id: 'v1' }), makeVersion({ id: 'v2' })];
    const result = processVersionList(versions);
    expect(result).toHaveLength(2);
    for (const item of result) {
      expect(item).toHaveProperty('relativeTime');
      expect(item).toHaveProperty('formattedDate');
    }
  });
});

// ─── getVersionSummary ────────────────────────────────────────────────────────

describe('getVersionSummary', () => {
  it('returns "No history" for empty list', () => {
    expect(getVersionSummary([])).toBe('No history');
  });

  it('returns "1 version" for single item', () => {
    const items = processVersionList([makeVersion()]);
    expect(getVersionSummary(items)).toBe('1 version');
  });

  it('returns "N versions" for multiple items', () => {
    const items = processVersionList([
      makeVersion({ id: 'v1', revisionDate: '2025-02-01T00:00:00.000Z' }),
      makeVersion({ id: 'v2', revisionDate: '2025-02-02T00:00:00.000Z' }),
      makeVersion({ id: 'v3', revisionDate: '2025-02-03T00:00:00.000Z' }),
      makeVersion({ id: 'v4', revisionDate: '2025-02-04T00:00:00.000Z' }),
      makeVersion({ id: 'v5', revisionDate: '2025-02-05T00:00:00.000Z' }),
    ]);
    expect(getVersionSummary(items)).toBe('5 versions');
  });
});
