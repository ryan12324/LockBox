/**
 * Emergency access types for trusted contact key recovery.
 * Allows a designated grantee to request access to the grantor's vault
 * after a configurable wait period.
 */

/** Wait period options in days */
export type EmergencyWaitPeriod = 1 | 3 | 7 | 14 | 30;

/** Emergency access grant status */
export type EmergencyAccessStatus =
  | 'pending'
  | 'confirmed'
  | 'waiting'
  | 'approved'
  | 'rejected'
  | 'expired';

/** Emergency access grant — grantor designates a trusted contact */
export interface EmergencyAccessGrant {
  id: string;
  grantorUserId: string;
  granteeEmail: string;
  granteeUserId?: string; // Set when grantee confirms
  waitPeriodDays: EmergencyWaitPeriod;
  status: EmergencyAccessStatus;
  encryptedUserKey: string; // RSA-OAEP wrapped grantor's userKey with grantee's public key
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/** Emergency access request — grantee requests access */
export interface EmergencyAccessRequest {
  id: string;
  grantId: string;
  requestedAt: string; // ISO 8601
  approvedAt?: string; // ISO 8601
  rejectedAt?: string; // ISO 8601
  expiresAt: string; // ISO 8601 — when auto-approve triggers
}
