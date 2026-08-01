/**
 * otpauth:// URI parsing and building
 * https://github.com/google/google-authenticator/wiki/Key-Uri-Format
 */

import { base32Decode, base32Encode } from './base32';
import type { TOTPAlgorithm } from './totp';

export interface OtpAuthParams {
  type: 'totp' | 'hotp';
  secret: Uint8Array;
  issuer?: string;
  account: string;
  period?: number;
  digits?: number;
  algorithm?: TOTPAlgorithm;
  counter?: number;
}

/**
 * Parse an otpauth:// URI and extract parameters
 * 
 * @param uri - The otpauth:// URI string
 * @returns Parsed OtpAuthParams
 */
export function parseOtpAuthUri(uri: string): OtpAuthParams {
  const url = new URL(uri.trim());
  
  // Validate protocol
  if (url.protocol !== 'otpauth:') {
    throw new Error('Invalid otpauth URI: must start with otpauth://');
  }
  
  // Extract type (totp or hotp)
  const type = url.hostname.toLowerCase();
  if (type !== 'totp' && type !== 'hotp') {
    throw new Error(`Invalid otpauth type: ${type}. Must be 'totp' or 'hotp'`);
  }
  
  // Extract account and issuer from pathname
  // Format: /ISSUER:ACCOUNT or /ACCOUNT
  const label = decodeURIComponent(url.pathname.substring(1));
  const separator = label.indexOf(':');
  const issuerFromPath = separator >= 0 ? label.slice(0, separator) : undefined;
  const account = separator >= 0 ? label.slice(separator + 1) : label;
  if (!account) throw new Error('Invalid otpauth URI: missing account label');
  
  // Extract query parameters
  const secret = url.searchParams.get('secret');
  if (!secret) {
    throw new Error('Invalid otpauth URI: missing secret parameter');
  }
  
  const issuer = url.searchParams.get('issuer') ?? issuerFromPath;
  const periodStr = url.searchParams.get('period');
  const digitsStr = url.searchParams.get('digits');
  const algorithm = normalizeOtpAlgorithm(url.searchParams.get('algorithm') ?? undefined);
  const counterStr = url.searchParams.get('counter');
  
  // Decode secret from base32
  let secretBytes: Uint8Array;
  try {
    secretBytes = base32Decode(secret);
  } catch (e) {
    throw new Error(`Invalid otpauth URI: invalid base32 secret: ${e}`);
  }
  
  const period = parseIntegerParameter('period', periodStr, 1, 86_400);
  const digits = parseIntegerParameter('digits', digitsStr, 6, 8);
  const counter = parseIntegerParameter('counter', counterStr, 0, Number.MAX_SAFE_INTEGER);
  if (type === 'hotp' && counter === undefined) {
    throw new Error('Invalid otpauth URI: HOTP requires a counter parameter');
  }

  return {
    type: type as 'totp' | 'hotp',
    secret: secretBytes,
    issuer: issuer ?? undefined,
    account,
    period,
    digits,
    algorithm,
    counter,
  };
}

function parseIntegerParameter(
  name: string,
  value: string | null,
  minimum: number,
  maximum: number,
): number | undefined {
  if (value === null) return undefined;
  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid otpauth URI: ${name} must be an integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(
      `Invalid otpauth URI: ${name} must be between ${minimum} and ${maximum}`,
    );
  }
  return parsed;
}

export function normalizeOtpAlgorithm(value?: string): TOTPAlgorithm | undefined {
  if (value === undefined || value === '') return undefined;
  switch (value.toUpperCase().replace(/[^A-Z0-9]/g, '')) {
    case 'SHA1':
      return 'SHA-1';
    case 'SHA256':
      return 'SHA-256';
    case 'SHA512':
      return 'SHA-512';
    default:
      throw new Error(`Invalid otpauth URI: unsupported algorithm ${value}`);
  }
}

/**
 * Build an otpauth:// URI from parameters
 * 
 * @param params - OtpAuthParams
 * @returns The otpauth:// URI string
 */
export function buildOtpAuthUri(params: OtpAuthParams): string {
  if (!params.account.trim()) {
    throw new Error('OTP account label must not be empty');
  }
  if (params.type === 'hotp' && params.counter === undefined) {
    throw new Error('HOTP requires a counter parameter');
  }
  if (params.period !== undefined) parseIntegerParameter('period', String(params.period), 1, 86_400);
  if (params.digits !== undefined) parseIntegerParameter('digits', String(params.digits), 6, 8);
  if (params.counter !== undefined) {
    parseIntegerParameter('counter', String(params.counter), 0, Number.MAX_SAFE_INTEGER);
  }
  // Encode secret to base32
  const secretBase32 = base32Encode(params.secret);
  
  // Build the label (account or issuer:account)
  let label = params.account;
  if (params.issuer) {
    label = `${params.issuer}:${params.account}`;
  }
  
  // Build query string manually to avoid double-encoding
  const queryParts: string[] = [];
  queryParts.push(`secret=${secretBase32}`);
  
  if (params.issuer) {
    queryParts.push(`issuer=${encodeURIComponent(params.issuer)}`);
  }
  if (params.period !== undefined) {
    queryParts.push(`period=${params.period}`);
  }
  if (params.digits !== undefined) {
    queryParts.push(`digits=${params.digits}`);
  }
  if (params.algorithm) {
    queryParts.push(`algorithm=${params.algorithm.replace('-', '')}`);
  }
  if (params.counter !== undefined) {
    queryParts.push(`counter=${params.counter}`);
  }
  
  const queryString = queryParts.join('&');
  const uri = `otpauth://${params.type}/${encodeURIComponent(label)}?${queryString}`;
  
  return uri;
}
