import { describe, it, expect, beforeEach } from 'vitest';
import { PhishingDetector } from '../phishing.js';
import type { PhishingResult } from '../phishing.js';

describe('PhishingDetector', () => {
  let detector: PhishingDetector;

  beforeEach(() => {
    detector = new PhishingDetector();
  });

  function getCheck(result: PhishingResult, name: string) {
    return result.checks.find((c) => c.name === name);
  }

  // -----------------------------------------------------------------------
  // Safe URLs
  // -----------------------------------------------------------------------

  describe('safe URLs', () => {
    it('marks google.com as safe', () => {
      const result = detector.analyzeUrl('https://google.com');
      expect(result.safe).toBe(true);
      expect(result.score).toBeLessThan(0.5);
    });

    it('marks github.com as safe', () => {
      const result = detector.analyzeUrl('https://github.com/login');
      expect(result.safe).toBe(true);
      expect(result.score).toBeLessThan(0.5);
    });

    it('marks bankofamerica.com as safe', () => {
      const result = detector.analyzeUrl('https://bankofamerica.com/account');
      expect(result.safe).toBe(true);
    });

    it('handles URL without protocol', () => {
      const result = detector.analyzeUrl('google.com');
      expect(result.safe).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // IP-based URL detection
  // -----------------------------------------------------------------------

  describe('IP-based URLs', () => {
    it('flags http://192.168.1.1/login', () => {
      const result = detector.analyzeUrl('http://192.168.1.1/login');
      expect(getCheck(result, 'ip-url')?.passed).toBe(false);
      expect(result.score).toBeGreaterThanOrEqual(0.7);
    });

    it('flags http://10.0.0.1/phishing', () => {
      const result = detector.analyzeUrl('http://10.0.0.1/phishing');
      expect(getCheck(result, 'ip-url')?.passed).toBe(false);
    });

    it('flags https://8.8.8.8/secure', () => {
      const result = detector.analyzeUrl('https://8.8.8.8/secure');
      expect(getCheck(result, 'ip-url')?.passed).toBe(false);
    });

    it('does not flag normal domains', () => {
      const result = detector.analyzeUrl('https://example.com');
      expect(getCheck(result, 'ip-url')?.passed).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Homoglyph detection
  // -----------------------------------------------------------------------

  describe('homoglyphs', () => {
    it('detects Cyrillic o in g\u043E\u043Egle.com', () => {
      // "gооgle.com" with Cyrillic о (U+043E)
      const result = detector.analyzeUrl('https://g\u043E\u043Egle.com');
      expect(getCheck(result, 'homoglyph')?.passed).toBe(false);
      expect(result.score).toBeGreaterThanOrEqual(0.5);
    });

    it('detects Cyrillic a in \u0430pple.com', () => {
      // "аpple.com" with Cyrillic а (U+0430)
      const result = detector.analyzeUrl('https://\u0430pple.com');
      expect(getCheck(result, 'homoglyph')?.passed).toBe(false);
    });

    it('detects Cyrillic e in n\u0435tflix.com', () => {
      const result = detector.analyzeUrl('https://n\u0435tflix.com');
      expect(getCheck(result, 'homoglyph')?.passed).toBe(false);
    });

    it('does not flag pure ASCII domains', () => {
      const result = detector.analyzeUrl('https://google.com');
      expect(getCheck(result, 'homoglyph')?.passed).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Typosquatting detection
  // -----------------------------------------------------------------------

  describe('typosquats', () => {
    it('detects gooogle.com (extra letter)', () => {
      const result = detector.analyzeUrl('https://gooogle.com');
      expect(getCheck(result, 'typosquat')?.passed).toBe(false);
    });

    it('detects goggle.com (swapped letters)', () => {
      const result = detector.analyzeUrl('https://goggle.com');
      expect(getCheck(result, 'typosquat')?.passed).toBe(false);
    });

    it('detects amaz0n.com (character substitution)', () => {
      const result = detector.analyzeUrl('https://amaz0n.com');
      expect(getCheck(result, 'typosquat')?.passed).toBe(false);
    });

    it('detects paypa1.com (character substitution)', () => {
      const result = detector.analyzeUrl('https://paypa1.com');
      expect(getCheck(result, 'typosquat')?.passed).toBe(false);
    });

    it('does not flag exact legitimate domains', () => {
      const result = detector.analyzeUrl('https://paypal.com');
      expect(getCheck(result, 'typosquat')?.passed).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Suspicious TLD check
  // -----------------------------------------------------------------------

  describe('suspicious TLDs', () => {
    it('flags .tk domains', () => {
      const result = detector.analyzeUrl('https://login-paypal.tk');
      expect(getCheck(result, 'suspicious-tld')?.passed).toBe(false);
    });

    it('flags .xyz domains', () => {
      const result = detector.analyzeUrl('https://secure-google.xyz');
      expect(getCheck(result, 'suspicious-tld')?.passed).toBe(false);
    });

    it('flags .click domains', () => {
      const result = detector.analyzeUrl('https://verify-account.click');
      expect(getCheck(result, 'suspicious-tld')?.passed).toBe(false);
    });

    it('does not flag .com domains', () => {
      const result = detector.analyzeUrl('https://example.com');
      expect(getCheck(result, 'suspicious-tld')?.passed).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Excessive subdomain check
  // -----------------------------------------------------------------------

  describe('excessive subdomains', () => {
    it('flags login.secure.paypal.com.evil.com', () => {
      const result = detector.analyzeUrl('https://login.secure.paypal.com.evil.com');
      expect(getCheck(result, 'excessive-subdomains')?.passed).toBe(false);
    });

    it('flags a.b.c.d.e.com', () => {
      const result = detector.analyzeUrl('https://a.b.c.d.e.com');
      expect(getCheck(result, 'excessive-subdomains')?.passed).toBe(false);
    });

    it('does not flag www.google.com (3 levels)', () => {
      const result = detector.analyzeUrl('https://www.google.com');
      expect(getCheck(result, 'excessive-subdomains')?.passed).toBe(true);
    });

    it('does not flag mail.google.com (3 levels)', () => {
      const result = detector.analyzeUrl('https://mail.google.com');
      expect(getCheck(result, 'excessive-subdomains')?.passed).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // HTTP-only check
  // -----------------------------------------------------------------------

  describe('HTTP-only', () => {
    it('flags http://bank.com/login', () => {
      const result = detector.analyzeUrl('http://bank.com/login');
      expect(getCheck(result, 'http-only')?.passed).toBe(false);
    });

    it('does not flag https://bank.com/login', () => {
      const result = detector.analyzeUrl('https://bank.com/login');
      expect(getCheck(result, 'http-only')?.passed).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Keyword stuffing check
  // -----------------------------------------------------------------------

  describe('keyword stuffing', () => {
    it('flags secure-login-verify.com', () => {
      const result = detector.analyzeUrl('https://secure-login-verify.com');
      expect(getCheck(result, 'keyword-stuffing')?.passed).toBe(false);
    });

    it('flags verify-account-now.com', () => {
      const result = detector.analyzeUrl('https://verify-account-now.com');
      expect(getCheck(result, 'keyword-stuffing')?.passed).toBe(false);
    });

    it('flags update-payment-info.com', () => {
      const result = detector.analyzeUrl('https://update-payment-info.com');
      expect(getCheck(result, 'keyword-stuffing')?.passed).toBe(false);
    });

    it('does not flag normal domains', () => {
      const result = detector.analyzeUrl('https://mywebsite.com');
      expect(getCheck(result, 'keyword-stuffing')?.passed).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Long URL check
  // -----------------------------------------------------------------------

  describe('long URLs', () => {
    it('flags URLs over 200 characters', () => {
      const longPath = 'a'.repeat(200);
      const result = detector.analyzeUrl(`https://example.com/${longPath}`);
      expect(getCheck(result, 'long-url')?.passed).toBe(false);
    });

    it('does not flag normal-length URLs', () => {
      const result = detector.analyzeUrl('https://example.com/login');
      expect(getCheck(result, 'long-url')?.passed).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles empty string gracefully', () => {
      const result = detector.analyzeUrl('');
      expect(result.safe).toBe(true);
      expect(result.checks).toHaveLength(1);
    });

    it('handles about:blank gracefully', () => {
      const result = detector.analyzeUrl('about:blank');
      expect(result.safe).toBe(true);
    });

    it('handles malformed URL gracefully', () => {
      const result = detector.analyzeUrl('not://a valid url %%%');
      expect(result.safe).toBe(true);
    });

    it('handles URL with only whitespace', () => {
      const result = detector.analyzeUrl('   ');
      expect(result.safe).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Scoring
  // -----------------------------------------------------------------------

  describe('scoring', () => {
    it('combines multiple flags into higher score', () => {
      // HTTP + suspicious TLD + keyword stuffing
      const result = detector.analyzeUrl('http://secure-login.tk');
      expect(result.score).toBeGreaterThan(0.5);
      expect(result.safe).toBe(false);
    });

    it('caps score at 1.0', () => {
      // IP + HTTP — should not exceed 1.0
      const result = detector.analyzeUrl('http://192.168.1.1/secure-login-verify');
      expect(result.score).toBeLessThanOrEqual(1.0);
    });

    it('returns reasons for failed checks', () => {
      const result = detector.analyzeUrl('http://192.168.1.1/login');
      expect(result.reasons.length).toBeGreaterThan(0);
      expect(result.reasons.some((r) => r.includes('IP'))).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Custom domains
  // -----------------------------------------------------------------------

  describe('custom legitimate domains', () => {
    it('accepts user-provided domains for typosquat comparison', () => {
      const custom = new PhishingDetector(['mycompany.com']);
      const result = custom.analyzeUrl('https://mycompanny.com');
      expect(getCheck(result, 'typosquat')?.passed).toBe(false);
    });

    it('still includes default domains', () => {
      const custom = new PhishingDetector(['mycompany.com']);
      const result = custom.analyzeUrl('https://gooogle.com');
      expect(getCheck(result, 'typosquat')?.passed).toBe(false);
    });
  });
});
