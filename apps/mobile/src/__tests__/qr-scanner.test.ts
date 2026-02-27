import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock @capacitor/core ─────────────────────────────────────────────────────

vi.mock('@capacitor/core', () => ({
  registerPlugin: vi.fn((name: string) => {
    return {
      _pluginName: name,
      scanQRCode: vi
        .fn()
        .mockResolvedValue({ value: 'otpauth://totp/Test?secret=ABC', format: 'QR_CODE' }),
      isAvailable: vi.fn().mockResolvedValue({ available: true }),
    };
  }),
}));

// ─── QRScannerPlugin ──────────────────────────────────────────────────────────

describe('QRScannerPlugin interface', () => {
  let QRScanner: import('../plugins/qr-scanner').QRScannerPlugin;

  beforeEach(async () => {
    const module = await import('../plugins/qr-scanner');
    QRScanner = module.QRScanner;
  });

  it('scanQRCode returns value and format', async () => {
    const result = await QRScanner.scanQRCode();
    expect(result).toHaveProperty('value');
    expect(result).toHaveProperty('format');
    expect(typeof result.value).toBe('string');
    expect(typeof result.format).toBe('string');
  });

  it('scanQRCode returns otpauth URI', async () => {
    const result = await QRScanner.scanQRCode();
    expect(result.value).toContain('otpauth://');
    expect(result.format).toBe('QR_CODE');
  });

  it('isAvailable returns availability status', async () => {
    const result = await QRScanner.isAvailable();
    expect(result).toHaveProperty('available');
    expect(typeof result.available).toBe('boolean');
  });
});

// ─── QRScanResult type guard ──────────────────────────────────────────────────

describe('QRScanResult type structure', () => {
  it('matches expected shape', () => {
    const result: import('../plugins/qr-scanner').QRScanResult = {
      value: 'otpauth://totp/GitHub:user@example.com?secret=JBSWY3DPEHPK3PXP',
      format: 'QR_CODE',
    };
    expect(result.value).toBe('otpauth://totp/GitHub:user@example.com?secret=JBSWY3DPEHPK3PXP');
    expect(result.format).toBe('QR_CODE');
  });

  it('accepts various barcode formats', () => {
    const formats = ['QR_CODE', 'DATA_MATRIX', 'AZTEC', 'PDF417', 'EAN_13', 'CODE_128'];
    for (const format of formats) {
      const result: import('../plugins/qr-scanner').QRScanResult = {
        value: 'test-value',
        format,
      };
      expect(result.format).toBe(format);
    }
  });
});

// ─── parseOtpAuthUri ──────────────────────────────────────────────────────────

import { parseOtpAuthUri, type OtpAuthParams } from '../views/qr-totp';

describe('parseOtpAuthUri', () => {
  it('parses standard otpauth URI', () => {
    const uri = 'otpauth://totp/GitHub:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub';
    const result = parseOtpAuthUri(uri);
    expect(result).not.toBeNull();
    expect(result?.secret).toBe('JBSWY3DPEHPK3PXP');
    expect(result?.issuer).toBe('GitHub');
    expect(result?.account).toBe('user@example.com');
    expect(result?.algorithm).toBe('SHA1');
    expect(result?.digits).toBe(6);
    expect(result?.period).toBe(30);
  });

  it('parses URI with all optional params', () => {
    const uri =
      'otpauth://totp/Service:me?secret=ABC123&issuer=Service&algorithm=SHA256&digits=8&period=60';
    const result = parseOtpAuthUri(uri);
    expect(result).not.toBeNull();
    expect(result?.algorithm).toBe('SHA256');
    expect(result?.digits).toBe(8);
    expect(result?.period).toBe(60);
  });

  it('parses URI without issuer in label', () => {
    const uri = 'otpauth://totp/user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=MyApp';
    const result = parseOtpAuthUri(uri);
    expect(result).not.toBeNull();
    expect(result?.issuer).toBe('MyApp');
    expect(result?.account).toBe('user@example.com');
  });

  it('parses URI with issuer only in label', () => {
    const uri = 'otpauth://totp/GitHub:user@test.com?secret=JBSWY3DPEHPK3PXP';
    const result = parseOtpAuthUri(uri);
    expect(result).not.toBeNull();
    expect(result?.issuer).toBe('GitHub');
    expect(result?.account).toBe('user@test.com');
  });

  it('issuer param overrides label issuer', () => {
    const uri = 'otpauth://totp/OldName:user@test.com?secret=ABC&issuer=NewName';
    const result = parseOtpAuthUri(uri);
    expect(result?.issuer).toBe('NewName');
  });

  it('returns null for empty string', () => {
    expect(parseOtpAuthUri('')).toBeNull();
  });

  it('returns null for non-otpauth URI', () => {
    expect(parseOtpAuthUri('https://example.com')).toBeNull();
  });

  it('returns null for otpauth://hotp URI', () => {
    expect(parseOtpAuthUri('otpauth://hotp/Test?secret=ABC')).toBeNull();
  });

  it('returns null for URI without secret', () => {
    expect(parseOtpAuthUri('otpauth://totp/Test?issuer=Foo')).toBeNull();
  });

  it('returns null for malformed URI', () => {
    expect(parseOtpAuthUri('otpauth://totp/%%%invalid')).toBeNull();
  });

  it('returns null for invalid digits', () => {
    const uri = 'otpauth://totp/Test?secret=ABC&digits=abc';
    expect(parseOtpAuthUri(uri)).toBeNull();
  });

  it('returns null for zero period', () => {
    const uri = 'otpauth://totp/Test?secret=ABC&period=0';
    expect(parseOtpAuthUri(uri)).toBeNull();
  });

  it('returns null for negative digits', () => {
    const uri = 'otpauth://totp/Test?secret=ABC&digits=-1';
    expect(parseOtpAuthUri(uri)).toBeNull();
  });

  it('uses defaults when optional params missing', () => {
    const uri = 'otpauth://totp/Test?secret=MYSECRET';
    const result = parseOtpAuthUri(uri);
    expect(result).not.toBeNull();
    expect(result?.secret).toBe('MYSECRET');
    expect(result?.issuer).toBe('');
    expect(result?.account).toBe('Test');
    expect(result?.algorithm).toBe('SHA1');
    expect(result?.digits).toBe(6);
    expect(result?.period).toBe(30);
  });

  it('handles encoded characters in label', () => {
    const uri = 'otpauth://totp/My%20Service:user%40example.com?secret=ABC';
    const result = parseOtpAuthUri(uri);
    expect(result).not.toBeNull();
    expect(result?.issuer).toBe('My Service');
    expect(result?.account).toBe('user@example.com');
  });
});
