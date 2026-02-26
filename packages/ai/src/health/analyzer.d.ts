/**
 * Password health analyzer — client-side vault health analysis.
 *
 * Evaluates password strength (via zxcvbn), detects reuse (SHA-256 hash
 * comparison), and flags stale credentials. No network calls.
 */
import type { LoginItem, PasswordHealthReport, VaultHealthSummary } from '@lockbox/types';
/** Options for configuring health analysis behavior. */
export interface HealthAnalysisOptions {
    /** Number of days before a password is flagged as old. Defaults to 90. */
    ageThresholdDays?: number;
}
/**
 * Analyze a single vault item against all items in the vault.
 *
 * Returns a per-item health report including zxcvbn strength score and a
 * list of detected issues (weak, reused, old).
 */
export declare function analyzeItem(item: LoginItem, allItems: LoginItem[], options?: HealthAnalysisOptions): Promise<PasswordHealthReport>;
/**
 * Compute aggregate health metrics for an entire vault.
 *
 * Returns counts of weak, reused, and old passwords plus an overall
 * score from 0–100 calculated as the average of:
 *   - percentage of strong passwords (score ≥ 3)
 *   - percentage of unique (non-reused) passwords
 *   - percentage of recent (non-old) passwords
 */
export declare function analyzeVaultHealth(items: LoginItem[], options?: HealthAnalysisOptions): Promise<VaultHealthSummary>;
//# sourceMappingURL=analyzer.d.ts.map