import { base32Decode } from './base32';
import { getRemainingSeconds, totp, type TOTPAlgorithm } from './totp';
import { parseOtpAuthUri } from './uri';

export interface ParsedTotpSecret {
  secret: Uint8Array;
  period: number;
  digits: number;
  algorithm: TOTPAlgorithm;
  issuer?: string;
  account?: string;
  source: 'base32' | 'otpauth';
}

export interface GeneratedTotp extends Omit<ParsedTotpSecret, 'secret'> {
  code: string;
  remaining: number;
}

/** Parse either a raw Base32 key or an otpauth://totp URI into one canonical config. */
export function parseTotpSecret(value: string): ParsedTotpSecret {
  const input = value.trim();
  if (!input) throw new Error('TOTP secret is required');

  if (/^otpauth:\/\//i.test(input)) {
    const parsed = parseOtpAuthUri(input);
    if (parsed.type !== 'totp') {
      throw new Error('HOTP keys are not supported in TOTP fields');
    }
    return {
      secret: parsed.secret,
      period: parsed.period ?? 30,
      digits: parsed.digits ?? 6,
      algorithm: parsed.algorithm ?? 'SHA-1',
      issuer: parsed.issuer,
      account: parsed.account,
      source: 'otpauth',
    };
  }

  return {
    secret: base32Decode(input),
    period: 30,
    digits: 6,
    algorithm: 'SHA-1',
    source: 'base32',
  };
}

/** Generate a code and synchronized countdown from a raw key or otpauth URI. */
export async function generateTotp(value: string, time = Date.now()): Promise<GeneratedTotp> {
  const parsed = parseTotpSecret(value);
  const code = await totp(parsed.secret, time, parsed);
  const { secret: _secret, ...metadata } = parsed;
  return {
    ...metadata,
    code,
    remaining: getRemainingSeconds(parsed.period, time),
  };
}
