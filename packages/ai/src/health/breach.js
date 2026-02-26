import { checkBatch } from '@lockbox/crypto';
export class BreachMonitor {
    intervalMs;
    callbacks = [];
    lastCheckTime = null;
    constructor(options) {
        this.intervalMs = options?.intervalMs ?? 24 * 60 * 60 * 1000; // 24 hours
    }
    async checkAll(items) {
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
    onBreachFound(callback) {
        this.callbacks.push(callback);
    }
    getLastCheckTime() {
        return this.lastCheckTime;
    }
    setLastCheckTime(time) {
        this.lastCheckTime = time;
    }
    getIntervalMs() {
        return this.intervalMs;
    }
}
//# sourceMappingURL=breach.js.map