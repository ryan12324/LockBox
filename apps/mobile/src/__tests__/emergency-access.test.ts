/**
 * Tests for emergency access view utilities.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getStatusBadge,
  getStatusDescription,
  formatWaitPeriod,
  calculateTimeRemaining,
  toGrantListItem,
  processGrantList,
  getGrantorActions,
  getGranteeActions,
  validateWaitPeriod,
  getAvailableWaitPeriods,
  type EmergencyGrant,
} from '../views/emergency-access';

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeGrant(overrides: Partial<EmergencyGrant> = {}): EmergencyGrant {
  return {
    id: 'grant-1',
    granteeEmail: 'grantee@example.com',
    grantorEmail: 'grantor@example.com',
    waitPeriod: 48,
    status: 'confirmed',
    createdAt: '2025-02-01T00:00:00.000Z',
    ...overrides,
  };
}

// ─── getStatusBadge ───────────────────────────────────────────────────────────

describe('getStatusBadge', () => {
  it('returns yellow badge for pending', () => {
    const badge = getStatusBadge('pending');
    expect(badge.label).toBe('Pending');
    expect(badge.color).toBe('yellow');
  });

  it('returns blue badge for confirmed', () => {
    const badge = getStatusBadge('confirmed');
    expect(badge.label).toBe('Confirmed');
    expect(badge.color).toBe('blue');
  });

  it('returns orange badge for waiting', () => {
    const badge = getStatusBadge('waiting');
    expect(badge.label).toBe('Waiting');
    expect(badge.color).toBe('orange');
  });

  it('returns green badge for approved', () => {
    const badge = getStatusBadge('approved');
    expect(badge.label).toBe('Approved');
    expect(badge.color).toBe('green');
  });

  it('returns red badge for rejected', () => {
    const badge = getStatusBadge('rejected');
    expect(badge.label).toBe('Rejected');
    expect(badge.color).toBe('red');
  });

  it('returns gray badge for revoked', () => {
    const badge = getStatusBadge('revoked');
    expect(badge.label).toBe('Revoked');
    expect(badge.color).toBe('gray');
  });

  it('returns gray badge for unknown status', () => {
    const badge = getStatusBadge('nonexistent');
    expect(badge.label).toBe('Unknown');
    expect(badge.color).toBe('gray');
  });
});

// ─── getStatusDescription ─────────────────────────────────────────────────────

describe('getStatusDescription', () => {
  it('returns description for pending', () => {
    expect(getStatusDescription('pending')).toContain('awaiting');
  });

  it('returns description for confirmed', () => {
    expect(getStatusDescription('confirmed')).toContain('confirmed');
  });

  it('returns description for waiting', () => {
    expect(getStatusDescription('waiting')).toContain('requested');
  });

  it('returns description for approved', () => {
    expect(getStatusDescription('approved')).toContain('approved');
  });

  it('returns unknown for invalid status', () => {
    expect(getStatusDescription('invalid')).toBe('Unknown status');
  });
});

// ─── formatWaitPeriod ─────────────────────────────────────────────────────────

describe('formatWaitPeriod', () => {
  it('returns "1 hour" for 1 hour', () => {
    expect(formatWaitPeriod(1)).toBe('1 hour');
  });

  it('returns "12 hours" for 12 hours', () => {
    expect(formatWaitPeriod(12)).toBe('12 hours');
  });

  it('returns "1 day" for 24 hours', () => {
    expect(formatWaitPeriod(24)).toBe('1 day');
  });

  it('returns "3 days" for 72 hours', () => {
    expect(formatWaitPeriod(72)).toBe('3 days');
  });

  it('returns "30 days" for 720 hours', () => {
    expect(formatWaitPeriod(720)).toBe('30 days');
  });

  it('returns hours for less than 24', () => {
    expect(formatWaitPeriod(23)).toBe('23 hours');
  });
});

// ─── calculateTimeRemaining ───────────────────────────────────────────────────

describe('calculateTimeRemaining', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-02-10T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns remaining hours and minutes', () => {
    // Requested 1 hour ago with 48-hour wait period → 47 hours remaining
    const requestedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const result = calculateTimeRemaining(requestedAt, 48);
    expect(result.expired).toBe(false);
    expect(result.hours).toBe(47);
    expect(result.minutes).toBe(0);
  });

  it('returns expired when wait period has passed', () => {
    // Requested 50 hours ago with 48-hour wait period
    const requestedAt = new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString();
    const result = calculateTimeRemaining(requestedAt, 48);
    expect(result.expired).toBe(true);
    expect(result.hours).toBe(0);
    expect(result.minutes).toBe(0);
  });

  it('returns correct minutes for partial hours', () => {
    // Requested 30 minutes ago with 2-hour wait period → 1h 30m remaining
    const requestedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const result = calculateTimeRemaining(requestedAt, 2);
    expect(result.expired).toBe(false);
    expect(result.hours).toBe(1);
    expect(result.minutes).toBe(30);
  });
});

// ─── toGrantListItem ──────────────────────────────────────────────────────────

describe('toGrantListItem', () => {
  it('shows grantee email for grantor role', () => {
    const grant = makeGrant();
    const item = toGrantListItem(grant, 'grantor');
    expect(item.email).toBe('grantee@example.com');
    expect(item.role).toBe('grantor');
  });

  it('shows grantor email for grantee role', () => {
    const grant = makeGrant();
    const item = toGrantListItem(grant, 'grantee');
    expect(item.email).toBe('grantor@example.com');
    expect(item.role).toBe('grantee');
  });

  it('includes status badge and description', () => {
    const grant = makeGrant({ status: 'pending' });
    const item = toGrantListItem(grant, 'grantor');
    expect(item.statusBadge.label).toBe('Pending');
    expect(item.statusDescription).toContain('awaiting');
  });

  it('includes wait period label', () => {
    const grant = makeGrant({ waitPeriod: 72 });
    const item = toGrantListItem(grant, 'grantor');
    expect(item.waitPeriodLabel).toBe('3 days');
  });

  it('includes time remaining for waiting grants', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-02-10T12:00:00.000Z'));

    const grant = makeGrant({
      status: 'waiting',
      requestedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      waitPeriod: 48,
    });
    const item = toGrantListItem(grant, 'grantor');
    expect(item.timeRemaining).toBeDefined();
    expect(item.timeRemaining?.expired).toBe(false);

    vi.useRealTimers();
  });

  it('does not include time remaining for non-waiting grants', () => {
    const grant = makeGrant({ status: 'confirmed' });
    const item = toGrantListItem(grant, 'grantor');
    expect(item.timeRemaining).toBeUndefined();
  });
});

// ─── processGrantList ─────────────────────────────────────────────────────────

describe('processGrantList', () => {
  it('processes multiple grants for grantor role', () => {
    const grants = [
      makeGrant({ id: 'g1', status: 'pending' }),
      makeGrant({ id: 'g2', status: 'confirmed' }),
    ];
    const result = processGrantList(grants, 'grantor');
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('g1');
    expect(result[1].id).toBe('g2');
  });

  it('returns empty array for empty input', () => {
    expect(processGrantList([], 'grantor')).toHaveLength(0);
  });

  it('processes grants for grantee role', () => {
    const grants = [makeGrant({ id: 'g1', status: 'pending' })];
    const result = processGrantList(grants, 'grantee');
    expect(result).toHaveLength(1);
    expect(result[0].email).toBe('grantor@example.com');
  });
});

// ─── getGrantorActions ────────────────────────────────────────────────────────

describe('getGrantorActions', () => {
  it('returns revoke for pending', () => {
    const actions = getGrantorActions(makeGrant({ status: 'pending' }));
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('revoke');
  });

  it('returns revoke for confirmed', () => {
    const actions = getGrantorActions(makeGrant({ status: 'confirmed' }));
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('revoke');
  });

  it('returns approve and reject for waiting', () => {
    const actions = getGrantorActions(makeGrant({ status: 'waiting' }));
    expect(actions).toHaveLength(2);
    expect(actions.map((a) => a.type)).toContain('approve');
    expect(actions.map((a) => a.type)).toContain('reject');
  });

  it('returns revoke for approved', () => {
    const actions = getGrantorActions(makeGrant({ status: 'approved' }));
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('revoke');
  });

  it('returns no actions for rejected', () => {
    expect(getGrantorActions(makeGrant({ status: 'rejected' }))).toHaveLength(0);
  });

  it('returns no actions for revoked', () => {
    expect(getGrantorActions(makeGrant({ status: 'revoked' }))).toHaveLength(0);
  });
});

// ─── getGranteeActions ────────────────────────────────────────────────────────

describe('getGranteeActions', () => {
  it('returns confirm for pending', () => {
    const actions = getGranteeActions(makeGrant({ status: 'pending' }));
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('confirm');
  });

  it('returns request for confirmed', () => {
    const actions = getGranteeActions(makeGrant({ status: 'confirmed' }));
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('request');
  });

  it('returns no actions for waiting', () => {
    expect(getGranteeActions(makeGrant({ status: 'waiting' }))).toHaveLength(0);
  });

  it('returns no actions for approved', () => {
    expect(getGranteeActions(makeGrant({ status: 'approved' }))).toHaveLength(0);
  });

  it('returns no actions for rejected', () => {
    expect(getGranteeActions(makeGrant({ status: 'rejected' }))).toHaveLength(0);
  });

  it('returns no actions for revoked', () => {
    expect(getGranteeActions(makeGrant({ status: 'revoked' }))).toHaveLength(0);
  });
});

// ─── validateWaitPeriod ───────────────────────────────────────────────────────

describe('validateWaitPeriod', () => {
  it('returns true for 1 hour', () => {
    expect(validateWaitPeriod(1)).toBe(true);
  });

  it('returns true for 720 hours', () => {
    expect(validateWaitPeriod(720)).toBe(true);
  });

  it('returns true for 48 hours', () => {
    expect(validateWaitPeriod(48)).toBe(true);
  });

  it('returns false for 0', () => {
    expect(validateWaitPeriod(0)).toBe(false);
  });

  it('returns false for negative', () => {
    expect(validateWaitPeriod(-1)).toBe(false);
  });

  it('returns false for > 720', () => {
    expect(validateWaitPeriod(721)).toBe(false);
  });

  it('returns false for non-integer', () => {
    expect(validateWaitPeriod(1.5)).toBe(false);
  });
});

// ─── getAvailableWaitPeriods ──────────────────────────────────────────────────

describe('getAvailableWaitPeriods', () => {
  it('returns an array of wait period options', () => {
    const periods = getAvailableWaitPeriods();
    expect(periods.length).toBeGreaterThanOrEqual(5);
  });

  it('each option has label and value', () => {
    const periods = getAvailableWaitPeriods();
    for (const period of periods) {
      expect(typeof period.label).toBe('string');
      expect(typeof period.value).toBe('number');
      expect(period.label.length).toBeGreaterThan(0);
    }
  });

  it('includes 1 hour option', () => {
    const periods = getAvailableWaitPeriods();
    expect(periods.find((p) => p.value === 1)).toBeDefined();
  });

  it('includes 30 days option', () => {
    const periods = getAvailableWaitPeriods();
    expect(periods.find((p) => p.value === 720)).toBeDefined();
  });

  it('all values pass validation', () => {
    const periods = getAvailableWaitPeriods();
    for (const period of periods) {
      expect(validateWaitPeriod(period.value)).toBe(true);
    }
  });
});
