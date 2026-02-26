/**
 * Security alert engine — generates actionable alerts from URL and vault analysis.
 *
 * Combines phishing detection, protocol checks, and password health metrics
 * to produce prioritised security alerts. All analysis is synchronous and
 * runs entirely on-device.
 */
import { evaluateStrength } from '@lockbox/generator';
import { PhishingDetector } from './phishing.js';
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PASSWORD_AGE_THRESHOLD_DAYS = 90;
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Security alert engine — checks URLs and vault items to produce alerts.
 *
 * Combines phishing analysis with password health checks to generate
 * a prioritised list of security alerts for the current context.
 */
export class SecurityAlertEngine {
    detector;
    constructor(legitimateDomains) {
        this.detector = new PhishingDetector(legitimateDomains);
    }
    /**
     * Check a URL against vault items and produce security alerts.
     *
     * Runs phishing detection on the URL, checks protocol safety, and
     * evaluates matching vault items for password health issues.
     */
    checkUrl(url, vaultItems) {
        const alerts = [];
        // 1. Phishing analysis
        const phishingResult = this.detector.analyzeUrl(url);
        if (!phishingResult.safe) {
            alerts.push({
                type: 'phishing',
                severity: 'critical',
                title: 'Potential phishing site detected',
                message: phishingResult.reasons.join('; '),
                dismissible: false,
                action: { label: 'View Details', type: 'navigate' },
            });
        }
        // 2. HTTP-only check (only if not already flagged by phishing)
        const isHttp = this.isHttpUrl(url);
        const alreadyFlaggedHttp = alerts.some((a) => a.type === 'phishing');
        if (isHttp && !alreadyFlaggedHttp) {
            alerts.push({
                type: 'http-only',
                severity: 'warning',
                title: 'Unencrypted connection',
                message: 'This site uses HTTP instead of HTTPS. Your credentials could be intercepted.',
                dismissible: true,
            });
        }
        // 3. Vault item checks — find items matching this URL
        const matchingItems = this.findMatchingItems(url, vaultItems);
        for (const item of matchingItems) {
            // Weak password check
            const strength = evaluateStrength(item.password);
            if (strength.score < 3) {
                alerts.push({
                    type: 'weak-password',
                    severity: 'warning',
                    title: 'Weak password',
                    message: `The password for "${item.name}" is weak (strength ${strength.score}/4). Consider generating a stronger one.`,
                    itemId: item.id,
                    dismissible: true,
                    action: { label: 'Generate Password', type: 'generate-password' },
                });
            }
            // Reused password check
            const isReused = this.isPasswordReused(item, vaultItems);
            if (isReused) {
                alerts.push({
                    type: 'reused-password',
                    severity: 'warning',
                    title: 'Reused password',
                    message: `The password for "${item.name}" is used on another site. Reusing passwords puts all accounts at risk.`,
                    itemId: item.id,
                    dismissible: true,
                    action: { label: 'Generate Password', type: 'generate-password' },
                });
            }
            // Old password check
            const ageInDays = this.getPasswordAgeDays(item);
            if (ageInDays > PASSWORD_AGE_THRESHOLD_DAYS) {
                alerts.push({
                    type: 'old-password',
                    severity: 'info',
                    title: 'Password is old',
                    message: `The password for "${item.name}" hasn't been changed in ${ageInDays} days. Consider rotating it.`,
                    itemId: item.id,
                    dismissible: true,
                    action: { label: 'Generate Password', type: 'generate-password' },
                });
            }
        }
        return alerts;
    }
    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------
    isHttpUrl(url) {
        const trimmed = url.trim().toLowerCase();
        return trimmed.startsWith('http://');
    }
    /** Find vault items whose URIs match the given URL's hostname. */
    findMatchingItems(url, items) {
        let hostname;
        try {
            const withProtocol = /^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//.test(url) ? url : `https://${url}`;
            hostname = new URL(withProtocol).hostname.toLowerCase();
        }
        catch {
            return [];
        }
        return items.filter((item) => item.uris.some((uri) => {
            try {
                const itemUrl = /^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//.test(uri) ? uri : `https://${uri}`;
                return new URL(itemUrl).hostname.toLowerCase() === hostname;
            }
            catch {
                return false;
            }
        }));
    }
    /** Check if the same password is used by any other item in the vault. */
    isPasswordReused(item, allItems) {
        return allItems.some((other) => other.id !== item.id && other.password === item.password);
    }
    /** Get the age of an item's password in days. */
    getPasswordAgeDays(item) {
        const diffMs = Date.now() - new Date(item.updatedAt).getTime();
        return Math.floor(diffMs / (1000 * 60 * 60 * 24));
    }
}
//# sourceMappingURL=alerts.js.map