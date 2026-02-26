type SchedulerEnvironment = 'web' | 'extension' | 'mobile';
export declare class BreachScheduler {
    private timerId;
    private readonly environment;
    constructor(environment: SchedulerEnvironment);
    start(monitorFn: () => Promise<void>, intervalMs: number): void;
    stop(): void;
    isRunning(): boolean;
}
export declare function createScheduler(environment: SchedulerEnvironment): BreachScheduler;
export {};
//# sourceMappingURL=monitor.d.ts.map