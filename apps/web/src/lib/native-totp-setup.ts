import { buildOtpAuthUri, parseOtpAuthUri, parseTotpSecret } from '@lockbox/totp';

export interface NativeTotpProposal {
  name: string;
  username: string;
  totp: string;
  suggestedUri?: string;
}

/** In-memory semantic fingerprint for deduping raw Base32 and equivalent URIs. */
export function totpSetupFingerprint(value: string): string | null {
  try {
    const parsed = parseTotpSecret(value);
    const secret = Array.from(parsed.secret, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${parsed.algorithm}:${parsed.digits}:${parsed.period}:${secret}`;
  } catch {
    return null;
  }
}

/** Parse Apple's standard setup link or a bounded Google Authenticator migration payload. */
export function parseNativeTotpSetupUri(value: string): NativeTotpProposal[] {
  if (value.length > 131_072) throw new Error('Verification-code setup is too large');
  const url = new URL(value);
  if (url.protocol === 'otpauth:') return [proposalFromOtpAuth(value)];
  if (url.protocol !== 'otpauth-migration:' || url.hostname !== 'offline') {
    throw new Error('Unsupported verification-code setup link');
  }
  const encoded = url.searchParams.get('data')?.replaceAll(' ', '+');
  if (!encoded || encoded.length > 100_000) throw new Error('Invalid authenticator migration link');
  const bytes = decodeBase64(encoded);
  if (bytes.length > 65_536) throw new Error('Authenticator migration payload is too large');
  const root = new ProtoReader(bytes);
  const proposals: NativeTotpProposal[] = [];
  while (!root.done) {
    const { field, wire } = root.tag();
    if (field === 1 && wire === 2) {
      if (proposals.length >= 50) throw new Error('Authenticator migration contains too many accounts');
      const proposal = parseMigrationOtp(root.message());
      if (proposal) proposals.push(proposal);
    } else {
      root.skip(wire);
    }
  }
  if (proposals.length === 0) {
    throw new Error('The migration link contains no supported time-based verification codes');
  }
  return proposals;
}

function proposalFromOtpAuth(value: string): NativeTotpProposal {
  const parsed = parseOtpAuthUri(value);
  if (parsed.type !== 'totp') throw new Error('HOTP setup links are not supported');
  return {
    name: parsed.issuer?.trim() || parsed.account.trim(),
    username: parsed.account.trim(),
    totp: buildOtpAuthUri(parsed),
    suggestedUri: issuerWebsite(parsed.issuer),
  };
}

function parseMigrationOtp(reader: ProtoReader): NativeTotpProposal | null {
  let secret: Uint8Array | null = null;
  let username = '';
  let issuer = '';
  let algorithm = 1;
  let digits = 1;
  let type = 2;
  while (!reader.done) {
    const { field, wire } = reader.tag();
    if (field === 1 && wire === 2) secret = reader.bytes();
    else if (field === 2 && wire === 2) username = reader.text();
    else if (field === 3 && wire === 2) issuer = reader.text();
    else if (field === 4 && wire === 0) algorithm = reader.integer();
    else if (field === 5 && wire === 0) digits = reader.integer();
    else if (field === 6 && wire === 0) type = reader.integer();
    else reader.skip(wire);
  }
  if (type !== 2 || !secret || secret.length < 10 || secret.length > 256) return null;
  if (!username.trim() || username.length > 500 || issuer.length > 500) {
    throw new Error('Authenticator migration contains invalid account labels');
  }
  const normalizedAlgorithm = algorithm === 1 || algorithm === 0
    ? 'SHA-1'
    : algorithm === 2
      ? 'SHA-256'
      : algorithm === 3
        ? 'SHA-512'
        : null;
  if (!normalizedAlgorithm) return null;
  const normalizedDigits = digits === 2 ? 8 : digits === 1 || digits === 0 ? 6 : null;
  if (!normalizedDigits) return null;
  const name = issuer.trim() || username.trim();
  return {
    name,
    username: username.trim(),
    totp: buildOtpAuthUri({
      type: 'totp',
      secret,
      issuer: issuer.trim() || undefined,
      account: username.trim(),
      algorithm: normalizedAlgorithm,
      digits: normalizedDigits,
      period: 30,
    }),
    suggestedUri: issuerWebsite(issuer),
  };
}

function issuerWebsite(issuer?: string): string | undefined {
  const candidate = issuer?.trim().toLowerCase();
  if (!candidate || candidate.length > 253 || !candidate.includes('.')) return undefined;
  try {
    const url = new URL(`https://${candidate}`);
    return url.hostname === candidate ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

function decodeBase64(value: string): Uint8Array {
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new Error('Invalid authenticator migration encoding');
  }
}

class ProtoReader {
  private offset = 0;

  constructor(private readonly data: Uint8Array) {}

  get done(): boolean {
    return this.offset === this.data.length;
  }

  tag(): { field: number; wire: number } {
    const value = this.varint();
    const field = Math.floor(value / 8);
    const wire = value & 7;
    if (field < 1 || field > 536_870_911) throw new Error('Invalid migration field');
    return { field, wire };
  }

  integer(): number {
    return this.varint();
  }

  bytes(): Uint8Array {
    const length = this.varint();
    if (length > 65_536 || this.offset + length > this.data.length) {
      throw new Error('Truncated authenticator migration payload');
    }
    const result = this.data.slice(this.offset, this.offset + length);
    this.offset += length;
    return result;
  }

  message(): ProtoReader {
    return new ProtoReader(this.bytes());
  }

  text(): string {
    const value = new TextDecoder('utf-8', { fatal: true }).decode(this.bytes());
    if (value.length > 500) throw new Error('Authenticator migration label is too long');
    return value;
  }

  skip(wire: number): void {
    if (wire === 0) void this.varint();
    else if (wire === 1) this.advance(8);
    else if (wire === 2) this.advance(this.varint());
    else if (wire === 5) this.advance(4);
    else throw new Error('Unsupported authenticator migration field');
  }

  private advance(length: number): void {
    if (!Number.isSafeInteger(length) || length < 0 || this.offset + length > this.data.length) {
      throw new Error('Truncated authenticator migration payload');
    }
    this.offset += length;
  }

  private varint(): number {
    let value = 0;
    let multiplier = 1;
    for (let count = 0; count < 10; count += 1) {
      if (this.offset >= this.data.length) throw new Error('Truncated authenticator migration payload');
      const byte = this.data[this.offset++];
      value += (byte & 0x7f) * multiplier;
      if ((byte & 0x80) === 0) {
        if (!Number.isSafeInteger(value)) throw new Error('Authenticator migration number is too large');
        return value;
      }
      multiplier *= 128;
    }
    throw new Error('Invalid authenticator migration number');
  }
}
