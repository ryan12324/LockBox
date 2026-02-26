import { describe, it, expect } from 'vitest';
import { hotp, totp, getRemainingSeconds } from '../totp';
import { base32Encode, base32Decode } from '../base32';
import { parseOtpAuthUri, buildOtpAuthUri } from '../uri';

/**
 * RFC 6238 Appendix B Test Vectors
 * https://www.rfc-editor.org/rfc/rfc6238#appendix-B
 * 
 * Secret: "12345678901234567890" (ASCII)
 * Time step: 30 seconds
 * Digits: 6
 * Algorithm: SHA-1
 */

// Helper to convert ASCII string to Uint8Array
function asciiToBytes(str: string): Uint8Array {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i);
  }
  return bytes;
}

describe('TOTP - RFC 6238 Test Vectors', () => {
  const secret = asciiToBytes('12345678901234567890');

  it('should generate correct TOTP for time=59 (287082)', async () => {
    // time=59 seconds → counter = 59 / 30 = 1
    const code = await totp(secret, 59 * 1000, { period: 30, digits: 6, algorithm: 'SHA-1' });
    expect(code).toBe('287082');
  });

  it('should generate correct TOTP for time=1111111109 (081804)', async () => {
    // time=1111111109 seconds
    const code = await totp(secret, 1111111109 * 1000, { period: 30, digits: 6, algorithm: 'SHA-1' });
    expect(code).toBe('081804');
  });

  it('should generate correct TOTP for time=1111111111 (050471)', async () => {
    // time=1111111111 seconds
    const code = await totp(secret, 1111111111 * 1000, { period: 30, digits: 6, algorithm: 'SHA-1' });
    expect(code).toBe('050471');
  });

  it('should generate correct TOTP for time=1234567890 (005924)', async () => {
    // time=1234567890 seconds
    const code = await totp(secret, 1234567890 * 1000, { period: 30, digits: 6, algorithm: 'SHA-1' });
    expect(code).toBe('005924');
  });

  it('should generate correct TOTP for time=2000000000 (279037)', async () => {
    // time=2000000000 seconds
    const code = await totp(secret, 2000000000 * 1000, { period: 30, digits: 6, algorithm: 'SHA-1' });
    expect(code).toBe('279037');
  });

  it('should generate correct TOTP for time=20000000000 (353130)', async () => {
    // time=20000000000 seconds
    const code = await totp(secret, 20000000000 * 1000, { period: 30, digits: 6, algorithm: 'SHA-1' });
    expect(code).toBe('353130');
  });
});

describe('HOTP - RFC 4226 Test Vectors', () => {
  const secret = asciiToBytes('12345678901234567890');

  // RFC 4226 Appendix D test vectors
  const testVectors = [
    { counter: 0, expected: '755224' },
    { counter: 1, expected: '287082' },
    { counter: 2, expected: '359152' },
    { counter: 3, expected: '969429' },
    { counter: 4, expected: '338314' },
    { counter: 5, expected: '254676' },
    { counter: 6, expected: '287922' },
    { counter: 7, expected: '162583' },
    { counter: 8, expected: '399871' },
    { counter: 9, expected: '520489' },
  ];

  testVectors.forEach(({ counter, expected }) => {
    it(`should generate correct HOTP for counter=${counter} (${expected})`, async () => {
      const code = await hotp(secret, counter, { digits: 6, algorithm: 'SHA-1' });
      expect(code).toBe(expected);
    });
  });
});

describe('Base32 Encoding/Decoding', () => {
  it('should encode and decode round-trip correctly', () => {
    const original = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
    const encoded = base32Encode(original);
    const decoded = base32Decode(encoded);
    expect(decoded).toEqual(original);
  });

  it('should decode standard base32 strings', () => {
    // "JBSWY3DPEBLW64TMMQ======" is base32 for "Hello World"
    const decoded = base32Decode('JBSWY3DPEBLW64TMMQ======');
    const expected = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0x57, 0x6f, 0x72, 0x6c, 0x64]);
    expect(decoded).toEqual(expected);
  });

  it('should handle padding correctly', () => {
    const encoded = 'JBSWY3DPEBLW64TMMQ======';
    const decoded = base32Decode(encoded);
    const expected = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0x57, 0x6f, 0x72, 0x6c, 0x64]);
    expect(decoded).toEqual(expected);
  });

  it('should be case-insensitive', () => {
    const upper = base32Decode('JBSWY3DPEBLW64TMMQ======');
    const lower = base32Decode('jbswy3dpeblw64tmmq======');
    expect(upper).toEqual(lower);
  });

  it('should throw on invalid characters', () => {
    expect(() => base32Decode('INVALID!@#$')).toThrow();
  });
});

describe('otpauth:// URI Parsing and Building', () => {
  it('should parse a valid TOTP URI', () => {
    const uri = 'otpauth://totp/Example:user@example.com?secret=JBSWY3DPEBLW64TMMQ======&issuer=Example&period=30&digits=6&algorithm=SHA1';
    const params = parseOtpAuthUri(uri);
    
    expect(params.type).toBe('totp');
    expect(params.account).toBe('user@example.com');
    expect(params.issuer).toBe('Example');
    expect(params.period).toBe(30);
    expect(params.digits).toBe(6);
    expect(params.algorithm).toBe('SHA1');
  });

  it('should parse a HOTP URI', () => {
    const uri = 'otpauth://hotp/Example:user@example.com?secret=JBSWY3DPEBLW64TMMQ======&issuer=Example&counter=0';
    const params = parseOtpAuthUri(uri);
    
    expect(params.type).toBe('hotp');
    expect(params.account).toBe('user@example.com');
    expect(params.issuer).toBe('Example');
    expect(params.counter).toBe(0);
  });

  it('should parse URI without issuer in path', () => {
    const uri = 'otpauth://totp/user@example.com?secret=JBSWY3DPEBLW64TMMQ======&issuer=Example';
    const params = parseOtpAuthUri(uri);
    
    expect(params.account).toBe('user@example.com');
    expect(params.issuer).toBe('Example');
  });

  it('should build a TOTP URI correctly', () => {
    const secret = base32Decode('JBSWY3DPEBLW64TMMQ======');
    const params = {
      type: 'totp' as const,
      secret,
      account: 'user@example.com',
      issuer: 'Example',
      period: 30,
      digits: 6,
      algorithm: 'SHA1',
    };
    
    const uri = buildOtpAuthUri(params);
    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain('secret=JBSWY3DPEBLW64TMMQ======');
    expect(uri).toContain('issuer=Example');
    expect(uri).toContain('period=30');
    expect(uri).toContain('digits=6');
    expect(uri).toContain('algorithm=SHA1');
    // Label is URL-encoded
    expect(uri).toContain('Example%3Auser%40example.com');
  });

  it('should round-trip URI parsing and building', () => {
    const uri = 'otpauth://totp/Example%3Auser%40example.com?secret=JBSWY3DPEBLW64TMMQ======&issuer=Example&period=30&digits=6&algorithm=SHA1';
    const params = parseOtpAuthUri(uri);
    const rebuilt = buildOtpAuthUri(params);
    const reparsed = parseOtpAuthUri(rebuilt);
    
    expect(reparsed.type).toBe(params.type);
    expect(reparsed.account).toBe(params.account);
    expect(reparsed.issuer).toBe(params.issuer);
    expect(reparsed.period).toBe(params.period);
    expect(reparsed.digits).toBe(params.digits);
    expect(reparsed.algorithm).toBe(params.algorithm);
    expect(reparsed.secret).toEqual(params.secret);
  });

  it('should throw on invalid URI protocol', () => {
    expect(() => parseOtpAuthUri('http://example.com')).toThrow();
  });

  it('should throw on missing secret', () => {
    expect(() => parseOtpAuthUri('otpauth://totp/Example:user@example.com')).toThrow();
  });

  it('should throw on invalid base32 secret', () => {
    expect(() => parseOtpAuthUri('otpauth://totp/Example:user@example.com?secret=INVALID!@#$')).toThrow();
  });
});

describe('getRemainingSeconds', () => {
  it('should return a value between 0 and period', () => {
    const remaining = getRemainingSeconds(30);
    expect(remaining).toBeGreaterThanOrEqual(0);
    expect(remaining).toBeLessThanOrEqual(30);
  });

  it('should use default period of 30', () => {
    const remaining = getRemainingSeconds();
    expect(remaining).toBeGreaterThanOrEqual(0);
    expect(remaining).toBeLessThanOrEqual(30);
  });

  it('should work with custom periods', () => {
    const remaining60 = getRemainingSeconds(60);
    expect(remaining60).toBeGreaterThanOrEqual(0);
    expect(remaining60).toBeLessThanOrEqual(60);
  });
});

describe('TOTP with different algorithms', () => {
  const secret = asciiToBytes('12345678901234567890');

  it('should support SHA-256', async () => {
    const code = await totp(secret, 59 * 1000, { period: 30, digits: 6, algorithm: 'SHA-256' });
    expect(code).toMatch(/^\d{6}$/);
  });

  it('should support SHA-512', async () => {
    const code = await totp(secret, 59 * 1000, { period: 30, digits: 6, algorithm: 'SHA-512' });
    expect(code).toMatch(/^\d{6}$/);
  });
});

describe('TOTP with different digit counts', () => {
  const secret = asciiToBytes('12345678901234567890');

  it('should generate 8-digit codes', async () => {
    const code = await totp(secret, 59 * 1000, { period: 30, digits: 8, algorithm: 'SHA-1' });
    expect(code).toMatch(/^\d{8}$/);
  });

  it('should generate 7-digit codes', async () => {
    const code = await totp(secret, 59 * 1000, { period: 30, digits: 7, algorithm: 'SHA-1' });
    expect(code).toMatch(/^\d{7}$/);
  });
});
