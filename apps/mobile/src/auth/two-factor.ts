/**
 * Two-Factor Authentication — login flow and setup utilities.
 *
 * SECURITY:
 * - tempToken is kept in memory only, NEVER persisted
 * - 2FA secrets never stored on the mobile device
 * - Backup codes displayed once then discarded from memory
 *
 * Login flow:
 * 1. Normal login → API returns { requires2FA: true, tempToken }
 * 2. User enters 6-digit TOTP code (or backup code)
 * 3. POST /api/auth/2fa/validate { tempToken, code } → { token, user }
 * 4. On success: complete login with session token
 *
 * Setup flow:
 * 1. POST /api/auth/2fa/setup → { secret, otpauthUri }
 * 2. Display QR code from otpauthUri
 * 3. User enters verification code
 * 4. POST /api/auth/2fa/verify { code } → { enabled, backupCodes }
 * 5. Display backup codes to user (one-time display)
 *
 * Disable flow:
 * 1. POST /api/auth/2fa/disable → { disabled: true }
 */

/** API base URL — read from Vite env at build time */
const API_BASE: string =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL
    ? String(import.meta.env.VITE_API_URL)
    : '';

/** 2FA challenge returned by login when 2FA is required */
export interface TwoFactorChallenge {
  requires2FA: true;
  tempToken: string;
}

/** Response from 2FA validation (successful code entry) */
export interface TwoFactorValidateResponse {
  token: string;
  user: {
    id: string;
    email: string;
    encryptedUserKey: string;
    kdfConfig: { algorithm: string; iterations: number; memory: number; parallelism: number };
    salt: string;
  };
}

/** Response from 2FA setup initiation */
export interface TwoFactorSetupResponse {
  secret: string;
  otpauthUri: string;
}

/** Response from 2FA verification (confirming setup) */
export interface TwoFactorVerifyResponse {
  enabled: boolean;
  backupCodes: string[];
}

/** Response from 2FA disable */
export interface TwoFactorDisableResponse {
  disabled: boolean;
}

/** 2FA validation error */
export class TwoFactorError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'TwoFactorError';
  }
}

/** State of the 2FA login flow */
export type TwoFactorLoginState =
  | { step: 'idle' }
  | { step: 'code_entry'; tempToken: string; useBackupCode: boolean }
  | { step: 'validating'; tempToken: string }
  | { step: 'success'; response: TwoFactorValidateResponse }
  | { step: 'error'; tempToken: string; error: string; useBackupCode: boolean };

/** State of the 2FA setup flow */
export type TwoFactorSetupState =
  | { step: 'idle' }
  | { step: 'loading' }
  | { step: 'show_qr'; secret: string; otpauthUri: string }
  | { step: 'verifying' }
  | { step: 'show_backup_codes'; backupCodes: string[] }
  | { step: 'complete' }
  | { step: 'error'; error: string };

/**
 * Check whether a login response indicates a 2FA challenge.
 */
export function isTwoFactorChallenge(response: unknown): response is TwoFactorChallenge {
  if (typeof response !== 'object' || response === null) return false;
  const obj = response as Record<string, unknown>;
  return obj.requires2FA === true && typeof obj.tempToken === 'string';
}

/**
 * Validate a 6-digit TOTP code format.
 * Returns true for valid 6-digit numeric strings.
 */
export function isValidTotpCode(code: string): boolean {
  return /^\d{6}$/.test(code);
}

/**
 * Validate a backup code format.
 * Backup codes are non-empty alphanumeric strings (typically 8+ chars).
 */
export function isValidBackupCode(code: string): boolean {
  return code.trim().length >= 6;
}

/**
 * Create the initial 2FA login state when a challenge is received.
 */
export function createTwoFactorLoginState(tempToken: string): TwoFactorLoginState {
  return { step: 'code_entry', tempToken, useBackupCode: false };
}

/**
 * Switch between TOTP code and backup code entry.
 */
export function toggleBackupCodeMode(state: TwoFactorLoginState): TwoFactorLoginState {
  if (state.step === 'code_entry') {
    return { ...state, useBackupCode: !state.useBackupCode };
  }
  if (state.step === 'error') {
    return { step: 'code_entry', tempToken: state.tempToken, useBackupCode: !state.useBackupCode };
  }
  return state;
}

// ─── API Functions ────────────────────────────────────────────────────────────

/** Request timeout in milliseconds (30 seconds) */
const REQUEST_TIMEOUT_MS = 30_000;

/** Internal fetch helper for 2FA endpoints */
async function twoFactorRequest<T>(
  path: string,
  options: { method: string; body?: string; token?: string; apiBase?: string }
): Promise<T> {
  const base = options.apiBase ?? API_BASE;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: options.method,
      headers,
      body: options.body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  // Parse JSON safely — non-JSON responses (e.g. HTML error pages) fall back to statusText
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    if (!res.ok) {
      throw new TwoFactorError(res.status, res.statusText);
    }
    throw new TwoFactorError(res.status, 'Invalid JSON response from server');
  }

  if (!res.ok) {
    const errorMsg = (data as Record<string, unknown>).error;
    throw new TwoFactorError(res.status, typeof errorMsg === 'string' ? errorMsg : res.statusText);
  }

  return data as T;
}

/**
 * Validate a 2FA code (TOTP or backup) during login.
 * Uses the tempToken from the 2FA challenge — no auth session needed.
 *
 * @param tempToken - Temporary token from the 2FA challenge (memory only!)
 * @param code - 6-digit TOTP code or backup code
 * @param apiBase - Optional API base URL override
 */
export async function validate2FACode(
  tempToken: string,
  code: string,
  apiBase?: string
): Promise<TwoFactorValidateResponse> {
  return twoFactorRequest<TwoFactorValidateResponse>('/api/auth/2fa/validate', {
    method: 'POST',
    body: JSON.stringify({ tempToken, code }),
    apiBase,
  });
}

/**
 * Initiate 2FA setup — returns secret and otpauthUri for QR code display.
 * Requires an authenticated session.
 *
 * @param token - Auth session token
 * @param apiBase - Optional API base URL override
 */
export async function setup2FA(token: string, apiBase?: string): Promise<TwoFactorSetupResponse> {
  return twoFactorRequest<TwoFactorSetupResponse>('/api/auth/2fa/setup', {
    method: 'POST',
    token,
    apiBase,
  });
}

/**
 * Verify 2FA setup by confirming a TOTP code.
 * On success, returns backup codes that must be displayed to the user.
 *
 * @param code - 6-digit TOTP code from authenticator app
 * @param token - Auth session token
 * @param apiBase - Optional API base URL override
 */
export async function verify2FASetup(
  code: string,
  token: string,
  apiBase?: string
): Promise<TwoFactorVerifyResponse> {
  return twoFactorRequest<TwoFactorVerifyResponse>('/api/auth/2fa/verify', {
    method: 'POST',
    body: JSON.stringify({ code }),
    token,
    apiBase,
  });
}

/**
 * Disable 2FA for the current user.
 * Requires an authenticated session.
 *
 * @param token - Auth session token
 * @param apiBase - Optional API base URL override
 */
export async function disable2FA(
  token: string,
  apiBase?: string
): Promise<TwoFactorDisableResponse> {
  return twoFactorRequest<TwoFactorDisableResponse>('/api/auth/2fa/disable', {
    method: 'POST',
    token,
    apiBase,
  });
}

/**
 * Full 2FA login flow orchestrator.
 * Manages state transitions from challenge → code entry → validation → success.
 *
 * @param tempToken - Temporary token from the 2FA challenge
 * @param code - User-entered code (TOTP or backup)
 * @param onSuccess - Callback with the validated response (token + user data)
 * @param onError - Callback with error message
 * @param apiBase - Optional API base URL override
 */
export async function executeTwoFactorLogin(
  tempToken: string,
  code: string,
  onSuccess: (response: TwoFactorValidateResponse) => void,
  onError: (error: string) => void,
  apiBase?: string
): Promise<void> {
  try {
    const response = await validate2FACode(tempToken, code, apiBase);
    onSuccess(response);
  } catch (err) {
    if (err instanceof TwoFactorError) {
      onError(err.message);
    } else {
      onError('An unexpected error occurred during 2FA validation');
    }
  }
}
