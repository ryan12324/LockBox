import { describe, it, expect } from 'vitest';

import { googleAdapter } from '../adapters/google.js';
import { githubAdapter } from '../adapters/github.js';
import { amazonAdapter } from '../adapters/amazon.js';
import { genericAdapter } from '../adapters/generic.js';
import { extractDomain, domainMatches } from '../adapters/base.js';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

const CURRENT = 'oldPassword123!';
const NEW = 'newPassword456!';

// ---------------------------------------------------------------------------
// extractDomain & domainMatches helpers
// ---------------------------------------------------------------------------

describe('extractDomain', () => {
  it('extracts hostname from a full URL', () => {
    expect(extractDomain('https://accounts.google.com/signin')).toBe('accounts.google.com');
  });

  it('strips www prefix', () => {
    expect(extractDomain('https://www.github.com')).toBe('github.com');
  });

  it('returns empty string for invalid URL', () => {
    expect(extractDomain('not-a-url')).toBe('');
  });
});

describe('domainMatches', () => {
  it('matches exact domain', () => {
    expect(domainMatches('github.com', ['github.com'])).toBe(true);
  });

  it('matches subdomain', () => {
    expect(domainMatches('accounts.google.com', ['google.com'])).toBe(true);
  });

  it('rejects non-matching domain', () => {
    expect(domainMatches('evil.com', ['google.com'])).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(domainMatches('GitHub.COM', ['github.com'])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Google adapter
// ---------------------------------------------------------------------------

describe('googleAdapter', () => {
  it('has correct name', () => {
    expect(googleAdapter.name).toBe('Google');
  });

  it('handles google.com', () => {
    expect(googleAdapter.canHandle('https://google.com')).toBe(true);
  });

  it('handles accounts.google.com', () => {
    expect(googleAdapter.canHandle('https://accounts.google.com/signin')).toBe(true);
  });

  it('handles gmail.com', () => {
    expect(googleAdapter.canHandle('https://mail.gmail.com/inbox')).toBe(true);
  });

  it('handles youtube.com', () => {
    expect(googleAdapter.canHandle('https://www.youtube.com/watch')).toBe(true);
  });

  it('rejects non-Google domains', () => {
    expect(googleAdapter.canHandle('https://github.com')).toBe(false);
  });

  it('returns correct change password URL', () => {
    expect(googleAdapter.getChangePasswordUrl('google.com')).toBe(
      'https://myaccount.google.com/signinoptions/password'
    );
  });

  it('creates plan with navigate step first', () => {
    const plan = googleAdapter.createPlan('https://google.com', CURRENT, NEW);
    expect(plan.steps[0].action).toBe('navigate');
    expect(plan.steps[0].url).toContain('myaccount.google.com');
  });

  it('plan has required fields', () => {
    const plan = googleAdapter.createPlan('https://google.com', CURRENT, NEW);
    expect(plan.siteName).toBe('Google');
    expect(plan.estimatedDuration).toBeGreaterThan(0);
    expect(plan.requiresConfirmation).toBe(true);
    expect(plan.steps.length).toBeGreaterThan(0);
  });

  it('returns fallback instructions', () => {
    const instructions = googleAdapter.getFallbackInstructions('google.com');
    expect(instructions.length).toBeGreaterThan(0);
    expect(instructions[0]).toContain('myaccount.google.com');
  });

  it('plan includes verify step', () => {
    const plan = googleAdapter.createPlan('https://google.com', CURRENT, NEW);
    const verify = plan.steps.find((s) => s.action === 'verify');
    expect(verify).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// GitHub adapter
// ---------------------------------------------------------------------------

describe('githubAdapter', () => {
  it('has correct name', () => {
    expect(githubAdapter.name).toBe('GitHub');
  });

  it('handles github.com', () => {
    expect(githubAdapter.canHandle('https://github.com/user/repo')).toBe(true);
  });

  it('rejects non-GitHub domains', () => {
    expect(githubAdapter.canHandle('https://gitlab.com')).toBe(false);
  });

  it('returns correct change password URL', () => {
    expect(githubAdapter.getChangePasswordUrl('github.com')).toBe(
      'https://github.com/settings/security'
    );
  });

  it('creates plan with correct steps', () => {
    const plan = githubAdapter.createPlan('https://github.com', CURRENT, NEW);
    expect(plan.steps[0].action).toBe('navigate');
    expect(plan.steps[0].url).toContain('settings/security');
  });

  it('plan includes old password input', () => {
    const plan = githubAdapter.createPlan('https://github.com', CURRENT, NEW);
    const oldPwStep = plan.steps.find((s) => s.selector === '#old_password' && s.action === 'type');
    expect(oldPwStep).toBeDefined();
    expect(oldPwStep?.action).toBe('type');
  });

  it('returns fallback instructions mentioning security page', () => {
    const instructions = githubAdapter.getFallbackInstructions('github.com');
    expect(instructions.some((i) => i.includes('settings/security'))).toBe(true);
  });

  it('plan has all required description fields', () => {
    const plan = githubAdapter.createPlan('https://github.com', CURRENT, NEW);
    for (const step of plan.steps) {
      expect(step.description).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// Amazon adapter
// ---------------------------------------------------------------------------

describe('amazonAdapter', () => {
  it('has correct name', () => {
    expect(amazonAdapter.name).toBe('Amazon');
  });

  it('handles amazon.com', () => {
    expect(amazonAdapter.canHandle('https://www.amazon.com/gp/css')).toBe(true);
  });

  it('handles amazon.co.uk', () => {
    expect(amazonAdapter.canHandle('https://www.amazon.co.uk')).toBe(true);
  });

  it('handles amazon.de', () => {
    expect(amazonAdapter.canHandle('https://amazon.de/account')).toBe(true);
  });

  it('handles amazon.fr', () => {
    expect(amazonAdapter.canHandle('https://www.amazon.fr')).toBe(true);
  });

  it('handles amazon.co.jp', () => {
    expect(amazonAdapter.canHandle('https://www.amazon.co.jp')).toBe(true);
  });

  it('rejects non-Amazon domains', () => {
    expect(amazonAdapter.canHandle('https://ebay.com')).toBe(false);
  });

  it('returns locale-specific change URL for .co.uk', () => {
    const url = amazonAdapter.getChangePasswordUrl('amazon.co.uk');
    expect(url).toContain('amazon.co.uk');
  });

  it('returns locale-specific change URL for .de', () => {
    const url = amazonAdapter.getChangePasswordUrl('amazon.de');
    expect(url).toContain('amazon.de');
  });

  it('falls back to .com URL for unknown locale', () => {
    const url = amazonAdapter.getChangePasswordUrl('amazon.com.mx');
    expect(url).toContain('amazon.com');
  });

  it('plan navigates to locale-appropriate URL', () => {
    const plan = amazonAdapter.createPlan('https://www.amazon.co.jp', CURRENT, NEW);
    expect(plan.steps[0].url).toContain('amazon.co.jp');
  });

  it('returns fallback instructions with locale URL', () => {
    const instructions = amazonAdapter.getFallbackInstructions('amazon.de');
    expect(instructions[0]).toContain('amazon.de');
  });
});

// ---------------------------------------------------------------------------
// Generic adapter
// ---------------------------------------------------------------------------

describe('genericAdapter', () => {
  it('has correct name', () => {
    expect(genericAdapter.name).toBe('Generic');
  });

  it('canHandle returns true for any URL', () => {
    expect(genericAdapter.canHandle('https://example.com')).toBe(true);
    expect(genericAdapter.canHandle('https://randomsite.org')).toBe(true);
    expect(genericAdapter.canHandle('https://my-app.io/dashboard')).toBe(true);
  });

  it('has empty domains list', () => {
    expect(genericAdapter.domains).toEqual([]);
  });

  it('creates plan with settings URL', () => {
    const plan = genericAdapter.createPlan('https://example.com', CURRENT, NEW);
    expect(plan.steps[0].url).toContain('example.com/settings');
  });

  it('plan sets requiresConfirmation true', () => {
    const plan = genericAdapter.createPlan('https://example.com', CURRENT, NEW);
    expect(plan.requiresConfirmation).toBe(true);
  });

  it('plan includes fallback instructions', () => {
    const plan = genericAdapter.createPlan('https://example.com', CURRENT, NEW);
    expect(plan.fallbackInstructions).toBeDefined();
    expect(plan.fallbackInstructions!.length).toBeGreaterThan(0);
  });

  it('getFallbackInstructions returns generic steps', () => {
    const instructions = genericAdapter.getFallbackInstructions('example.com');
    expect(instructions.some((i) => i.includes('Account Settings') || i.includes('Security'))).toBe(
      true
    );
  });

  it('getChangePasswordUrl builds from domain', () => {
    const url = genericAdapter.getChangePasswordUrl('mysite.io');
    expect(url).toBe('https://mysite.io/settings');
  });

  it('strips www from getChangePasswordUrl', () => {
    const url = genericAdapter.getChangePasswordUrl('www.mysite.io');
    expect(url).toBe('https://mysite.io/settings');
  });

  it('plan uses domain as siteName', () => {
    const plan = genericAdapter.createPlan('https://coolapp.dev/page', CURRENT, NEW);
    expect(plan.siteName).toBe('coolapp.dev');
  });

  it('plan has verify step', () => {
    const plan = genericAdapter.createPlan('https://example.com', CURRENT, NEW);
    const verify = plan.steps.find((s) => s.action === 'verify');
    expect(verify).toBeDefined();
  });
});
