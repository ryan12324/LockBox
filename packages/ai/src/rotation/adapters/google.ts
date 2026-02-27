/**
 * Google account password rotation adapter.
 *
 * Covers google.com, accounts.google.com, gmail.com, youtube.com and all
 * sub-domains thereof.
 */

import type { SiteAdapter, RotationPlan } from './base.js';
import { extractDomain, domainMatches } from './base.js';

const GOOGLE_DOMAINS = ['google.com', 'accounts.google.com', 'gmail.com', 'youtube.com'];
const CHANGE_PASSWORD_URL = 'https://myaccount.google.com/signinoptions/password';

export const googleAdapter: SiteAdapter = {
  name: 'Google',
  domains: GOOGLE_DOMAINS,

  canHandle(url: string): boolean {
    const host = extractDomain(url);
    return host !== '' && domainMatches(host, GOOGLE_DOMAINS);
  },

  createPlan(_currentUrl: string, _currentPassword: string, _newPassword: string): RotationPlan {
    return {
      siteName: 'Google',
      estimatedDuration: 30,
      requiresConfirmation: true,
      steps: [
        {
          action: 'navigate',
          url: CHANGE_PASSWORD_URL,
          description: 'Navigate to Google password settings',
        },
        {
          action: 'wait',
          selector: 'input[type="password"]',
          timeout: 5000,
          description: 'Wait for current-password input to appear',
        },
        {
          action: 'type',
          selector: 'input[type="password"]',
          value: _currentPassword,
          description: 'Enter current password',
        },
        {
          action: 'click',
          selector: 'button[type="submit"], #passwordNext button',
          description: 'Submit current password',
        },
        {
          action: 'wait',
          selector: 'input[name="password"]',
          timeout: 5000,
          description: 'Wait for new-password input',
        },
        {
          action: 'type',
          selector: 'input[name="password"]',
          value: _newPassword,
          description: 'Enter new password',
        },
        {
          action: 'type',
          selector: 'input[name="confirmation_password"]',
          value: _newPassword,
          description: 'Confirm new password',
        },
        {
          action: 'click',
          selector: 'button[type="submit"]',
          description: 'Submit new password',
        },
        {
          action: 'verify',
          timeout: 5000,
          description: 'Verify password change succeeded',
        },
      ],
      fallbackInstructions: googleAdapter.getFallbackInstructions('google.com'),
    };
  },

  getChangePasswordUrl(_domain: string): string {
    return CHANGE_PASSWORD_URL;
  },

  getFallbackInstructions(_domain: string): string[] {
    return [
      'Go to https://myaccount.google.com/signinoptions/password',
      'Sign in if prompted',
      'Enter your current password',
      'Enter and confirm your new password',
      'Click "Change Password"',
    ];
  },
};
