/**
 * Auth module barrel exports — 2FA login flow and setup utilities.
 */

export {
  isTwoFactorChallenge,
  isValidTotpCode,
  isValidBackupCode,
  createTwoFactorLoginState,
  toggleBackupCodeMode,
  validate2FACode,
  setup2FA,
  verify2FASetup,
  disable2FA,
  executeTwoFactorLogin,
  TwoFactorError,
} from './two-factor.js';

export type {
  TwoFactorChallenge,
  TwoFactorValidateResponse,
  TwoFactorSetupResponse,
  TwoFactorVerifyResponse,
  TwoFactorDisableResponse,
  TwoFactorLoginState,
  TwoFactorSetupState,
} from './two-factor.js';
