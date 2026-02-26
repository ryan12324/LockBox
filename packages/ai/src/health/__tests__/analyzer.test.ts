import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LoginItem } from '@lockbox/types';
import type { StrengthResult } from '@lockbox/generator';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@lockbox/generator', () => ({
  evaluateStrength: vi.fn(),
}));

import { evaluateStrength } from '@lockbox/generator';

const mockEvaluateStrength = vi.mocked(evaluateStrength);

/**
 * Deterministic SHA-256 mock: XOR-folds the input bytes into a 32-byte buffer.
 * Same input → same output, different input → (very likely) different output.
 */
vi.spyOn(crypto.subtle, 'digest').mockImplementation(
  async (_algorithm: AlgorithmIdentifier, data: BufferSource) => {
    const input = new Uint8Array(data instanceof ArrayBuffer ? data : (data as DataView).buffer);
    const result = new Uint8Array(32);
    for (let i = 0; i < input.length; i++) {
      result[i % 32] ^= input[i];
    }
    return result.buffer;
  }
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = '2026-02-26T00:00:00.000Z';

/** Utility to build a LoginItem with sensible defaults. */
function makeItem(overrides: Partial<LoginItem> & { id: string; password: string }): LoginItem {
  return {
    type: 'login',
    name: `Item ${overrides.id}`,
    username: 'user',
    uris: ['https://example.com'],
    tags: [],
    favorite: false,
    createdAt: NOW,
    updatedAt: NOW,
    revisionDate: NOW,
    ...overrides,
  };
}

function strengthOf(score: 0 | 1 | 2 | 3 | 4): StrengthResult {
  return { score, entropy: score * 10, feedback: [] };
}

/** Date string N days before NOW. */
function daysAgo(n: number): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Import SUT (after mocks are set up)
// ---------------------------------------------------------------------------

import { analyzeVaultHealth, analyzeItem } from '../analyzer.js';

// ---------------------------------------------------------------------------
// Tests — analyzeVaultHealth
// ---------------------------------------------------------------------------

describe('analyzeVaultHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: strong password
    mockEvaluateStrength.mockReturnValue(strengthOf(4));
  });

  it('returns perfect score for empty vault', async () => {
    const result = await analyzeVaultHealth([]);

    expect(result).toEqual({
      totalItems: 0,
      weak: 0,
      reused: 0,
      old: 0,
      breached: 0,
      strong: 0,
      overallScore: 100,
    });
    expect(mockEvaluateStrength).not.toHaveBeenCalled();
  });

  it('scores 100 when all passwords are strong, unique, and recent', async () => {
    mockEvaluateStrength.mockReturnValue(strengthOf(4));

    const items = [
      makeItem({ id: '1', password: 'Str0ng!Pass#1' }),
      makeItem({ id: '2', password: 'Str0ng!Pass#2' }),
      makeItem({ id: '3', password: 'Str0ng!Pass#3' }),
    ];

    const result = await analyzeVaultHealth(items);

    expect(result.totalItems).toBe(3);
    expect(result.strong).toBe(3);
    expect(result.weak).toBe(0);
    expect(result.reused).toBe(0);
    expect(result.old).toBe(0);
    expect(result.breached).toBe(0);
    expect(result.overallScore).toBe(100);
  });

  it('detects all-weak passwords and reports low overall score', async () => {
    mockEvaluateStrength.mockReturnValue(strengthOf(1));

    const items = [
      makeItem({ id: '1', password: 'abc' }),
      makeItem({ id: '2', password: 'def' }),
      makeItem({ id: '3', password: 'ghi' }),
    ];

    const result = await analyzeVaultHealth(items);

    expect(result.weak).toBe(3);
    expect(result.strong).toBe(0);
    expect(result.reused).toBe(0);
    expect(result.old).toBe(0);
    // strongPct=0, uniquePct=1, recentPct=1 → (0+1+1)/3 ≈ 67
    expect(result.overallScore).toBe(67);
  });

  it('detects reused passwords across items', async () => {
    mockEvaluateStrength.mockReturnValue(strengthOf(4));

    const items = [
      makeItem({ id: '1', password: 'SharedSecret!' }),
      makeItem({ id: '2', password: 'SharedSecret!' }),
      makeItem({ id: '3', password: 'UniquePass99!' }),
    ];

    const result = await analyzeVaultHealth(items);

    expect(result.reused).toBe(2);
    expect(result.strong).toBe(3);
    expect(result.old).toBe(0);
    // strongPct=1, uniquePct=1/3, recentPct=1 → (1+0.333+1)/3 ≈ 78
    expect(result.overallScore).toBe(78);
  });

  it('detects old passwords beyond the default 90-day threshold', async () => {
    mockEvaluateStrength.mockReturnValue(strengthOf(4));

    const items = [
      makeItem({ id: '1', password: 'Fresh1!', updatedAt: NOW }),
      makeItem({ id: '2', password: 'Stale2!', updatedAt: daysAgo(91) }),
      makeItem({ id: '3', password: 'Stale3!', updatedAt: daysAgo(180) }),
    ];

    const result = await analyzeVaultHealth(items);

    expect(result.old).toBe(2);
    expect(result.strong).toBe(3);
    expect(result.reused).toBe(0);
    // strongPct=1, uniquePct=1, recentPct=1/3 → (1+1+0.333)/3 ≈ 78
    expect(result.overallScore).toBe(78);
  });

  it('respects custom ageThresholdDays', async () => {
    mockEvaluateStrength.mockReturnValue(strengthOf(4));

    const items = [makeItem({ id: '1', password: 'Pass1!', updatedAt: daysAgo(31) })];

    // Default 90 days → not old
    const resultDefault = await analyzeVaultHealth(items);
    expect(resultDefault.old).toBe(0);

    // Custom 30 days → old
    const resultCustom = await analyzeVaultHealth(items, { ageThresholdDays: 30 });
    expect(resultCustom.old).toBe(1);
  });

  it('handles mixed vault: weak + reused + old', async () => {
    // Item 1: weak, unique, recent
    // Item 2: strong, reused, recent
    // Item 3: strong, reused, old
    // Item 4: strong, unique, old
    mockEvaluateStrength
      .mockReturnValueOnce(strengthOf(1)) // item 1: weak
      .mockReturnValueOnce(strengthOf(4)) // item 2: strong
      .mockReturnValueOnce(strengthOf(4)) // item 3: strong
      .mockReturnValueOnce(strengthOf(3)); // item 4: strong

    const items = [
      makeItem({ id: '1', password: 'abc', updatedAt: NOW }),
      makeItem({ id: '2', password: 'SharedPass!', updatedAt: NOW }),
      makeItem({ id: '3', password: 'SharedPass!', updatedAt: daysAgo(120) }),
      makeItem({ id: '4', password: 'UniqueOld!', updatedAt: daysAgo(100) }),
    ];

    const result = await analyzeVaultHealth(items);

    expect(result.totalItems).toBe(4);
    expect(result.weak).toBe(1);
    expect(result.strong).toBe(3);
    expect(result.reused).toBe(2);
    expect(result.old).toBe(2);
    expect(result.breached).toBe(0);
    // strongPct=3/4, uniquePct=2/4, recentPct=2/4 → (0.75+0.5+0.5)/3 ≈ 58
    expect(result.overallScore).toBe(58);
  });

  it('sets breached to 0 (breach checking not implemented here)', async () => {
    const items = [makeItem({ id: '1', password: 'Test123!' })];
    const result = await analyzeVaultHealth(items);
    expect(result.breached).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests — analyzeItem
// ---------------------------------------------------------------------------

describe('analyzeItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEvaluateStrength.mockReturnValue(strengthOf(4));
  });

  it('returns no issues for a strong, unique, recent item', async () => {
    mockEvaluateStrength.mockReturnValue(strengthOf(4));

    const item = makeItem({ id: '1', password: 'StrongUnique!1' });
    const allItems = [item, makeItem({ id: '2', password: 'DifferentPass!2' })];

    const report = await analyzeItem(item, allItems);

    expect(report.itemId).toBe('1');
    expect(report.score).toBe(4);
    expect(report.issues).toEqual([]);
    expect(report.lastChecked).toBeTruthy();
  });

  it('flags weak password with correct score', async () => {
    mockEvaluateStrength.mockReturnValue(strengthOf(2));

    const item = makeItem({ id: '1', password: 'weak' });
    const report = await analyzeItem(item, [item]);

    expect(report.score).toBe(2);
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]).toEqual({ type: 'weak', score: 2 });
  });

  it('flags reused password and lists sharedWith IDs', async () => {
    mockEvaluateStrength.mockReturnValue(strengthOf(4));

    const items = [
      makeItem({ id: 'a', password: 'SamePass!' }),
      makeItem({ id: 'b', password: 'SamePass!' }),
      makeItem({ id: 'c', password: 'SamePass!' }),
      makeItem({ id: 'd', password: 'Different!' }),
    ];

    const report = await analyzeItem(items[0], items);

    const reuseIssue = report.issues.find((i) => i.type === 'reused');
    expect(reuseIssue).toBeDefined();
    if (reuseIssue?.type === 'reused') {
      expect(reuseIssue.sharedWith).toEqual(['b', 'c']);
    }
  });

  it('flags old password with correct daysSinceChange', async () => {
    mockEvaluateStrength.mockReturnValue(strengthOf(4));

    const item = makeItem({
      id: '1',
      password: 'OldPass!',
      updatedAt: daysAgo(120),
    });

    const report = await analyzeItem(item, [item]);

    const oldIssue = report.issues.find((i) => i.type === 'old');
    expect(oldIssue).toBeDefined();
    if (oldIssue?.type === 'old') {
      expect(oldIssue.daysSinceChange).toBe(120);
    }
  });

  it('reports multiple issues on the same item', async () => {
    mockEvaluateStrength.mockReturnValue(strengthOf(0));

    const items = [
      makeItem({ id: '1', password: '123', updatedAt: daysAgo(200) }),
      makeItem({ id: '2', password: '123', updatedAt: NOW }),
    ];

    const report = await analyzeItem(items[0], items);

    expect(report.score).toBe(0);
    expect(report.issues).toHaveLength(3);

    const types = report.issues.map((i) => i.type);
    expect(types).toContain('weak');
    expect(types).toContain('reused');
    expect(types).toContain('old');
  });

  it('does not flag a 90-day-old password as old (boundary)', async () => {
    mockEvaluateStrength.mockReturnValue(strengthOf(4));

    const item = makeItem({
      id: '1',
      password: 'Boundary!',
      updatedAt: daysAgo(90),
    });

    const report = await analyzeItem(item, [item]);
    const oldIssue = report.issues.find((i) => i.type === 'old');
    expect(oldIssue).toBeUndefined();
  });

  it('flags a 91-day-old password as old (boundary)', async () => {
    mockEvaluateStrength.mockReturnValue(strengthOf(4));

    const item = makeItem({
      id: '1',
      password: 'Boundary91!',
      updatedAt: daysAgo(91),
    });

    const report = await analyzeItem(item, [item]);
    const oldIssue = report.issues.find((i) => i.type === 'old');
    expect(oldIssue).toBeDefined();
  });

  it('respects custom ageThresholdDays option', async () => {
    mockEvaluateStrength.mockReturnValue(strengthOf(4));

    const item = makeItem({
      id: '1',
      password: 'Custom!',
      updatedAt: daysAgo(45),
    });

    // Default (90 days) → not old
    const defaultReport = await analyzeItem(item, [item]);
    expect(defaultReport.issues.find((i) => i.type === 'old')).toBeUndefined();

    // Custom 30 days → old
    const customReport = await analyzeItem(item, [item], { ageThresholdDays: 30 });
    expect(customReport.issues.find((i) => i.type === 'old')).toBeDefined();
  });

  it('returns lastChecked as a valid ISO 8601 timestamp', async () => {
    const item = makeItem({ id: '1', password: 'Test!' });
    const report = await analyzeItem(item, [item]);

    // Should parse without NaN
    const parsed = new Date(report.lastChecked);
    expect(parsed.getTime()).not.toBeNaN();
  });
});
