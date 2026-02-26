import { describe, it, expect, beforeEach } from 'vitest';
import { SecurityAlertEngine } from '../alerts.js';
import type { SecurityAlert } from '../alerts.js';
import type { LoginItem } from '@lockbox/types';

function makeLoginItem(overrides: Partial<LoginItem> = {}): LoginItem {
  return {
    id: 'item-1',
    type: 'login',
    name: 'Test Account',
    tags: [],
    favorite: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    revisionDate: new Date().toISOString(),
    username: 'user@test.com',
    password: 'X#k9$mP2vL!qR7nZ',
    uris: ['https://example.com'],
    ...overrides,
  };
}

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function findAlert(alerts: SecurityAlert[], type: string): SecurityAlert | undefined {
  return alerts.find((a) => a.type === type);
}

describe('SecurityAlertEngine', () => {
  let engine: SecurityAlertEngine;

  beforeEach(() => {
    engine = new SecurityAlertEngine();
  });

  // -----------------------------------------------------------------------
  // Phishing alerts
  // -----------------------------------------------------------------------

  it('generates critical alert for phishing URL', () => {
    const alerts = engine.checkUrl('http://192.168.1.1/login', []);
    const phishing = findAlert(alerts, 'phishing');
    expect(phishing).toBeDefined();
    expect(phishing?.severity).toBe('critical');
    expect(phishing?.dismissible).toBe(false);
  });

  it('does not generate phishing alert for safe URL', () => {
    const alerts = engine.checkUrl('https://google.com', []);
    expect(findAlert(alerts, 'phishing')).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // HTTP-only alerts
  // -----------------------------------------------------------------------

  it('generates warning alert for HTTP URL', () => {
    const alerts = engine.checkUrl('http://safe-looking-site.com', []);
    const httpAlert = findAlert(alerts, 'http-only');
    expect(httpAlert).toBeDefined();
    expect(httpAlert?.severity).toBe('warning');
    expect(httpAlert?.dismissible).toBe(true);
  });

  it('does not generate http-only alert for HTTPS URL', () => {
    const alerts = engine.checkUrl('https://example.com', []);
    expect(findAlert(alerts, 'http-only')).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Weak password alerts
  // -----------------------------------------------------------------------

  it('generates warning for weak password on matching site', () => {
    const item = makeLoginItem({
      password: 'abc',
      uris: ['https://example.com'],
    });
    const alerts = engine.checkUrl('https://example.com', [item]);
    const weak = findAlert(alerts, 'weak-password');
    expect(weak).toBeDefined();
    expect(weak?.severity).toBe('warning');
    expect(weak?.itemId).toBe(item.id);
    expect(weak?.action?.type).toBe('generate-password');
  });

  it('does not flag strong passwords', () => {
    const item = makeLoginItem({
      password: 'X#k9$mP2vL!qR7nZ&wT5',
      uris: ['https://example.com'],
    });
    const alerts = engine.checkUrl('https://example.com', [item]);
    expect(findAlert(alerts, 'weak-password')).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Reused password alerts
  // -----------------------------------------------------------------------

  it('generates warning for reused password', () => {
    const sharedPassword = 'SharedP@ssw0rd!2024';
    const item1 = makeLoginItem({
      id: 'item-1',
      password: sharedPassword,
      uris: ['https://example.com'],
    });
    const item2 = makeLoginItem({
      id: 'item-2',
      password: sharedPassword,
      uris: ['https://other.com'],
    });
    const alerts = engine.checkUrl('https://example.com', [item1, item2]);
    const reused = findAlert(alerts, 'reused-password');
    expect(reused).toBeDefined();
    expect(reused?.severity).toBe('warning');
    expect(reused?.itemId).toBe('item-1');
  });

  it('does not flag unique passwords', () => {
    const item1 = makeLoginItem({
      id: 'item-1',
      password: 'UniqueP@ss1!xyz',
      uris: ['https://example.com'],
    });
    const item2 = makeLoginItem({
      id: 'item-2',
      password: 'DifferentP@ss2!abc',
      uris: ['https://other.com'],
    });
    const alerts = engine.checkUrl('https://example.com', [item1, item2]);
    expect(findAlert(alerts, 'reused-password')).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Old password alerts
  // -----------------------------------------------------------------------

  it('generates info alert for old password (>90 days)', () => {
    const item = makeLoginItem({
      updatedAt: daysAgo(120),
      uris: ['https://example.com'],
    });
    const alerts = engine.checkUrl('https://example.com', [item]);
    const old = findAlert(alerts, 'old-password');
    expect(old).toBeDefined();
    expect(old?.severity).toBe('info');
    expect(old?.itemId).toBe(item.id);
  });

  it('does not flag recently updated passwords', () => {
    const item = makeLoginItem({
      updatedAt: daysAgo(30),
      uris: ['https://example.com'],
    });
    const alerts = engine.checkUrl('https://example.com', [item]);
    expect(findAlert(alerts, 'old-password')).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Multiple alerts
  // -----------------------------------------------------------------------

  it('generates multiple alerts for a single URL', () => {
    const item = makeLoginItem({
      password: 'abc',
      updatedAt: daysAgo(200),
      uris: ['http://sketchy-site.com'],
    });
    const item2 = makeLoginItem({
      id: 'item-2',
      password: 'abc',
      uris: ['https://other.com'],
    });
    const alerts = engine.checkUrl('http://sketchy-site.com', [item, item2]);
    expect(alerts.length).toBeGreaterThanOrEqual(3);
  });

  // -----------------------------------------------------------------------
  // No alerts for clean state
  // -----------------------------------------------------------------------

  it('returns no alerts for safe URL with strong unique recent password', () => {
    const item = makeLoginItem({
      password: 'X#k9$mP2vL!qR7nZ&wT5',
      updatedAt: daysAgo(10),
      uris: ['https://example.com'],
    });
    const alerts = engine.checkUrl('https://example.com', [item]);
    expect(alerts).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Empty vault
  // -----------------------------------------------------------------------

  it('returns no item-related alerts with empty vault', () => {
    const alerts = engine.checkUrl('https://example.com', []);
    const itemAlerts = alerts.filter((a) => a.itemId !== undefined);
    expect(itemAlerts).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // URI matching
  // -----------------------------------------------------------------------

  it('only generates alerts for vault items matching the URL', () => {
    const matching = makeLoginItem({
      id: 'match',
      password: 'weak',
      uris: ['https://example.com'],
    });
    const nonMatching = makeLoginItem({
      id: 'no-match',
      password: 'weak',
      uris: ['https://other-site.com'],
    });
    const alerts = engine.checkUrl('https://example.com', [matching, nonMatching]);
    const weakAlerts = alerts.filter((a) => a.type === 'weak-password');
    expect(weakAlerts).toHaveLength(1);
    expect(weakAlerts[0].itemId).toBe('match');
  });
});
