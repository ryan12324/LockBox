import type { BreachCheckResult } from '@lockbox/types';
import type { LoginItem } from '@lockbox/types';
import { checkBatch } from '@lockbox/crypto';

type BreachCallback = (itemId: string, result: BreachCheckResult) => void;

export class BreachMonitor {
  private readonly intervalMs: number;
  private callbacks: BreachCallback[] = [];
  private lastCheckTime: string | null = null;

  constructor(options?: { intervalMs?: number }) {
    this.intervalMs = options?.intervalMs ?? 24 * 60 * 60 * 1000; // 24 hours
  }

  async checkAll(items: LoginItem[]): Promise<Map<string, BreachCheckResult>> {
    const passwords = items.map((item) => ({
      id: item.id,
      password: item.password,
    }));

    const results = await checkBatch(passwords);

    for (const [itemId, result] of results) {
      if (result.found) {
        for (const cb of this.callbacks) {
          cb(itemId, result);
        }
      }
    }

    this.lastCheckTime = new Date().toISOString();
    return results;
  }

  onBreachFound(callback: BreachCallback): void {
    this.callbacks.push(callback);
  }

  getLastCheckTime(): string | null {
    return this.lastCheckTime;
  }

  setLastCheckTime(time: string): void {
    this.lastCheckTime = time;
  }

  getIntervalMs(): number {
    return this.intervalMs;
  }
}
