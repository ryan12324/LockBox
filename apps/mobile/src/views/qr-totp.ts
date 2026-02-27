/**
 * QR TOTP utilities — parsing otpauth:// URIs from QR code scans.
 *
 * Parses the otpauth://totp/... URI format defined by
 * Google Authenticator's key URI specification.
 * Used after scanning a QR code with the QRScanner plugin.
 */

/** Parsed OTP auth URI components */
export interface OtpAuthParams {
  /** Base32-encoded shared secret */
  secret: string;
  /** Service provider name (e.g. "GitHub") */
  issuer: string;
  /** Account identifier (e.g. "user@example.com") */
  account: string;
  /** Hash algorithm (default: SHA1) */
  algorithm: string;
  /** Number of digits in the OTP code (default: 6) */
  digits: number;
  /** Time step in seconds (default: 30) */
  period: number;
}

/**
 * Parse an otpauth:// URI into its component parts.
 * Supports the standard otpauth://totp/ format used by authenticator apps.
 *
 * @param uri - The otpauth:// URI to parse (e.g. "otpauth://totp/GitHub:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub")
 * @returns Parsed OTP parameters, or null if the URI is invalid
 */
export function parseOtpAuthUri(uri: string): OtpAuthParams | null {
  if (!uri || !uri.startsWith('otpauth://totp/')) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return null;
  }

  const secret = parsed.searchParams.get('secret');
  if (!secret) {
    return null;
  }

  // Label format: "issuer:account" or just "account"
  const label = decodeURIComponent(parsed.pathname.slice(1)); // remove leading /
  const colonIndex = label.indexOf(':');
  let issuer: string;
  let account: string;

  if (colonIndex !== -1) {
    issuer = label.slice(0, colonIndex).trim();
    account = label.slice(colonIndex + 1).trim();
  } else {
    issuer = '';
    account = label.trim();
  }

  // Issuer param overrides label-derived issuer
  const issuerParam = parsed.searchParams.get('issuer');
  if (issuerParam) {
    issuer = issuerParam;
  }

  const algorithm = parsed.searchParams.get('algorithm') ?? 'SHA1';
  const digitsParam = parsed.searchParams.get('digits');
  const digits = digitsParam ? parseInt(digitsParam, 10) : 6;
  const periodParam = parsed.searchParams.get('period');
  const period = periodParam ? parseInt(periodParam, 10) : 30;

  // Validate numeric params
  if (isNaN(digits) || isNaN(period) || digits < 1 || period < 1) {
    return null;
  }

  return { secret, issuer, account, algorithm, digits, period };
}
