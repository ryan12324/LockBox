/**
 * Account-level two-factor authentication types.
 * For TOTP 2FA on the user's Lockbox account itself.
 */

/**
 * Request to initiate 2FA setup.
 * Server generates TOTP secret and returns otpauth:// URI.
 */
export interface TotpTwoFactorSetupResponse {
  secret: string; // base32-encoded TOTP secret
  otpauthUri: string; // otpauth://totp/Lockbox:user@email?secret=...&issuer=Lockbox
}

/**
 * Request to verify and enable 2FA.
 * Client sends a TOTP code to confirm they have the secret.
 */
export interface TotpTwoFactorVerifyRequest {
  code: string; // 6-digit TOTP code
}

/**
 * Response after 2FA verification succeeds.
 * Contains backup codes for account recovery.
 */
export interface TotpTwoFactorVerifyResponse {
  enabled: boolean;
  backupCodes: string[]; // 8 single-use backup codes
}

/**
 * Request to validate 2FA during login.
 * Sent after initial login returns requires2FA.
 */
export interface TotpTwoFactorValidateRequest {
  tempToken: string; // temporary token from login response
  code: string; // 6-digit TOTP code OR backup code
}

/**
 * Backup code for account recovery.
 */
export interface BackupCode {
  code: string;
  used: boolean;
  createdAt: string; // ISO 8601
}
