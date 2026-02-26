import { describe, it, expect } from 'vitest';
import { ContextualAlertEngine } from '../contextual.js';
import type { BreachData } from '../contextual.js';
import type { LoginItem } from '@lockbox/types';

function makeLogin(overrides: Partial<LoginItem> = {}): LoginItem {
  return {
    id: crypto.randomUUID(),
    type: 'login',
    name: 'Test',
    username: 'user@test.com',
    password: 'strongP@ssw0rd!XYZ',
    uris: ['https://example.com'],
    tags: [],
    favorite: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    revisionDate: new Date().toISOString(),
    ...overrides,
  };
}

describe('ContextualAlertEngine', () => {
  it('returns breach alert when domain is in breach data', () => {
    const breach: BreachData = {
      breachedDomains: new Map([['example.com', { date: '2025-01-15', name: 'Example Inc' }]]),
    };
    const engine = new ContextualAlertEngine(breach);
    const alerts = engine.checkUrl('https://example.com', [makeLogin()]);
    expect(alerts.some((a) => a.type === 'breach-site')).toBe(true);
  });

  it('returns no breach alert when domain is clean', () => {
    const engine = new ContextualAlertEngine({ breachedDomains: new Map() });
    const alerts = engine.checkUrl('https://clean-site.com', []);
    expect(alerts.some((a) => a.type === 'breach-site')).toBe(false);
  });

  it('updates breach data via setBreachData', () => {
    const engine = new ContextualAlertEngine();
    engine.setBreachData({
      breachedDomains: new Map([['test.com', { date: '2025-06-01', name: 'Test Corp' }]]),
    });
    const alerts = engine.checkUrl('https://test.com', [makeLogin({ uris: ['https://test.com'] })]);
    expect(alerts.some((a) => a.type === 'breach-site')).toBe(true);
  });

  it('sorts alerts by severity (critical first)', () => {
    const breach: BreachData = {
      breachedDomains: new Map([['example.com', { date: '2025-01-01', name: 'Ex' }]]),
    };
    const engine = new ContextualAlertEngine(breach);
    const item = makeLogin({
      password: 'weak',
      updatedAt: '2020-01-01T00:00:00Z',
      revisionDate: '2020-01-01T00:00:00Z',
    });
    const alerts = engine.checkUrl('https://example.com', [item]);
    if (alerts.length >= 2) {
      const severities = alerts.map((a) => a.severity);
      const critIdx = severities.indexOf('critical');
      const infoIdx = severities.indexOf('info');
      if (critIdx >= 0 && infoIdx >= 0) expect(critIdx).toBeLessThan(infoIdx);
    }
  });

  it('combines breach and security alerts', () => {
    const breach: BreachData = {
      breachedDomains: new Map([['example.com', { date: '2025-01-01', name: 'Ex' }]]),
    };
    const engine = new ContextualAlertEngine(breach);
    const item = makeLogin({ password: 'a' });
    const alerts = engine.checkUrl('https://example.com', [item]);
    expect(alerts.length).toBeGreaterThanOrEqual(2);
  });

  it('works without breach data', () => {
    const engine = new ContextualAlertEngine();
    const alerts = engine.checkUrl('https://example.com', []);
    expect(Array.isArray(alerts)).toBe(true);
  });

  it('handles invalid URL gracefully', () => {
    const engine = new ContextualAlertEngine();
    expect(() => engine.checkUrl('', [])).not.toThrow();
  });

  it('strips www from domain for breach lookup', () => {
    const breach: BreachData = {
      breachedDomains: new Map([['example.com', { date: '2025-01-01', name: 'Ex' }]]),
    };
    const engine = new ContextualAlertEngine(breach);
    const alerts = engine.checkUrl('https://www.example.com', []);
    expect(alerts.some((a) => a.type === 'breach-site')).toBe(true);
  });

  it('breach alert includes rotate action', () => {
    const breach: BreachData = {
      breachedDomains: new Map([['test.com', { date: '2025-03-01', name: 'TestCo' }]]),
    };
    const engine = new ContextualAlertEngine(breach);
    const alerts = engine.checkUrl('https://test.com', []);
    const breachAlert = alerts.find((a) => a.type === 'breach-site');
    expect(breachAlert?.action?.type).toBe('generate-password');
  });

  it('breach alert message includes breach name and date', () => {
    const breach: BreachData = {
      breachedDomains: new Map([['foo.com', { date: '2025-12-25', name: 'Foo Inc' }]]),
    };
    const engine = new ContextualAlertEngine(breach);
    const alerts = engine.checkUrl('https://foo.com', []);
    const breachAlert = alerts.find((a) => a.type === 'breach-site');
    expect(breachAlert?.message).toContain('Foo Inc');
    expect(breachAlert?.message).toContain('2025-12-25');
  });
});
