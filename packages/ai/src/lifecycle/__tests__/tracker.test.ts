import { describe, it, expect } from 'vitest';
import type { LoginItem } from '@lockbox/types';
import type { BreachCheckResult } from '@lockbox/types';
import { LifecycleTracker, DEFAULT_ROTATION_INTERVALS } from '../tracker.js';
import type { ItemCategory } from '../tracker.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date('2026-02-26T00:00:00.000Z');

/** Build a LoginItem with sensible defaults. */
function makeItem(overrides: Partial<LoginItem> & { id: string }): LoginItem {
  return {
    type: 'login',
    name: `Item ${overrides.id}`,
    username: 'user',
    password: 'P@ssw0rd!',
    uris: ['https://example.com'],
    tags: [],
    favorite: false,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    revisionDate: NOW.toISOString(),
    ...overrides,
  };
}

/** Return an ISO string for `daysAgo` days before NOW. */
function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** Return an ISO string for `daysAhead` days after NOW. */
function daysFromNow(days: number): string {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// categorizeItem
// ---------------------------------------------------------------------------

describe('LifecycleTracker.categorizeItem', () => {
  const tracker = new LifecycleTracker({ now: NOW });

  it('categorizes a financial item (chase.com)', () => {
    const item = makeItem({ id: '1', uris: ['https://chase.com/login'] });
    expect(tracker.categorizeItem(item)).toBe('financial');
  });

  it('categorizes a financial item (paypal.com)', () => {
    const item = makeItem({ id: '2', uris: ['https://www.paypal.com'] });
    expect(tracker.categorizeItem(item)).toBe('financial');
  });

  it('categorizes an email item (gmail.com)', () => {
    const item = makeItem({ id: '3', uris: ['https://gmail.com'] });
    expect(tracker.categorizeItem(item)).toBe('email');
  });

  it('categorizes an email item (protonmail.com)', () => {
    const item = makeItem({ id: '4', uris: ['https://protonmail.com'] });
    expect(tracker.categorizeItem(item)).toBe('email');
  });

  it('categorizes a social item (twitter.com)', () => {
    const item = makeItem({ id: '5', uris: ['https://twitter.com'] });
    expect(tracker.categorizeItem(item)).toBe('social');
  });

  it('categorizes a social item (linkedin.com)', () => {
    const item = makeItem({ id: '6', uris: ['https://www.linkedin.com/feed'] });
    expect(tracker.categorizeItem(item)).toBe('social');
  });

  it('categorizes a development item (github.com)', () => {
    const item = makeItem({ id: '7', uris: ['https://github.com'] });
    expect(tracker.categorizeItem(item)).toBe('development');
  });

  it('categorizes a development item (vercel.com)', () => {
    const item = makeItem({ id: '8', uris: ['https://vercel.com/dashboard'] });
    expect(tracker.categorizeItem(item)).toBe('development');
  });

  it('categorizes a shopping item (amazon.com)', () => {
    const item = makeItem({ id: '9', uris: ['https://amazon.com'] });
    expect(tracker.categorizeItem(item)).toBe('shopping');
  });

  it('categorizes a shopping item (etsy.com)', () => {
    const item = makeItem({ id: '10', uris: ['https://www.etsy.com/shop'] });
    expect(tracker.categorizeItem(item)).toBe('shopping');
  });

  it('returns "other" for an unknown domain', () => {
    const item = makeItem({ id: '11', uris: ['https://mycoolsite.io'] });
    expect(tracker.categorizeItem(item)).toBe('other');
  });

  it('returns "other" when no URIs are present', () => {
    const item = makeItem({ id: '12', uris: [] });
    expect(tracker.categorizeItem(item)).toBe('other');
  });

  it('uses the first matching category when multiple URIs are present', () => {
    const item = makeItem({
      id: '13',
      uris: ['https://unknown.io', 'https://chase.com', 'https://github.com'],
    });
    // chase.com matches financial first
    expect(tracker.categorizeItem(item)).toBe('financial');
  });

  it('skips invalid URIs and categorizes from the next valid one', () => {
    const item = makeItem({
      id: '14',
      uris: ['not-a-url', 'https://github.com'],
    });
    expect(tracker.categorizeItem(item)).toBe('development');
  });
});

// ---------------------------------------------------------------------------
// getRotationSchedule
// ---------------------------------------------------------------------------

describe('LifecycleTracker.getRotationSchedule', () => {
  it('marks a financial item updated 61 days ago as overdue', () => {
    const tracker = new LifecycleTracker({ now: NOW });
    const item = makeItem({
      id: 'fin-old',
      uris: ['https://chase.com'],
      updatedAt: daysAgo(61),
    });

    const [schedule] = tracker.getRotationSchedule([item]);
    expect(schedule.urgency).toBe('overdue');
    expect(schedule.itemId).toBe('fin-old');
  });

  it('marks a financial item updated 50 days ago as due-soon', () => {
    const tracker = new LifecycleTracker({ now: NOW });
    const item = makeItem({
      id: 'fin-soon',
      uris: ['https://chase.com'],
      updatedAt: daysAgo(50),
    });

    const [schedule] = tracker.getRotationSchedule([item]);
    // 60 - 50 = 10 days remaining, within 14-day window
    expect(schedule.urgency).toBe('due-soon');
  });

  it('marks a financial item updated 10 days ago as ok', () => {
    const tracker = new LifecycleTracker({ now: NOW });
    const item = makeItem({
      id: 'fin-ok',
      uris: ['https://chase.com'],
      updatedAt: daysAgo(10),
    });

    const [schedule] = tracker.getRotationSchedule([item]);
    expect(schedule.urgency).toBe('ok');
  });

  it('marks an email item updated 91 days ago as overdue', () => {
    const tracker = new LifecycleTracker({ now: NOW });
    const item = makeItem({
      id: 'email-old',
      uris: ['https://gmail.com'],
      updatedAt: daysAgo(91),
    });

    const [schedule] = tracker.getRotationSchedule([item]);
    expect(schedule.urgency).toBe('overdue');
  });

  it('marks an email item updated 80 days ago as due-soon', () => {
    const tracker = new LifecycleTracker({ now: NOW });
    const item = makeItem({
      id: 'email-soon',
      uris: ['https://gmail.com'],
      updatedAt: daysAgo(80),
    });

    const [schedule] = tracker.getRotationSchedule([item]);
    // 90 - 80 = 10 days remaining, within 14-day window
    expect(schedule.urgency).toBe('due-soon');
  });

  it('marks a breached item as overdue regardless of age', () => {
    const breachResults = new Map<string, BreachCheckResult>();
    breachResults.set('breached-1', {
      hashPrefix: 'ABCDE',
      found: true,
      count: 42,
      checkedAt: NOW.toISOString(),
    });

    const tracker = new LifecycleTracker({ now: NOW, breachResults });
    const item = makeItem({
      id: 'breached-1',
      uris: ['https://example.com'],
      updatedAt: daysAgo(1), // Updated yesterday — normally 'ok'
    });

    const [schedule] = tracker.getRotationSchedule([item]);
    expect(schedule.urgency).toBe('overdue');
  });

  it('does not flag a non-breached item from breach map', () => {
    const breachResults = new Map<string, BreachCheckResult>();
    breachResults.set('safe-1', {
      hashPrefix: 'ABCDE',
      found: false,
      count: 0,
      checkedAt: NOW.toISOString(),
    });

    const tracker = new LifecycleTracker({ now: NOW, breachResults });
    const item = makeItem({
      id: 'safe-1',
      uris: ['https://example.com'],
      updatedAt: daysAgo(1),
    });

    const [schedule] = tracker.getRotationSchedule([item]);
    expect(schedule.urgency).toBe('ok');
  });

  it('respects custom rotation intervals', () => {
    const tracker = new LifecycleTracker({
      now: NOW,
      rotationIntervals: { financial: 30 },
    });
    const item = makeItem({
      id: 'custom-fin',
      uris: ['https://chase.com'],
      updatedAt: daysAgo(31),
    });

    const [schedule] = tracker.getRotationSchedule([item]);
    expect(schedule.urgency).toBe('overdue');
  });

  it('computes correct lastRotated and nextRotation dates', () => {
    const tracker = new LifecycleTracker({ now: NOW });
    const updatedAt = daysAgo(30);
    const item = makeItem({
      id: 'dates-check',
      uris: ['https://example.com'],
      updatedAt,
    });

    const [schedule] = tracker.getRotationSchedule([item]);
    expect(schedule.lastRotated).toBe(updatedAt);
    // 'other' category = 90 days, so nextRotation = updatedAt + 90 days
    const expected = new Date(
      new Date(updatedAt).getTime() + 90 * 24 * 60 * 60 * 1000
    ).toISOString();
    expect(schedule.nextRotation).toBe(expected);
  });

  it('returns an empty array for empty input', () => {
    const tracker = new LifecycleTracker({ now: NOW });
    expect(tracker.getRotationSchedule([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getDueItems
// ---------------------------------------------------------------------------

describe('LifecycleTracker.getDueItems', () => {
  it('returns only overdue and due-soon items', () => {
    const tracker = new LifecycleTracker({ now: NOW });
    const items = [
      makeItem({ id: 'ok-item', uris: ['https://chase.com'], updatedAt: daysAgo(10) }),
      makeItem({ id: 'overdue-item', uris: ['https://chase.com'], updatedAt: daysAgo(61) }),
      makeItem({ id: 'soon-item', uris: ['https://chase.com'], updatedAt: daysAgo(50) }),
    ];

    const due = tracker.getDueItems(items);
    expect(due).toHaveLength(2);
    expect(due.map((d) => d.itemId)).toEqual(['overdue-item', 'soon-item']);
  });

  it('sorts overdue before due-soon', () => {
    const tracker = new LifecycleTracker({ now: NOW });
    const items = [
      makeItem({ id: 'soon', uris: ['https://chase.com'], updatedAt: daysAgo(50) }),
      makeItem({ id: 'overdue', uris: ['https://chase.com'], updatedAt: daysAgo(70) }),
    ];

    const due = tracker.getDueItems(items);
    expect(due[0].itemId).toBe('overdue');
    expect(due[1].itemId).toBe('soon');
  });

  it('sorts within same urgency by nextRotation (earliest first)', () => {
    const tracker = new LifecycleTracker({ now: NOW });
    const items = [
      makeItem({ id: 'overdue-recent', uris: ['https://chase.com'], updatedAt: daysAgo(62) }),
      makeItem({ id: 'overdue-old', uris: ['https://chase.com'], updatedAt: daysAgo(100) }),
    ];

    const due = tracker.getDueItems(items);
    // overdue-old has earlier nextRotation (100 days ago + 60 = 40 days ago)
    expect(due[0].itemId).toBe('overdue-old');
    expect(due[1].itemId).toBe('overdue-recent');
  });

  it('returns empty array for empty vault', () => {
    const tracker = new LifecycleTracker({ now: NOW });
    expect(tracker.getDueItems([])).toEqual([]);
  });

  it('returns empty array when all items are ok', () => {
    const tracker = new LifecycleTracker({ now: NOW });
    const items = [
      makeItem({ id: 'ok-1', uris: ['https://example.com'], updatedAt: daysAgo(5) }),
      makeItem({ id: 'ok-2', uris: ['https://example.com'], updatedAt: daysAgo(10) }),
    ];
    expect(tracker.getDueItems(items)).toEqual([]);
  });

  it('includes breached items even when recently updated', () => {
    const breachResults = new Map<string, BreachCheckResult>();
    breachResults.set('breached', {
      hashPrefix: '12345',
      found: true,
      count: 5,
      checkedAt: NOW.toISOString(),
    });

    const tracker = new LifecycleTracker({ now: NOW, breachResults });
    const items = [
      makeItem({ id: 'breached', uris: ['https://example.com'], updatedAt: daysAgo(1) }),
    ];

    const due = tracker.getDueItems(items);
    expect(due).toHaveLength(1);
    expect(due[0].urgency).toBe('overdue');
  });
});

// ---------------------------------------------------------------------------
// getDaysSinceChange
// ---------------------------------------------------------------------------

describe('LifecycleTracker.getDaysSinceChange', () => {
  const tracker = new LifecycleTracker({ now: NOW });

  it('returns correct number of days since updatedAt', () => {
    const item = makeItem({ id: 'd1', updatedAt: daysAgo(45) });
    expect(tracker.getDaysSinceChange(item)).toBe(45);
  });

  it('returns 0 for an item updated today', () => {
    const item = makeItem({ id: 'd2', updatedAt: NOW.toISOString() });
    expect(tracker.getDaysSinceChange(item)).toBe(0);
  });

  it('returns correct value for a large number of days', () => {
    const item = makeItem({ id: 'd3', updatedAt: daysAgo(365) });
    expect(tracker.getDaysSinceChange(item)).toBe(365);
  });
});

// ---------------------------------------------------------------------------
// getRotationInterval
// ---------------------------------------------------------------------------

describe('LifecycleTracker.getRotationInterval', () => {
  it('returns the default financial interval', () => {
    const tracker = new LifecycleTracker({ now: NOW });
    const item = makeItem({ id: 'i1', uris: ['https://chase.com'] });
    expect(tracker.getRotationInterval(item)).toBe(60);
  });

  it('returns the default email interval', () => {
    const tracker = new LifecycleTracker({ now: NOW });
    const item = makeItem({ id: 'i2', uris: ['https://gmail.com'] });
    expect(tracker.getRotationInterval(item)).toBe(90);
  });

  it('returns the default development interval', () => {
    const tracker = new LifecycleTracker({ now: NOW });
    const item = makeItem({ id: 'i3', uris: ['https://github.com'] });
    expect(tracker.getRotationInterval(item)).toBe(120);
  });

  it('returns the default shopping interval', () => {
    const tracker = new LifecycleTracker({ now: NOW });
    const item = makeItem({ id: 'i4', uris: ['https://amazon.com'] });
    expect(tracker.getRotationInterval(item)).toBe(180);
  });

  it('returns the default "other" interval for unknown domains', () => {
    const tracker = new LifecycleTracker({ now: NOW });
    const item = makeItem({ id: 'i5', uris: ['https://example.com'] });
    expect(tracker.getRotationInterval(item)).toBe(90);
  });

  it('returns custom interval when overridden in options', () => {
    const tracker = new LifecycleTracker({
      now: NOW,
      rotationIntervals: { financial: 30, email: 45 },
    });
    const fin = makeItem({ id: 'i6', uris: ['https://chase.com'] });
    const email = makeItem({ id: 'i7', uris: ['https://gmail.com'] });
    expect(tracker.getRotationInterval(fin)).toBe(30);
    expect(tracker.getRotationInterval(email)).toBe(45);
  });

  it('uses default for non-overridden categories when some are overridden', () => {
    const tracker = new LifecycleTracker({
      now: NOW,
      rotationIntervals: { financial: 30 },
    });
    const dev = makeItem({ id: 'i8', uris: ['https://github.com'] });
    expect(tracker.getRotationInterval(dev)).toBe(120); // default unchanged
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_ROTATION_INTERVALS export
// ---------------------------------------------------------------------------

describe('DEFAULT_ROTATION_INTERVALS', () => {
  it('exports expected default values', () => {
    expect(DEFAULT_ROTATION_INTERVALS).toEqual({
      financial: 60,
      email: 90,
      social: 90,
      development: 120,
      shopping: 180,
      other: 90,
    });
  });
});
