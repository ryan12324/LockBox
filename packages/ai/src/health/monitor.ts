type SchedulerEnvironment = 'web' | 'extension' | 'mobile';

export class BreachScheduler {
  private timerId: ReturnType<typeof setInterval> | null = null;
  private readonly environment: SchedulerEnvironment;

  constructor(environment: SchedulerEnvironment) {
    this.environment = environment;
  }

  start(monitorFn: () => Promise<void>, intervalMs: number): void {
    this.stop();

    if (this.environment === 'web') {
      this.timerId = setInterval(() => {
        if (typeof document !== 'undefined' && document.hidden) return;
        void monitorFn();
      }, intervalMs);
    } else if (this.environment === 'extension') {
      // Extension environment: chrome.alarms integration is handled
      // in apps/extension — here we just fall back to setInterval
      // so the class remains testable without chrome API stubs.
      this.timerId = setInterval(() => {
        void monitorFn();
      }, intervalMs);
    } else {
      // Mobile — no visibility check needed (Capacitor handles lifecycle)
      this.timerId = setInterval(() => {
        void monitorFn();
      }, intervalMs);
    }
  }

  stop(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  isRunning(): boolean {
    return this.timerId !== null;
  }
}

export function createScheduler(environment: SchedulerEnvironment): BreachScheduler {
  return new BreachScheduler(environment);
}
