/**
 * Emergency access view utilities — grantor/grantee management,
 * status display, and wait period formatting.
 *
 * Used by the mobile emergency access screens to display trusted contacts,
 * manage access grants, and show countdown timers.
 */

/** Emergency access grant record */
export interface EmergencyGrant {
  id: string;
  granteeEmail: string;
  grantorEmail: string;
  waitPeriod: number; // hours
  status: 'pending' | 'confirmed' | 'waiting' | 'approved' | 'rejected' | 'revoked';
  createdAt: string;
  requestedAt?: string;
  expiresAt?: string;
}

/** Action that can be taken on a grant */
export interface EmergencyAccessAction {
  type: 'confirm' | 'request' | 'approve' | 'reject' | 'revoke';
  grantId: string;
}

/** Display-ready grant list item */
export interface GrantListItem {
  id: string;
  email: string;
  role: 'grantor' | 'grantee';
  statusBadge: { label: string; color: string };
  statusDescription: string;
  waitPeriodLabel: string;
  timeRemaining?: { hours: number; minutes: number; expired: boolean };
  actions: EmergencyAccessAction[];
}

/** Status badge color map */
const STATUS_BADGES: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'yellow' },
  confirmed: { label: 'Confirmed', color: 'blue' },
  waiting: { label: 'Waiting', color: 'orange' },
  approved: { label: 'Approved', color: 'green' },
  rejected: { label: 'Rejected', color: 'red' },
  revoked: { label: 'Revoked', color: 'gray' },
};

/** Status descriptions */
const STATUS_DESCRIPTIONS: Record<string, string> = {
  pending: 'Invitation sent, awaiting confirmation',
  confirmed: 'Contact confirmed, can request access',
  waiting: 'Access requested, waiting for approval or wait period',
  approved: 'Access has been approved',
  rejected: 'Access request was rejected',
  revoked: 'Access has been revoked',
};

/**
 * Get the display badge for a grant status.
 * Returns a default gray badge for unknown statuses.
 */
export function getStatusBadge(status: string): { label: string; color: string } {
  return STATUS_BADGES[status] ?? { label: 'Unknown', color: 'gray' };
}

/**
 * Get a human-readable description for a grant status.
 */
export function getStatusDescription(status: string): string {
  return STATUS_DESCRIPTIONS[status] ?? 'Unknown status';
}

/**
 * Format a wait period in hours into a human-readable label.
 * - < 24 hours: "N hour(s)"
 * - >= 24 hours: "N day(s)"
 */
export function formatWaitPeriod(hours: number): string {
  if (hours < 24) {
    return hours === 1 ? '1 hour' : `${hours} hours`;
  }
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day' : `${days} days`;
}

/**
 * Calculate time remaining until a wait period expires.
 * Returns hours, minutes, and whether the period has expired.
 */
export function calculateTimeRemaining(
  requestedAt: string,
  waitPeriodHours: number
): { hours: number; minutes: number; expired: boolean } {
  const requestTime = new Date(requestedAt).getTime();
  const expiresAt = requestTime + waitPeriodHours * 60 * 60 * 1000;
  const remaining = expiresAt - Date.now();

  if (remaining <= 0) {
    return { hours: 0, minutes: 0, expired: true };
  }

  const totalMinutes = Math.floor(remaining / 60000);
  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
    expired: false,
  };
}

/**
 * Convert an EmergencyGrant into a display-ready GrantListItem.
 */
export function toGrantListItem(grant: EmergencyGrant, role: 'grantor' | 'grantee'): GrantListItem {
  const email = role === 'grantor' ? grant.granteeEmail : grant.grantorEmail;
  const actions = role === 'grantor' ? getGrantorActions(grant) : getGranteeActions(grant);
  const timeRemaining =
    grant.status === 'waiting' && grant.requestedAt
      ? calculateTimeRemaining(grant.requestedAt, grant.waitPeriod)
      : undefined;

  return {
    id: grant.id,
    email,
    role,
    statusBadge: getStatusBadge(grant.status),
    statusDescription: getStatusDescription(grant.status),
    waitPeriodLabel: formatWaitPeriod(grant.waitPeriod),
    timeRemaining,
    actions,
  };
}

/**
 * Process an array of grants into display-ready GrantListItems.
 */
export function processGrantList(
  grants: EmergencyGrant[],
  role: 'grantor' | 'grantee'
): GrantListItem[] {
  return grants.map((grant) => toGrantListItem(grant, role));
}

/**
 * Get available actions for a grantor based on grant status.
 * - pending: revoke
 * - confirmed: revoke
 * - waiting: approve, reject
 * - approved: revoke
 * - rejected/revoked: no actions
 */
export function getGrantorActions(grant: EmergencyGrant): EmergencyAccessAction[] {
  switch (grant.status) {
    case 'pending':
      return [{ type: 'revoke', grantId: grant.id }];
    case 'confirmed':
      return [{ type: 'revoke', grantId: grant.id }];
    case 'waiting':
      return [
        { type: 'approve', grantId: grant.id },
        { type: 'reject', grantId: grant.id },
      ];
    case 'approved':
      return [{ type: 'revoke', grantId: grant.id }];
    case 'rejected':
    case 'revoked':
      return [];
    default:
      return [];
  }
}

/**
 * Get available actions for a grantee based on grant status.
 * - pending: confirm
 * - confirmed: request
 * - waiting/approved/rejected/revoked: no actions
 */
export function getGranteeActions(grant: EmergencyGrant): EmergencyAccessAction[] {
  switch (grant.status) {
    case 'pending':
      return [{ type: 'confirm', grantId: grant.id }];
    case 'confirmed':
      return [{ type: 'request', grantId: grant.id }];
    case 'waiting':
    case 'approved':
    case 'rejected':
    case 'revoked':
      return [];
    default:
      return [];
  }
}

/**
 * Validate a wait period value. Must be between 1 and 720 hours (30 days).
 */
export function validateWaitPeriod(hours: number): boolean {
  return Number.isInteger(hours) && hours >= 1 && hours <= 720;
}

/**
 * Get the list of preset wait period options.
 */
export function getAvailableWaitPeriods(): Array<{ label: string; value: number }> {
  return [
    { label: '1 hour', value: 1 },
    { label: '12 hours', value: 12 },
    { label: '1 day', value: 24 },
    { label: '3 days', value: 72 },
    { label: '7 days', value: 168 },
    { label: '14 days', value: 336 },
    { label: '30 days', value: 720 },
  ];
}
