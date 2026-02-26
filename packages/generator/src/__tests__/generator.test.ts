import { describe, it, expect } from 'vitest';
import {
  generatePassword,
  generatePassphrase,
  evaluateStrength,
  WORDLIST,
} from '../index';

describe('Password Generator', () => {
  describe('generatePassword', () => {
    it('should generate a password with default options', () => {
      const password = generatePassword();
      expect(password).toHaveLength(20);
      expect(password).toBeTruthy();
    });

    it('should respect length option', () => {
      const password = generatePassword({ length: 16 });
      expect(password).toHaveLength(16);
    });

    it('should respect character set options - uppercase and lowercase only', () => {
      const password = generatePassword({
        length: 16,
        uppercase: true,
        lowercase: true,
        digits: false,
        symbols: false,
      });
      expect(password).toHaveLength(16);
      expect(/^[a-zA-Z]+$/.test(password)).toBe(true);
    });

    it('should respect character set options - all sets', () => {
      const password = generatePassword({
        length: 32,
        uppercase: true,
        lowercase: true,
        digits: true,
        symbols: true,
      });
      expect(password).toHaveLength(32);
      expect(password).toBeTruthy();
    });

    it('should exclude ambiguous characters when requested', () => {
      const password = generatePassword({
        length: 100,
        uppercase: true,
        lowercase: true,
        digits: true,
        symbols: false,
        excludeAmbiguous: true,
      });
      expect(/[0O1lI|]/.test(password)).toBe(false);
    });

    it('should not contain symbols when symbols disabled', () => {
      const password = generatePassword({
        length: 32,
        uppercase: true,
        lowercase: true,
        digits: true,
        symbols: false,
      });
      expect(/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)).toBe(false);
    });

    it('should throw error for invalid length', () => {
      expect(() => generatePassword({ length: 5 })).toThrow();
      expect(() => generatePassword({ length: 200 })).toThrow();
    });

    it('should throw error when no character sets enabled', () => {
      expect(() =>
        generatePassword({
          uppercase: false,
          lowercase: false,
          digits: false,
          symbols: false,
        })
      ).toThrow();
    });

    it('should generate different passwords on each call', () => {
      const password1 = generatePassword();
      const password2 = generatePassword();
      expect(password1).not.toBe(password2);
    });

    it('should not use Math.random()', () => {
      // This is a meta-test: if the implementation uses Math.random(),
      // we can't guarantee cryptographic randomness
      const source = generatePassword.toString();
      expect(source).not.toContain('Math.random');
    });
  });

  describe('generatePassphrase', () => {
    it('should generate a passphrase with default options', () => {
      const passphrase = generatePassphrase();
      const words = passphrase.split('-');
      expect(words).toHaveLength(5);
    });

    it('should respect word count option', () => {
      const passphrase = generatePassphrase({ wordCount: 4 });
      const words = passphrase.split('-');
      expect(words).toHaveLength(4);
    });

    it('should contain correct number of separators', () => {
      const passphrase = generatePassphrase({ wordCount: 4, separator: '-' });
      const separators = (passphrase.match(/-/g) || []).length;
      expect(separators).toBe(3); // 4 words = 3 separators
    });

    it('should capitalize words when requested', () => {
      const passphrase = generatePassphrase({
        wordCount: 5,
        capitalize: true,
      });
      const words = passphrase.split('-');
      words.forEach((word) => {
        expect(/^[A-Z]/.test(word)).toBe(true);
      });
    });

    it('should not capitalize words when disabled', () => {
      const passphrase = generatePassphrase({
        wordCount: 5,
        capitalize: false,
      });
      const words = passphrase.split('-');
      // At least some words should start with lowercase
      const hasLowercase = words.some((word) => /^[a-z]/.test(word));
      expect(hasLowercase).toBe(true);
    });

    it('should use custom separator', () => {
      const passphrase = generatePassphrase({
        wordCount: 4,
        separator: '_',
      });
      expect(passphrase).toContain('_');
      expect(passphrase).not.toContain('-');
    });

    it('should include number when requested', () => {
      const passphrase = generatePassphrase({
        wordCount: 5,
        includeNumber: true,
      });
      expect(/\d/.test(passphrase)).toBe(true);
    });

    it('should throw error for invalid word count', () => {
      expect(() => generatePassphrase({ wordCount: 2 })).toThrow();
      expect(() => generatePassphrase({ wordCount: 11 })).toThrow();
    });

    it('should throw error for empty separator', () => {
      expect(() => generatePassphrase({ separator: '' })).toThrow();
    });

    it('should generate different passphrases on each call', () => {
      const passphrase1 = generatePassphrase();
      const passphrase2 = generatePassphrase();
      expect(passphrase1).not.toBe(passphrase2);
    });

    it('should use words from WORDLIST', () => {
      const passphrase = generatePassphrase({ wordCount: 10, capitalize: false });
      const words = passphrase.split('-');
      words.forEach((word) => {
        const wordLower = word.replace(/\d$/, '').toLowerCase();
        expect(WORDLIST).toContain(wordLower);
      });
    });
  });

  describe('evaluateStrength', () => {
    it('should evaluate password and return score', () => {
      const result = evaluateStrength('password');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(4);
      expect(result.feedback).toBeDefined();
      expect(Array.isArray(result.feedback)).toBe(true);
    });

    it('should evaluate strong password as high score', () => {
      const result = evaluateStrength('Tr0ub4dor&3');
      expect(result.score).toBeGreaterThanOrEqual(2);
    });

    it('should return entropy value', () => {
      const result = evaluateStrength('test');
      expect(result.entropy).toBeGreaterThanOrEqual(0);
      expect(typeof result.entropy).toBe('number');
    });

    it('should return feedback array', () => {
      const result = evaluateStrength('password');
      expect(Array.isArray(result.feedback)).toBe(true);
    });

    it('should score longer random passwords higher', () => {
      const weakResult = evaluateStrength('password');
      const strongResult = evaluateStrength(
        'Tr0ub4dor&3Tr0ub4dor&3Tr0ub4dor&3'
      );
      expect(strongResult.score).toBeGreaterThanOrEqual(weakResult.score);
    });

    it('should have score between 0 and 4', () => {
      const passwords = [
        'a',
        'password',
        'Password1',
        'Tr0ub4dor&3',
        'Tr0ub4dor&3Tr0ub4dor&3Tr0ub4dor&3',
      ];
      passwords.forEach((pwd) => {
        const result = evaluateStrength(pwd);
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(4);
      });
    });
  });

  describe('WORDLIST', () => {
    it('should contain words', () => {
      expect(WORDLIST.length).toBeGreaterThan(0);
    });

    it('should contain lowercase words', () => {
      WORDLIST.forEach((word) => {
        expect(word).toBe(word.toLowerCase());
      });
    });

    it('should have reasonable size', () => {
      expect(WORDLIST.length).toBeGreaterThan(500);
      expect(WORDLIST.length).toBeLessThan(10000);
    });
  });

  describe('Integration tests', () => {
    it('should generate password and evaluate its strength', () => {
      const password = generatePassword({ length: 20 });
      const strength = evaluateStrength(password);
      expect(strength.score).toBeGreaterThanOrEqual(0);
      expect(strength.score).toBeLessThanOrEqual(4);
    });

    it('should generate passphrase and evaluate its strength', () => {
      const passphrase = generatePassphrase({ wordCount: 5 });
      const strength = evaluateStrength(passphrase);
      expect(strength.score).toBeGreaterThanOrEqual(0);
      expect(strength.score).toBeLessThanOrEqual(4);
    });
  });
});
