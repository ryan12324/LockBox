/**
 * otpauth:// URI parsing and building
 * https://github.com/google/google-authenticator/wiki/Key-Uri-Format
 */

import { base32Decode, base32Encode } from './base32';

export interface OtpAuthParams {
  type: 'totp' | 'hotp';
  secret: Uint8Array;
  issuer?: string;
  account: string;
  period?: number;
  digits?: number;
  algorithm?: string;
  counter?: number;
}

/**
 * Parse an otpauth:// URI and extract parameters
 * 
 * @param uri - The otpauth:// URI string
 * @returns Parsed OtpAuthParams
 */
export function parseOtpAuthUri(uri: string): OtpAuthParams {
  const url = new URL(uri);
  
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
  const pathname = decodeURIComponent(url.pathname);
  const pathParts = pathname.substring(1).split(':'); // Remove leading /
  
  let account: string;
  let issuerFromPath: string | undefined;
  
  if (pathParts.length === 2) {
    issuerFromPath = pathParts[0];
    account = pathParts[1];
  } else if (pathParts.length === 1) {
    account = pathParts[0];
  } else {
    throw new Error('Invalid otpauth URI: invalid account format');
  }
  
  // Extract query parameters
  const secret = url.searchParams.get('secret');
  if (!secret) {
    throw new Error('Invalid otpauth URI: missing secret parameter');
  }
  
  const issuer = url.searchParams.get('issuer') ?? issuerFromPath;
  const periodStr = url.searchParams.get('period');
  const digitsStr = url.searchParams.get('digits');
  const algorithm = url.searchParams.get('algorithm') ?? undefined;
  const counterStr = url.searchParams.get('counter');
  
  // Decode secret from base32
  let secretBytes: Uint8Array;
  try {
    secretBytes = base32Decode(secret);
  } catch (e) {
    throw new Error(`Invalid otpauth URI: invalid base32 secret: ${e}`);
  }
  
  return {
    type: type as 'totp' | 'hotp',
    secret: secretBytes,
    issuer: issuer ?? undefined,
    account,
    period: periodStr ? parseInt(periodStr, 10) : undefined,
    digits: digitsStr ? parseInt(digitsStr, 10) : undefined,
    algorithm,
    counter: counterStr ? parseInt(counterStr, 10) : undefined,
  };
}

/**
 * Build an otpauth:// URI from parameters
 * 
 * @param params - OtpAuthParams
 * @returns The otpauth:// URI string
 */
export function buildOtpAuthUri(params: OtpAuthParams): string {
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
    queryParts.push(`algorithm=${encodeURIComponent(params.algorithm)}`);
  }
  if (params.counter !== undefined) {
    queryParts.push(`counter=${params.counter}`);
  }
  
  const queryString = queryParts.join('&');
  const uri = `otpauth://${params.type}/${encodeURIComponent(label)}?${queryString}`;
  
  return uri;
}
