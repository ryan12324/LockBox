import type { BreachCheckResult } from '@lockbox/types';
import type { LoginItem } from '@lockbox/types';
type BreachCallback = (itemId: string, result: BreachCheckResult) => void;
export declare class BreachMonitor {
    private readonly intervalMs;
    private callbacks;
    private lastCheckTime;
    constructor(options?: {
        intervalMs?: number;
    });
    checkAll(items: LoginItem[]): Promise<Map<string, BreachCheckResult>>;
    onBreachFound(callback: BreachCallback): void;
    getLastCheckTime(): string | null;
    setLastCheckTime(time: string): void;
    getIntervalMs(): number;
}
export {};
//# sourceMappingURL=breach.d.ts.map