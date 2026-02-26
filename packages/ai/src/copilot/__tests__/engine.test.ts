/**
 * Tests for SecurityCopilot engine and CopilotScheduler.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  LoginItem,
  SecurityAction,
  BreachCheckResult,
  VaultHealthSummary,
} from '@lockbox/types';
import { SecurityCopilot } from '../engine.js';
import type { ScoreHistory } from '../engine.js';
import { CopilotScheduler } from '../scheduler.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Build a minimal LoginItem for testing. */
function makeItem(overrides: Partial<LoginItem> & { id: string; name: string }): LoginItem {
  return {
    type: 'login',
    username: 'user@example.com',
    password: 'Str0ng!P@ssw0rd#2024',
    uris: ['https://example.com'],
    tags: [],
    favorite: false,
    folderId: undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    revisionDate: new Date().toISOString(),
    ...overrides,
  };
}

/** Create a date string N days in the past. */
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// SecurityCopilot — evaluate()
// ---------------------------------------------------------------------------

describe('SecurityCopilot', () => {
  let copilot: SecurityCopilot;

  beforeEach(() => {
    copilot = new SecurityCopilot();
  });

  // --- Score calculation ---

  describe('evaluate()', () => {
    it('returns score 100 for an empty vault', async () => {
      const posture = await copilot.evaluate([]);
      expect(posture.score).toBe(100);
      expect(posture.trend).toBe('stable');
      expect(posture.actions).toHaveLength(0);
    });

    it('returns a high score for a vault of all strong, unique, recent items', async () => {
      const vault = [
        makeItem({ id: '1', name: 'GitHub', password: 'xK#9pLm!vQ2w$Rz7' }),
        makeItem({ id: '2', name: 'Google', password: 'aB&3nYj*8dF!hT5q' }),
        makeItem({ id: '3', name: 'AWS', password: 'cW@6mPk#2sX$vN9e' }),
      ];
      const posture = await copilot.evaluate(vault);
      expect(posture.score).toBeGreaterThanOrEqual(80);
    });

    it('returns a low score for a vault of all weak, reused passwords', async () => {
      const vault = [
        makeItem({ id: '1', name: 'Site A', password: 'abc' }),
        makeItem({ id: '2', name: 'Site B', password: 'abc' }),
        makeItem({ id: '3', name: 'Site C', password: '123' }),
      ];
      const posture = await copilot.evaluate(vault);
      expect(posture.score).toBeLessThan(50);
    });

    it('calculates improving trend when score increases from previous', async () => {
      const vault = [makeItem({ id: '1', name: 'GitHub', password: 'xK#9pLm!vQ2w$Rz7' })];
      const posture = await copilot.evaluate(vault, { previousScore: 30 });
      expect(posture.trend).toBe('improving');
    });

    it('calculates declining trend when score decreases from previous', async () => {
      const vault = [
        makeItem({ id: '1', name: 'Site A', password: 'abc' }),
        makeItem({ id: '2', name: 'Site B', password: 'abc' }),
      ];
      const posture = await copilot.evaluate(vault, { previousScore: 95 });
      expect(posture.trend).toBe('declining');
    });

    it('calculates stable trend when score is close to previous', async () => {
      const vault = [makeItem({ id: '1', name: 'GitHub', password: 'xK#9pLm!vQ2w$Rz7' })];
      const posture = await copilot.evaluate(vault, { previousScore: 95 });
      expect(posture.trend).toBe('stable');
    });
  });

  // --- generateActions() ---

  describe('generateActions()', () => {
    const emptyHealth: VaultHealthSummary = {
      totalItems: 0,
      weak: 0,
      reused: 0,
      old: 0,
      breached: 0,
      strong: 0,
      overallScore: 100,
    };

    it('generates critical rotate actions for breached items', () => {
      const vault = [makeItem({ id: 'b1', name: 'Breached Site' })];
      const breachResults = new Map<string, BreachCheckResult>([
        [
          'b1',
          { hashPrefix: 'ABCDE', found: true, count: 42, checkedAt: new Date().toISOString() },
        ],
      ]);
      const health: VaultHealthSummary = { ...emptyHealth, totalItems: 1, strong: 1 };
      const actions = copilot.generateActions(vault, health, breachResults);

      const critical = actions.filter((a) => a.priority === 'critical');
      expect(critical).toHaveLength(1);
      expect(critical[0].type).toBe('rotate');
      expect(critical[0].affectedItems).toContain('b1');
      expect(critical[0].message).toContain('Breached Site');
      expect(critical[0].message).toContain('data breach');
    });

    it('does not generate breach actions for items not found in breaches', () => {
      const vault = [makeItem({ id: 'safe1', name: 'Safe Site' })];
      const breachResults = new Map<string, BreachCheckResult>([
        [
          'safe1',
          { hashPrefix: 'ABCDE', found: false, count: 0, checkedAt: new Date().toISOString() },
        ],
      ]);
      const health: VaultHealthSummary = { ...emptyHealth, totalItems: 1, strong: 1 };
      const actions = copilot.generateActions(vault, health, breachResults);

      const critical = actions.filter((a) => a.priority === 'critical');
      expect(critical).toHaveLength(0);
    });

    it('generates high deduplicate actions for reused passwords', () => {
      const vault = [
        makeItem({ id: 'r1', name: 'Site A', password: 'SharedPass!123' }),
        makeItem({ id: 'r2', name: 'Site B', password: 'SharedPass!123' }),
      ];
      const health: VaultHealthSummary = { ...emptyHealth, totalItems: 2, reused: 2 };
      const actions = copilot.generateActions(vault, health);

      const high = actions.filter((a) => a.priority === 'high' && a.type === 'deduplicate');
      expect(high.length).toBeGreaterThanOrEqual(2);
      expect(high[0].message).toContain('shares a password with');
    });

    it('generates medium strengthen actions for weak passwords', () => {
      const vault = [makeItem({ id: 'w1', name: 'Weak Site', password: 'abc' })];
      const health: VaultHealthSummary = { ...emptyHealth, totalItems: 1, weak: 1 };
      const actions = copilot.generateActions(vault, health);

      const medium = actions.filter((a) => a.priority === 'medium' && a.type === 'strengthen');
      expect(medium).toHaveLength(1);
      expect(medium[0].affectedItems).toContain('w1');
      expect(medium[0].message).toContain('weak');
    });

    it('generates low rotate actions for old passwords', () => {
      const vault = [
        makeItem({
          id: 'o1',
          name: 'Old Site',
          password: 'xK#9pLm!vQ2w$Rz7',
          updatedAt: daysAgo(120),
        }),
      ];
      const health: VaultHealthSummary = { ...emptyHealth, totalItems: 1, old: 1 };
      const actions = copilot.generateActions(vault, health);

      const low = actions.filter((a) => a.priority === 'low' && a.type === 'rotate');
      expect(low).toHaveLength(1);
      expect(low[0].affectedItems).toContain('o1');
      expect(low[0].message).toMatch(/hasn't been changed in \d+ days/);
    });

    it('does not generate old-password action for recently updated items', () => {
      const vault = [
        makeItem({
          id: 'recent1',
          name: 'Recent Site',
          password: 'xK#9pLm!vQ2w$Rz7',
          updatedAt: new Date().toISOString(),
        }),
      ];
      const health: VaultHealthSummary = { ...emptyHealth, totalItems: 1, strong: 1 };
      const actions = copilot.generateActions(vault, health);

      const low = actions.filter((a) => a.priority === 'low' && a.type === 'rotate');
      expect(low).toHaveLength(0);
    });

    it('generates enable-2fa actions for 2FA-capable domains without TOTP', () => {
      const vault = [
        makeItem({
          id: '2fa1',
          name: 'GitHub',
          password: 'xK#9pLm!vQ2w$Rz7',
          uris: ['https://github.com'],
        }),
      ];
      const health: VaultHealthSummary = { ...emptyHealth, totalItems: 1, strong: 1 };
      const actions = copilot.generateActions(vault, health);

      const twofa = actions.filter((a) => a.type === 'enable-2fa');
      expect(twofa).toHaveLength(1);
      expect(twofa[0].priority).toBe('medium');
      expect(twofa[0].affectedItems).toContain('2fa1');
      expect(twofa[0].message).toContain('2FA');
    });

    it('does not generate enable-2fa for items that already have TOTP', () => {
      const vault = [
        makeItem({
          id: '2fa2',
          name: 'GitHub',
          password: 'xK#9pLm!vQ2w$Rz7',
          uris: ['https://github.com'],
          totp: 'otpauth://totp/GitHub?secret=JBSWY3DPEHPK3PXP',
        }),
      ];
      const health: VaultHealthSummary = { ...emptyHealth, totalItems: 1, strong: 1 };
      const actions = copilot.generateActions(vault, health);

      const twofa = actions.filter((a) => a.type === 'enable-2fa');
      expect(twofa).toHaveLength(0);
    });

    it('does not generate enable-2fa for non-2FA-capable domains', () => {
      const vault = [
        makeItem({
          id: 'no2fa',
          name: 'Random Site',
          password: 'xK#9pLm!vQ2w$Rz7',
          uris: ['https://random-site.example.com'],
        }),
      ];
      const health: VaultHealthSummary = { ...emptyHealth, totalItems: 1, strong: 1 };
      const actions = copilot.generateActions(vault, health);

      const twofa = actions.filter((a) => a.type === 'enable-2fa');
      expect(twofa).toHaveLength(0);
    });

    it('sorts actions by priority: critical → high → medium → low', () => {
      const vault = [
        makeItem({ id: 'b1', name: 'Breached', password: 'abc' }),
        makeItem({ id: 'r1', name: 'Reuser A', password: 'SharedPass!123' }),
        makeItem({ id: 'r2', name: 'Reuser B', password: 'SharedPass!123' }),
        makeItem({
          id: 'o1',
          name: 'Old GitHub',
          password: 'xK#9pLm!vQ2w$Rz7',
          uris: ['https://github.com'],
          updatedAt: daysAgo(120),
        }),
      ];
      const breachResults = new Map<string, BreachCheckResult>([
        ['b1', { hashPrefix: 'ABCDE', found: true, count: 5, checkedAt: new Date().toISOString() }],
      ]);
      const health: VaultHealthSummary = {
        ...emptyHealth,
        totalItems: 4,
        weak: 1,
        reused: 2,
        old: 1,
        breached: 1,
      };
      const actions = copilot.generateActions(vault, health, breachResults);

      // Verify ordering
      const priorities = actions.map((a) => a.priority);
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      for (let i = 1; i < priorities.length; i++) {
        expect(order[priorities[i]]).toBeGreaterThanOrEqual(order[priorities[i - 1]]);
      }

      // Verify critical comes first
      expect(priorities[0]).toBe('critical');
    });

    it('generates no actions for a healthy vault with no issues', () => {
      const vault = [
        makeItem({
          id: 'h1',
          name: 'Perfect',
          password: 'xK#9pLm!vQ2w$Rz7',
          uris: ['https://example.com'],
        }),
      ];
      const health: VaultHealthSummary = {
        ...emptyHealth,
        totalItems: 1,
        strong: 1,
        overallScore: 100,
      };
      const actions = copilot.generateActions(vault, health);
      expect(actions).toHaveLength(0);
    });
  });

  // --- calculateTrend() ---

  describe('calculateTrend()', () => {
    it('returns stable for empty history', () => {
      expect(copilot.calculateTrend([])).toBe('stable');
    });

    it('returns stable for a single data point', () => {
      const history: ScoreHistory[] = [{ date: '2024-01-01', score: 75, actionCount: 3 }];
      expect(copilot.calculateTrend(history)).toBe('stable');
    });

    it('returns improving when last score exceeds previous average by > 5', () => {
      const history: ScoreHistory[] = [
        { date: '2024-01-01', score: 50, actionCount: 5 },
        { date: '2024-01-02', score: 52, actionCount: 4 },
        { date: '2024-01-03', score: 48, actionCount: 5 },
        { date: '2024-01-04', score: 70, actionCount: 2 },
      ];
      expect(copilot.calculateTrend(history)).toBe('improving');
    });

    it('returns declining when last score is below previous average by > 5', () => {
      const history: ScoreHistory[] = [
        { date: '2024-01-01', score: 80, actionCount: 1 },
        { date: '2024-01-02', score: 82, actionCount: 1 },
        { date: '2024-01-03', score: 78, actionCount: 2 },
        { date: '2024-01-04', score: 55, actionCount: 6 },
      ];
      expect(copilot.calculateTrend(history)).toBe('declining');
    });

    it('returns stable when last score is within 5 of previous average', () => {
      const history: ScoreHistory[] = [
        { date: '2024-01-01', score: 70, actionCount: 3 },
        { date: '2024-01-02', score: 72, actionCount: 2 },
        { date: '2024-01-03', score: 71, actionCount: 3 },
      ];
      expect(copilot.calculateTrend(history)).toBe('stable');
    });

    it('returns improving with exactly two data points when jump is large', () => {
      const history: ScoreHistory[] = [
        { date: '2024-01-01', score: 40, actionCount: 8 },
        { date: '2024-01-02', score: 80, actionCount: 2 },
      ];
      expect(copilot.calculateTrend(history)).toBe('improving');
    });

    it('returns declining with exactly two data points when drop is large', () => {
      const history: ScoreHistory[] = [
        { date: '2024-01-01', score: 90, actionCount: 1 },
        { date: '2024-01-02', score: 40, actionCount: 8 },
      ];
      expect(copilot.calculateTrend(history)).toBe('declining');
    });
  });
});

// ---------------------------------------------------------------------------
// CopilotScheduler
// ---------------------------------------------------------------------------

describe('CopilotScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('getLastPosture() returns null before any evaluation', () => {
    const scheduler = new CopilotScheduler();
    expect(scheduler.getLastPosture()).toBeNull();
  });

  it('evaluateNow() returns a security posture', async () => {
    const scheduler = new CopilotScheduler();
    const vault = [makeItem({ id: '1', name: 'Test', password: 'xK#9pLm!vQ2w$Rz7' })];
    const posture = await scheduler.evaluateNow(vault);

    expect(posture).toBeDefined();
    expect(posture.score).toBeGreaterThanOrEqual(0);
    expect(posture.score).toBeLessThanOrEqual(100);
    expect(posture.trend).toBe('stable');
    expect(Array.isArray(posture.actions)).toBe(true);
  });

  it('getLastPosture() returns posture after evaluation', async () => {
    const scheduler = new CopilotScheduler();
    const vault = [makeItem({ id: '1', name: 'Test', password: 'xK#9pLm!vQ2w$Rz7' })];
    await scheduler.evaluateNow(vault);

    const last = scheduler.getLastPosture();
    expect(last).not.toBeNull();
    expect(last?.score).toBeGreaterThanOrEqual(0);
  });

  it('isDue() returns true before any evaluation', () => {
    const scheduler = new CopilotScheduler({ evaluationIntervalMs: 60_000 });
    expect(scheduler.isDue()).toBe(true);
  });

  it('isDue() returns false right after evaluation, true after interval', async () => {
    const scheduler = new CopilotScheduler({ evaluationIntervalMs: 60_000 });
    await scheduler.evaluateNow([]);

    expect(scheduler.isDue()).toBe(false);

    // Advance time past the interval
    vi.advanceTimersByTime(60_001);
    expect(scheduler.isDue()).toBe(true);
  });

  it('start() and stop() manage interval lifecycle', () => {
    const scheduler = new CopilotScheduler({ evaluationIntervalMs: 1000 });
    const getVault = vi.fn(async () => []);

    scheduler.start(getVault);
    // Advance time to trigger interval
    vi.advanceTimersByTime(1001);
    expect(getVault).toHaveBeenCalled();

    scheduler.stop();
    getVault.mockClear();

    // After stop, advancing time should not trigger more calls
    vi.advanceTimersByTime(5000);
    expect(getVault).not.toHaveBeenCalled();
  });

  it('start() does not double-start if called twice', () => {
    const scheduler = new CopilotScheduler({ evaluationIntervalMs: 1000 });
    const getVault = vi.fn(async () => []);

    scheduler.start(getVault);
    scheduler.start(getVault); // Second call should be a no-op

    vi.advanceTimersByTime(1001);
    // Should only have one interval running, so only one call
    expect(getVault).toHaveBeenCalledTimes(1);

    scheduler.stop();
  });

  it('onPostureChange callback fires on evaluation', async () => {
    const onPostureChange = vi.fn();
    const scheduler = new CopilotScheduler({ onPostureChange });
    const vault = [makeItem({ id: '1', name: 'Test', password: 'xK#9pLm!vQ2w$Rz7' })];

    await scheduler.evaluateNow(vault);
    expect(onPostureChange).toHaveBeenCalledTimes(1);
    expect(onPostureChange).toHaveBeenCalledWith(
      expect.objectContaining({ score: expect.any(Number) })
    );
  });

  it('onCriticalAction callback fires for critical actions', async () => {
    const onCriticalAction = vi.fn();
    const scheduler = new CopilotScheduler({ onCriticalAction });
    const vault = [makeItem({ id: 'b1', name: 'Breached Site' })];
    const breachResults = new Map<string, BreachCheckResult>([
      ['b1', { hashPrefix: 'ABCDE', found: true, count: 10, checkedAt: new Date().toISOString() }],
    ]);

    await scheduler.evaluateNow(vault, breachResults);
    expect(onCriticalAction).toHaveBeenCalled();
    expect(onCriticalAction).toHaveBeenCalledWith(
      expect.objectContaining({ priority: 'critical', type: 'rotate' })
    );
  });

  it('respects maxNotificationsPerDay for onPostureChange', async () => {
    const onPostureChange = vi.fn();
    const scheduler = new CopilotScheduler({
      maxNotificationsPerDay: 1,
      onPostureChange,
    });

    await scheduler.evaluateNow([]);
    await scheduler.evaluateNow([]);
    await scheduler.evaluateNow([]);

    // Only 1 notification should have been sent
    expect(onPostureChange).toHaveBeenCalledTimes(1);
  });

  it('critical action callbacks fire regardless of notification limit', async () => {
    const onCriticalAction = vi.fn();
    const onPostureChange = vi.fn();
    const scheduler = new CopilotScheduler({
      maxNotificationsPerDay: 1,
      onPostureChange,
      onCriticalAction,
    });
    const vault = [makeItem({ id: 'b1', name: 'Breached' })];
    const breachResults = new Map<string, BreachCheckResult>([
      ['b1', { hashPrefix: 'ABCDE', found: true, count: 5, checkedAt: new Date().toISOString() }],
    ]);

    await scheduler.evaluateNow(vault, breachResults);
    await scheduler.evaluateNow(vault, breachResults);

    // Posture change limited to 1
    expect(onPostureChange).toHaveBeenCalledTimes(1);
    // Critical actions always fire
    expect(onCriticalAction).toHaveBeenCalledTimes(2);
  });

  it('passes breach results through start() getBreachResults callback', async () => {
    // Use real timers here because analyzeVaultHealth uses crypto.subtle.digest
    // which is a real async operation that fake timers cannot flush.
    vi.useRealTimers();

    const onCriticalAction = vi.fn();
    const scheduler = new CopilotScheduler({
      evaluationIntervalMs: 50,
      onCriticalAction,
    });
    const vault = [makeItem({ id: 'b1', name: 'Breached' })];
    const breachResults = new Map<string, BreachCheckResult>([
      ['b1', { hashPrefix: 'ABCDE', found: true, count: 5, checkedAt: new Date().toISOString() }],
    ]);

    scheduler.start(
      async () => vault,
      async () => breachResults,
    );

    // Wait for the interval to fire and the async evaluation to complete
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(onCriticalAction).toHaveBeenCalled();
    scheduler.stop();

    // Restore fake timers for afterEach cleanup
    vi.useFakeTimers();
  });
});
