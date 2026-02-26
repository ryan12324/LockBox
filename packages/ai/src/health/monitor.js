export class BreachScheduler {
    timerId = null;
    environment;
    constructor(environment) {
        this.environment = environment;
    }
    start(monitorFn, intervalMs) {
        this.stop();
        if (this.environment === 'web') {
            this.timerId = setInterval(() => {
                if (typeof document !== 'undefined' && document.hidden)
                    return;
                void monitorFn();
            }, intervalMs);
        }
        else if (this.environment === 'extension') {
            // Extension environment: chrome.alarms integration is handled
            // in apps/extension — here we just fall back to setInterval
            // so the class remains testable without chrome API stubs.
            this.timerId = setInterval(() => {
                void monitorFn();
            }, intervalMs);
        }
        else {
            // Mobile — no visibility check needed (Capacitor handles lifecycle)
            this.timerId = setInterval(() => {
                void monitorFn();
            }, intervalMs);
        }
    }
    stop() {
        if (this.timerId !== null) {
            clearInterval(this.timerId);
            this.timerId = null;
        }
    }
    isRunning() {
        return this.timerId !== null;
    }
}
export function createScheduler(environment) {
    return new BreachScheduler(environment);
}
//# sourceMappingURL=monitor.js.map