import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BreachMonitor } from '../../health/breach.js';
import type { LoginItem } from '@lockbox/types';
import type { BreachCheckResult } from '@lockbox/types';

vi.mock('@lockbox/crypto', () => ({
  checkBatch: vi.fn(),
}));

import { checkBatch } from '@lockbox/crypto';
const mockCheckBatch = vi.mocked(checkBatch);

function makeLoginItem(
  overrides: Partial<LoginItem> & { id: string; password: string }
): LoginItem {
  return {
    type: 'login',
    name: 'Test Login',
    username: 'user@test.com',
    uris: ['https://example.com'],
    tags: [],
    favorite: false,
    folderId: undefined,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    revisionDate: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeBreachResult(found: boolean, count: number): BreachCheckResult {
  return {
    hashPrefix: 'ABCDE',
    found,
    count,
    checkedAt: new Date().toISOString(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BreachMonitor', () => {
  describe('checkAll', () => {
    it('should pass items to checkBatch and return results', async () => {
      const items = [
        makeLoginItem({ id: 'item-1', password: 'weak' }),
        makeLoginItem({ id: 'item-2', password: 'strong-unique-pass' }),
      ];

      const batchResults = new Map<string, BreachCheckResult>([
        ['item-1', makeBreachResult(true, 500)],
        ['item-2', makeBreachResult(false, 0)],
      ]);
      mockCheckBatch.mockResolvedValueOnce(batchResults);

      const monitor = new BreachMonitor();
      const results = await monitor.checkAll(items);

      expect(mockCheckBatch).toHaveBeenCalledWith([
        { id: 'item-1', password: 'weak' },
        { id: 'item-2', password: 'strong-unique-pass' },
      ]);
      expect(results.size).toBe(2);
      expect(results.get('item-1')?.found).toBe(true);
      expect(results.get('item-2')?.found).toBe(false);
    });
  });

  describe('onBreachFound callback', () => {
    it('should fire callback for each breached item', async () => {
      const breachedIds: string[] = [];
      const monitor = new BreachMonitor();
      monitor.onBreachFound((id) => breachedIds.push(id));

      const batchResults = new Map<string, BreachCheckResult>([
        ['item-1', makeBreachResult(true, 1000)],
        ['item-2', makeBreachResult(false, 0)],
        ['item-3', makeBreachResult(true, 5)],
      ]);
      mockCheckBatch.mockResolvedValueOnce(batchResults);

      await monitor.checkAll([
        makeLoginItem({ id: 'item-1', password: 'pw1' }),
        makeLoginItem({ id: 'item-2', password: 'pw2' }),
        makeLoginItem({ id: 'item-3', password: 'pw3' }),
      ]);

      expect(breachedIds).toEqual(['item-1', 'item-3']);
    });

    it('should not fire callback when no breaches found', async () => {
      const callback = vi.fn();
      const monitor = new BreachMonitor();
      monitor.onBreachFound(callback);

      mockCheckBatch.mockResolvedValueOnce(new Map([['item-1', makeBreachResult(false, 0)]]));

      await monitor.checkAll([makeLoginItem({ id: 'item-1', password: 'safe' })]);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('last check time', () => {
    it('should return null before any check', () => {
      const monitor = new BreachMonitor();
      expect(monitor.getLastCheckTime()).toBeNull();
    });

    it('should update after checkAll completes', async () => {
      mockCheckBatch.mockResolvedValueOnce(new Map());
      const monitor = new BreachMonitor();

      await monitor.checkAll([]);

      const lastCheck = monitor.getLastCheckTime();
      expect(lastCheck).toBeTruthy();
      expect(new Date(lastCheck!).getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('should persist manually set time', () => {
      const monitor = new BreachMonitor();
      const time = '2025-06-15T12:00:00.000Z';
      monitor.setLastCheckTime(time);
      expect(monitor.getLastCheckTime()).toBe(time);
    });
  });

  describe('constructor defaults', () => {
    it('should default to 24-hour interval', () => {
      const monitor = new BreachMonitor();
      expect(monitor.getIntervalMs()).toBe(86_400_000);
    });

    it('should accept custom interval', () => {
      const monitor = new BreachMonitor({ intervalMs: 60_000 });
      expect(monitor.getIntervalMs()).toBe(60_000);
    });
  });
});
