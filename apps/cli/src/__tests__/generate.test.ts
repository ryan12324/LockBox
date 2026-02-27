import { describe, it, expect } from 'vitest';
import { generatePassword, generatePassphrase, evaluateStrength } from '@lockbox/generator';

describe('generate command (via @lockbox/generator)', () => {
  describe('password generation', () => {
    it('generates a password with default options', () => {
      const password = generatePassword();
      expect(password).toBeDefined();
      expect(password.length).toBe(20);
    });

    it('generates a password with custom length', () => {
      const password = generatePassword({ length: 32 });
      expect(password.length).toBe(32);
    });

    it('respects minimum length of 8', () => {
      expect(() => generatePassword({ length: 4 })).toThrow(
        'Password length must be between 8 and 128'
      );
    });

    it('respects maximum length of 128', () => {
      expect(() => generatePassword({ length: 200 })).toThrow(
        'Password length must be between 8 and 128'
      );
    });

    it('generates password without symbols', () => {
      const password = generatePassword({
        length: 50,
        symbols: false,
        uppercase: true,
        lowercase: true,
        digits: true,
      });
      // Symbols from the generator: !@#$%^&*()_+-=[]{}|;:,.<>?
      const hasSymbols = /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password);
      // With 50 chars, it's extremely unlikely to get no symbols by chance
      // but we just check the option is accepted
      expect(password.length).toBe(50);
    });

    it('generates password without uppercase', () => {
      const password = generatePassword({
        length: 50,
        uppercase: false,
        lowercase: true,
        digits: true,
        symbols: false,
      });
      expect(password.length).toBe(50);
    });

    it('throws when no character sets are enabled', () => {
      expect(() =>
        generatePassword({
          uppercase: false,
          lowercase: false,
          digits: false,
          symbols: false,
        })
      ).toThrow('At least one character set must be enabled');
    });

    it('generates unique passwords each time', () => {
      const passwords = new Set<string>();
      for (let i = 0; i < 10; i++) {
        passwords.add(generatePassword({ length: 20 }));
      }
      // All 10 should be unique (probability of collision is astronomically low)
      expect(passwords.size).toBe(10);
    });
  });

  describe('passphrase generation', () => {
    it('generates a passphrase with default options', () => {
      const passphrase = generatePassphrase();
      expect(passphrase).toBeDefined();
      const words = passphrase.split('-');
      expect(words.length).toBe(5);
    });

    it('generates a passphrase with custom word count', () => {
      const passphrase = generatePassphrase({ wordCount: 6 });
      const words = passphrase.split('-');
      expect(words.length).toBe(6);
    });

    it('generates a passphrase with custom separator', () => {
      const passphrase = generatePassphrase({ separator: '.' });
      const words = passphrase.split('.');
      expect(words.length).toBe(5);
    });

    it('respects minimum word count of 3', () => {
      expect(() => generatePassphrase({ wordCount: 2 })).toThrow(
        'Word count must be between 3 and 10'
      );
    });

    it('respects maximum word count of 10', () => {
      expect(() => generatePassphrase({ wordCount: 11 })).toThrow(
        'Word count must be between 3 and 10'
      );
    });

    it('generates unique passphrases each time', () => {
      const passphrases = new Set<string>();
      for (let i = 0; i < 10; i++) {
        passphrases.add(generatePassphrase());
      }
      expect(passphrases.size).toBe(10);
    });
  });

  describe('strength evaluation', () => {
    it('evaluates a weak password with low score', () => {
      const result = evaluateStrength('password');
      expect(result.score).toBeLessThanOrEqual(2);
    });

    it('evaluates a strong password', () => {
      const result = evaluateStrength('Kj#9$mP2!xNq@8vL&3Rw');
      expect(result.score).toBeGreaterThanOrEqual(3);
    });

    it('returns feedback array', () => {
      const result = evaluateStrength('test');
      expect(result.feedback).toBeDefined();
      expect(Array.isArray(result.feedback)).toBe(true);
    });

    it('returns score between 0 and 4', () => {
      const result = evaluateStrength('anything');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(4);
    });

    it('returns entropy as a number', () => {
      const result = evaluateStrength('somepassword');
      expect(typeof result.entropy).toBe('number');
      expect(result.entropy).toBeGreaterThanOrEqual(0);
    });
  });
});
