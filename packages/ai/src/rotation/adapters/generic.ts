/**
 * Generic fallback password rotation adapter.
 *
 * Handles any domain that isn't covered by a site-specific adapter.
 * Always produces a best-effort plan with `requiresConfirmation: true`
 * and `fallbackUsed: true`.
 */

import type { SiteAdapter, RotationPlan } from './base.js';
import { extractDomain } from './base.js';

export const genericAdapter: SiteAdapter = {
  name: 'Generic',
  domains: [],

  canHandle(_url: string): boolean {
    // Catch-all — always returns true.
    return true;
  },

  createPlan(currentUrl: string, _currentPassword: string, _newPassword: string): RotationPlan {
    const domain = extractDomain(currentUrl) || currentUrl;

    return {
      siteName: domain,
      estimatedDuration: 60,
      requiresConfirmation: true,
      steps: [
        {
          action: 'navigate',
          url: `https://${domain}/settings`,
          description: `Navigate to ${domain} settings page`,
        },
        {
          action: 'navigate',
          url: `https://${domain}/account`,
          description: `Try account page if settings not found`,
        },
        {
          action: 'click',
          selector:
            'a[href*="password"], a[href*="security"], button:has-text("Password"), button:has-text("Security")',
          description: 'Look for password or security link',
        },
        {
          action: 'wait',
          selector: 'input[type="password"]',
          timeout: 5000,
          description: 'Wait for password input field',
        },
        {
          action: 'type',
          selector: 'input[type="password"]',
          value: _currentPassword,
          description: 'Enter current password',
        },
        {
          action: 'type',
          selector: 'input[type="password"]:nth-of-type(2), input[name*="new"]',
          value: _newPassword,
          description: 'Enter new password',
        },
        {
          action: 'type',
          selector: 'input[type="password"]:nth-of-type(3), input[name*="confirm"]',
          value: _newPassword,
          description: 'Confirm new password',
        },
        {
          action: 'click',
          selector: 'button[type="submit"], input[type="submit"]',
          description: 'Submit password change form',
        },
        {
          action: 'verify',
          timeout: 5000,
          description: 'Verify password change succeeded',
        },
      ],
      fallbackInstructions: genericAdapter.getFallbackInstructions(domain),
    };
  },

  getChangePasswordUrl(domain: string): string {
    const normalized = domain.replace(/^www\./, '');
    return `https://${normalized}/settings`;
  },

  getFallbackInstructions(domain: string): string[] {
    const normalized = domain.replace(/^www\./, '');
    return [
      `Go to https://${normalized}`,
      'Navigate to Account Settings or Profile',
      'Find the Security or Password section',
      'Enter your current password',
      'Enter and confirm your new password',
      'Save changes',
    ];
  },
};
