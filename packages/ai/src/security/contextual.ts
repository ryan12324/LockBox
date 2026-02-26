import type { LoginItem } from '@lockbox/types';
import { SecurityAlertEngine } from './alerts.js';
import type { SecurityAlert } from './alerts.js';

/** Breach data for enriching contextual alerts. */
export interface BreachData {
  breachedDomains: Map<string, { date: string; name: string }>;
}

const SEVERITY_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };

/**
 * Extended alert engine that combines SecurityAlertEngine results
 * with breach data for contextual, URL-aware security alerts.
 */
export class ContextualAlertEngine {
  private readonly alertEngine: SecurityAlertEngine;
  private breachData: BreachData | null;

  constructor(breachData?: BreachData) {
    this.alertEngine = new SecurityAlertEngine();
    this.breachData = breachData ?? null;
  }

  /** Update breach data (called when breach scan completes). */
  setBreachData(data: BreachData): void {
    this.breachData = data;
  }

  /** Check URL and produce contextual alerts including breach data. Sorted by severity. */
  checkUrl(url: string, vaultItems: LoginItem[]): SecurityAlert[] {
    const alerts = this.alertEngine.checkUrl(url, vaultItems);

    if (this.breachData) {
      let domain = '';
      try {
        domain = new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(
          /^www\./,
          ''
        );
      } catch {}
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

    return alerts.sort(
      (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
    );
  }
}
