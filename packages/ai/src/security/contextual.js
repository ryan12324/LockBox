import { SecurityAlertEngine } from './alerts.js';
const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };
/**
 * Extended alert engine that combines SecurityAlertEngine results
 * with breach data for contextual, URL-aware security alerts.
 */
export class ContextualAlertEngine {
    alertEngine;
    breachData;
    constructor(breachData) {
        this.alertEngine = new SecurityAlertEngine();
        this.breachData = breachData ?? null;
    }
    /** Update breach data (called when breach scan completes). */
    setBreachData(data) {
        this.breachData = data;
    }
    /** Check URL and produce contextual alerts including breach data. Sorted by severity. */
    checkUrl(url, vaultItems) {
        const alerts = this.alertEngine.checkUrl(url, vaultItems);
        if (this.breachData) {
            let domain = '';
            try {
                domain = new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '');
            }
            catch { }
            const breach = this.breachData.breachedDomains.get(domain);
            if (breach) {
                alerts.push({
                    type: 'breach-site',
                    severity: 'critical',
                    title: 'Recent Data Breach',
                    message: `${breach.name} was breached on ${breach.date}. Rotate your password immediately.`,
                    dismissible: true,
                    action: { label: 'Rotate Password', type: 'generate-password' },
                });
            }
        }
        return alerts.sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9));
    }
}
//# sourceMappingURL=contextual.js.map