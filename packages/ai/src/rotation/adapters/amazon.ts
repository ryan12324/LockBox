/**
 * Amazon password rotation adapter.
 *
 * Handles multiple Amazon locale domains (US, UK, DE, FR, JP).
 */

import type { SiteAdapter, RotationPlan } from './base.js';
import { extractDomain, domainMatches } from './base.js';

const AMAZON_DOMAINS = ['amazon.com', 'amazon.co.uk', 'amazon.de', 'amazon.fr', 'amazon.co.jp'];

const DEFAULT_CHANGE_URL = 'https://www.amazon.com/ap/cnep?ie=UTF8';

/** Map locale domain → locale-specific change password URL. */
const LOCALE_URLS: Record<string, string> = {
  'amazon.com': 'https://www.amazon.com/ap/cnep?ie=UTF8',
  'amazon.co.uk': 'https://www.amazon.co.uk/ap/cnep?ie=UTF8',
  'amazon.de': 'https://www.amazon.de/ap/cnep?ie=UTF8',
  'amazon.fr': 'https://www.amazon.fr/ap/cnep?ie=UTF8',
  'amazon.co.jp': 'https://www.amazon.co.jp/ap/cnep?ie=UTF8',
};

export const amazonAdapter: SiteAdapter = {
  name: 'Amazon',
  domains: AMAZON_DOMAINS,

  canHandle(url: string): boolean {
    const host = extractDomain(url);
    return host !== '' && domainMatches(host, AMAZON_DOMAINS);
  },

  createPlan(currentUrl: string, _currentPassword: string, _newPassword: string): RotationPlan {
    const domain = extractDomain(currentUrl);
    const changeUrl = amazonAdapter.getChangePasswordUrl(domain);

    return {
      siteName: 'Amazon',
      estimatedDuration: 30,
      requiresConfirmation: true,
      steps: [
        {
          action: 'navigate',
          url: changeUrl,
          description: 'Navigate to Amazon password change page',
        },
        {
          action: 'wait',
          selector: '#ap_password',
          timeout: 5000,
          description: 'Wait for current-password input',
        },
        {
          action: 'type',
          selector: '#ap_password',
          value: _currentPassword,
          description: 'Enter current password',
        },
        {
          action: 'type',
          selector: '#ap_password_new',
          value: _newPassword,
          description: 'Enter new password',
        },
        {
          action: 'type',
          selector: '#ap_password_new_check',
          value: _newPassword,
          description: 'Confirm new password',
        },
        {
          action: 'click',
          selector: '#cnep_1D_submit_button',
          description: 'Save changes',
        },
        {
          action: 'verify',
          timeout: 5000,
          description: 'Verify password change succeeded',
        },
      ],
      fallbackInstructions: amazonAdapter.getFallbackInstructions(domain),
    };
  },

  getChangePasswordUrl(domain: string): string {
    const normalized = domain.replace(/^www\./, '').toLowerCase();
    for (const [key, url] of Object.entries(LOCALE_URLS)) {
      if (normalized === key || normalized.endsWith(`.${key}`)) {
        return url;
      }
    }
    return DEFAULT_CHANGE_URL;
  },

  getFallbackInstructions(domain: string): string[] {
    const changeUrl = amazonAdapter.getChangePasswordUrl(domain);
    return [
      `Go to ${changeUrl}`,
      'Sign in if prompted',
      'Enter your current password',
      'Enter and confirm your new password',
      'Click "Save changes"',
    ];
  },
};
