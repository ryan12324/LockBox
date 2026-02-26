/**
 * Security alert engine — generates actionable alerts from URL and vault analysis.
 *
 * Combines phishing detection, protocol checks, and password health metrics
 * to produce prioritised security alerts. All analysis is synchronous and
 * runs entirely on-device.
 */
import type { LoginItem } from '@lockbox/types';
/** Alert severity levels. */
export type AlertSeverity = 'critical' | 'warning' | 'info';
/** Alert type discriminant. */
export type AlertType = 'phishing' | 'breach-site' | 'http-only' | 'cert-warning' | 'weak-password' | 'reused-password' | 'old-password';
/** A security alert surfaced to the user. */
export interface SecurityAlert {
    type: AlertType;
    severity: AlertSeverity;
    title: string;
    message: string;
    /** Related vault item ID, if applicable. */
    itemId?: string;
    /** Whether the user can dismiss this alert. */
    dismissible: boolean;
    /** Optional action the user can take. */
    action?: {
        label: string;
        type: 'navigate' | 'generate-password' | 'dismiss';
    };
}
/**
 * Security alert engine — checks URLs and vault items to produce alerts.
 *
 * Combines phishing analysis with password health checks to generate
 * a prioritised list of security alerts for the current context.
 */
export declare class SecurityAlertEngine {
    private readonly detector;
    constructor(legitimateDomains?: string[]);
    /**
     * Check a URL against vault items and produce security alerts.
     *
     * Runs phishing detection on the URL, checks protocol safety, and
     * evaluates matching vault items for password health issues.
     */
    checkUrl(url: string, vaultItems: LoginItem[]): SecurityAlert[];
    private isHttpUrl;
    /** Find vault items whose URIs match the given URL's hostname. */
    private findMatchingItems;
    /** Check if the same password is used by any other item in the vault. */
    private isPasswordReused;
    /** Get the age of an item's password in days. */
    private getPasswordAgeDays;
}
//# sourceMappingURL=alerts.d.ts.map