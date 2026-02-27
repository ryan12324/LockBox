/**
 * GitHub password rotation adapter.
 */

import type { SiteAdapter, RotationPlan } from './base.js';
import { extractDomain, domainMatches } from './base.js';

const GITHUB_DOMAINS = ['github.com'];
const CHANGE_PASSWORD_URL = 'https://github.com/settings/security';

export const githubAdapter: SiteAdapter = {
  name: 'GitHub',
  domains: GITHUB_DOMAINS,

  canHandle(url: string): boolean {
    const host = extractDomain(url);
    return host !== '' && domainMatches(host, GITHUB_DOMAINS);
  },

  createPlan(_currentUrl: string, _currentPassword: string, _newPassword: string): RotationPlan {
    return {
      siteName: 'GitHub',
      estimatedDuration: 25,
      requiresConfirmation: true,
      steps: [
        {
          action: 'navigate',
          url: CHANGE_PASSWORD_URL,
          description: 'Navigate to GitHub security settings',
        },
        {
          action: 'wait',
          selector: '#old_password',
          timeout: 5000,
          description: 'Wait for change-password form',
        },
        {
          action: 'type',
          selector: '#old_password',
          value: _currentPassword,
          description: 'Enter old password',
        },
        {
          action: 'type',
          selector: '#new_password',
          value: _newPassword,
          description: 'Enter new password',
        },
        {
          action: 'type',
          selector: '#confirm_new_password',
          value: _newPassword,
          description: 'Confirm new password',
        },
        {
          action: 'click',
          selector: 'button[data-disable-with="Updating password…"]',
          description: 'Click update password button',
        },
        {
          action: 'verify',
          timeout: 5000,
          description: 'Verify password change succeeded',
        },
      ],
      fallbackInstructions: githubAdapter.getFallbackInstructions('github.com'),
    };
  },

  getChangePasswordUrl(_domain: string): string {
    return CHANGE_PASSWORD_URL;
  },

  getFallbackInstructions(_domain: string): string[] {
    return [
      'Go to https://github.com/settings/security',
      'Scroll to the "Change password" section',
      'Enter your old password',
      'Enter and confirm your new password',
      'Click "Update password"',
    ];
  },
};
