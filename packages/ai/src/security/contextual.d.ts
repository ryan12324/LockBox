import type { LoginItem } from '@lockbox/types';
import type { SecurityAlert } from './alerts.js';
/** Breach data for enriching contextual alerts. */
export interface BreachData {
    breachedDomains: Map<string, {
        date: string;
        name: string;
    }>;
}
/**
 * Extended alert engine that combines SecurityAlertEngine results
 * with breach data for contextual, URL-aware security alerts.
 */
export declare class ContextualAlertEngine {
    private readonly alertEngine;
    private breachData;
    constructor(breachData?: BreachData);
    /** Update breach data (called when breach scan completes). */
    setBreachData(data: BreachData): void;
    /** Check URL and produce contextual alerts including breach data. Sorted by severity. */
    checkUrl(url: string, vaultItems: LoginItem[]): SecurityAlert[];
}
//# sourceMappingURL=contextual.d.ts.map