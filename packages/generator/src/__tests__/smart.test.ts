import { describe, it, expect } from 'vitest';
import {
  detectPasswordRules,
  generateCompliant,
  smartGenerate,
  type PasswordRules,
  type PasswordFieldMetadata,
} from '../smart';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const emptyField: PasswordFieldMetadata = {};

function rulesFrom(field: PasswordFieldMetadata): PasswordRules {
  return detectPasswordRules(field);
}

// ---------------------------------------------------------------------------
// Rule detection — HTML attributes
// ---------------------------------------------------------------------------

describe('detectPasswordRules', () => {
  describe('HTML attributes', () => {
    it('should use minlength attribute', () => {
      const rules = rulesFrom({ minLength: 8 });
      expect(rules.minLength).toBe(8);
      expect(rules.source).toBe('html-attributes');
    });

    it('should use maxlength attribute', () => {
      const rules = rulesFrom({ maxLength: 20 });
      expect(rules.maxLength).toBe(20);
      expect(rules.source).toBe('html-attributes');
    });

    it('should ignore maxlength >= 1000', () => {
      const rules = rulesFrom({ maxLength: 1000 });
      expect(rules.maxLength).toBe(128); // default
    });

    it('should detect uppercase requirement from pattern', () => {
      const rules = rulesFrom({ pattern: '(?=.*[A-Z]).{8,}' });
      expect(rules.requireUppercase).toBe(true);
    });

    it('should detect digit requirement from pattern with \\d', () => {
      const rules = rulesFrom({ pattern: '(?=.*\\d).{8,}' });
      expect(rules.requireDigit).toBe(true);
    });

    it('should detect digit requirement from pattern with [0-9]', () => {
      const rules = rulesFrom({ pattern: '(?=.*[0-9]).{8,}' });
      expect(rules.requireDigit).toBe(true);
    });

    it('should detect lowercase from pattern', () => {
      const rules = rulesFrom({ pattern: '(?=.*[a-z]).+' });
      expect(rules.requireLowercase).toBe(true);
    });

    it('should extract length from pattern quantifier {8,20}', () => {
      const rules = rulesFrom({ pattern: '.{8,20}' });
      expect(rules.minLength).toBe(8);
      expect(rules.maxLength).toBe(20);
    });

    it('should detect special chars from pattern and extract allowed set', () => {
      const rules = rulesFrom({ pattern: '(?=.*[!@#$%]).{8,}' });
      expect(rules.requireSpecial).toBe(true);
      expect(rules.allowedSpecialChars).toBe('!@#$%');
    });

    it('should combine multiple HTML attributes', () => {
      const rules = rulesFrom({
        minLength: 10,
        maxLength: 30,
        pattern: '(?=.*[A-Z])(?=.*[0-9]).{10,}',
      });
      expect(rules.minLength).toBe(10);
      expect(rules.maxLength).toBe(30);
      expect(rules.requireUppercase).toBe(true);
      expect(rules.requireDigit).toBe(true);
      expect(rules.source).toBe('html-attributes');
    });
  });

  // -------------------------------------------------------------------------
  // Rule detection — title text
  // -------------------------------------------------------------------------

  describe('title text parsing', () => {
    it('should parse "at least N characters"', () => {
      const rules = rulesFrom({ title: 'At least 8 characters' });
      expect(rules.minLength).toBe(8);
    });

    it('should parse "must contain uppercase and number"', () => {
      const rules = rulesFrom({
        title: 'Must contain uppercase letter and a number',
      });
      expect(rules.requireUppercase).toBe(true);
      expect(rules.requireDigit).toBe(true);
    });

    it('should parse "between N and M characters"', () => {
      const rules = rulesFrom({
        title: 'Between 8 and 20 characters',
      });
      expect(rules.minLength).toBe(8);
      expect(rules.maxLength).toBe(20);
    });

    it('should parse "no spaces allowed"', () => {
      const rules = rulesFrom({ title: 'No spaces allowed' });
      expect(rules.forbiddenChars).toContain(' ');
    });

    it('should parse "letters and numbers only" as no special chars', () => {
      const rules = rulesFrom({
        title: 'Letters and numbers only',
      });
      expect(rules.requireSpecial).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Rule detection — nearby text / aria description
  // -------------------------------------------------------------------------

  describe('nearby text parsing', () => {
    it('should parse bullet-list requirements', () => {
      const rules = rulesFrom({
        nearbyText: [
          '• At least 8 characters',
          '• One uppercase letter',
          '• One number',
          '• One special character',
        ].join('\n'),
      });
      expect(rules.minLength).toBe(8);
      expect(rules.requireUppercase).toBe(true);
      expect(rules.requireDigit).toBe(true);
      expect(rules.requireSpecial).toBe(true);
      expect(rules.source).toBe('visible-text');
    });

    it('should parse "must include" style requirements', () => {
      const rules = rulesFrom({
        nearbyText: 'Password must include: uppercase, lowercase, number, special character',
      });
      expect(rules.requireUppercase).toBe(true);
      expect(rules.requireLowercase).toBe(true);
      expect(rules.requireDigit).toBe(true);
      expect(rules.requireSpecial).toBe(true);
    });

    it('should parse ariaDescription text', () => {
      const rules = rulesFrom({
        ariaDescription: 'Minimum 12 characters, must include a digit',
      });
      expect(rules.minLength).toBe(12);
      expect(rules.requireDigit).toBe(true);
    });

    it('should extract allowed special chars from hint like (!@#$%)', () => {
      const rules = rulesFrom({
        nearbyText: 'Include a special character (!@#$%)',
      });
      expect(rules.requireSpecial).toBe(true);
      expect(rules.allowedSpecialChars).toBe('!@#$%');
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('should return defaults for empty metadata', () => {
      const rules = rulesFrom(emptyField);
      expect(rules.minLength).toBe(16);
      expect(rules.maxLength).toBe(128);
      expect(rules.requireUppercase).toBe(true);
      expect(rules.requireLowercase).toBe(true);
      expect(rules.requireDigit).toBe(true);
      expect(rules.requireSpecial).toBe(false);
      expect(rules.source).toBe('defaults');
    });

    it('should clamp when minLength > maxLength', () => {
      const rules = rulesFrom({ minLength: 30, maxLength: 10 });
      expect(rules.maxLength).toBeGreaterThanOrEqual(rules.minLength);
    });

    it('should prioritize HTML attributes over visible text', () => {
      const rules = rulesFrom({
        minLength: 12,
        nearbyText: 'At least 8 characters',
      });
      // HTML attribute wins (applied last at higher priority)
      expect(rules.minLength).toBe(12);
      expect(rules.source).toBe('html-attributes');
    });
  });
});

// ---------------------------------------------------------------------------
// Password generation compliance
// ---------------------------------------------------------------------------

describe('generateCompliant', () => {
  it('should respect minLength', () => {
    const rules: PasswordRules = {
      ...detectPasswordRules({}),
      minLength: 20,
    };
    const pw = generateCompliant(rules);
    expect(pw.length).toBeGreaterThanOrEqual(20);
  });

  it('should respect maxLength', () => {
    const rules: PasswordRules = {
      ...detectPasswordRules({}),
      minLength: 8,
      maxLength: 12,
    };
    const pw = generateCompliant(rules);
    expect(pw.length).toBeLessThanOrEqual(12);
  });

  it('should contain uppercase when required', () => {
    const rules: PasswordRules = {
      ...detectPasswordRules({}),
      requireUppercase: true,
    };
    const pw = generateCompliant(rules);
    expect(/[A-Z]/.test(pw)).toBe(true);
  });

  it('should contain lowercase when required', () => {
    const rules: PasswordRules = {
      ...detectPasswordRules({}),
      requireLowercase: true,
    };
    const pw = generateCompliant(rules);
    expect(/[a-z]/.test(pw)).toBe(true);
  });

  it('should contain digit when required', () => {
    const rules: PasswordRules = {
      ...detectPasswordRules({}),
      requireDigit: true,
    };
    const pw = generateCompliant(rules);
    expect(/[0-9]/.test(pw)).toBe(true);
  });

  it('should contain special char when required', () => {
    const rules: PasswordRules = {
      ...detectPasswordRules({}),
      requireSpecial: true,
    };
    const pw = generateCompliant(rules);
    expect(/[^a-zA-Z0-9]/.test(pw)).toBe(true);
  });

  it('should only use allowed special chars when specified', () => {
    const rules: PasswordRules = {
      ...detectPasswordRules({}),
      requireSpecial: true,
      allowedSpecialChars: '!@#',
    };
    const pw = generateCompliant(rules);
    // Every non-alnum char should be in the allowed set
    const specials = pw.split('').filter((c) => /[^a-zA-Z0-9]/.test(c));
    expect(specials.length).toBeGreaterThan(0);
    for (const s of specials) {
      expect('!@#').toContain(s);
    }
  });

  it('should exclude forbidden chars', () => {
    const rules: PasswordRules = {
      ...detectPasswordRules({}),
      forbiddenChars: 'aeiouAEIOU',
    };
    const pw = generateCompliant(rules);
    for (const c of 'aeiouAEIOU') {
      expect(pw).not.toContain(c);
    }
  });

  it('should handle very restrictive PIN-like rules', () => {
    const rules: PasswordRules = {
      minLength: 4,
      maxLength: 4,
      requireUppercase: false,
      requireLowercase: false,
      requireDigit: true,
      requireSpecial: false,
      source: 'html-attributes',
    };
    const pw = generateCompliant(rules);
    expect(pw).toHaveLength(4);
    expect(/^\d{4}$/.test(pw)).toBe(true);
  });

  it('should generate strong default password with no restrictions', () => {
    const rules: PasswordRules = {
      minLength: 16,
      maxLength: 128,
      requireUppercase: true,
      requireLowercase: true,
      requireDigit: true,
      requireSpecial: false,
      source: 'defaults',
    };
    const pw = generateCompliant(rules);
    expect(pw.length).toBeGreaterThanOrEqual(16);
    expect(/[A-Z]/.test(pw)).toBe(true);
    expect(/[a-z]/.test(pw)).toBe(true);
    expect(/[0-9]/.test(pw)).toBe(true);
  });

  it('should generate different passwords on each call', () => {
    const rules = detectPasswordRules({});
    const pw1 = generateCompliant(rules);
    const pw2 = generateCompliant(rules);
    expect(pw1).not.toBe(pw2);
  });
});

// ---------------------------------------------------------------------------
// smartGenerate — end-to-end
// ---------------------------------------------------------------------------

describe('smartGenerate', () => {
  it('should return both password and rules', () => {
    const result = smartGenerate({});
    expect(result.password).toBeTruthy();
    expect(result.rules).toBeTruthy();
    expect(result.rules.source).toBe('defaults');
  });

  it('should produce a compliant password for detected rules', () => {
    const result = smartGenerate({
      minLength: 12,
      maxLength: 24,
      pattern: '(?=.*[A-Z])(?=.*[0-9]).{12,}',
      nearbyText: 'Include a special character',
    });
    const { password, rules } = result;

    expect(password.length).toBeGreaterThanOrEqual(12);
    expect(password.length).toBeLessThanOrEqual(24);
    expect(/[A-Z]/.test(password)).toBe(true);
    expect(/[0-9]/.test(password)).toBe(true);
    expect(rules.requireSpecial).toBe(true);
    expect(rules.source).toBe('html-attributes');
  });

  it('should work end-to-end with only nearbyText', () => {
    const result = smartGenerate({
      nearbyText:
        'Password requirements: at least 10 characters, one uppercase letter, one number, one special character (!@#$%)',
    });
    expect(result.rules.minLength).toBe(10);
    expect(result.rules.requireUppercase).toBe(true);
    expect(result.rules.requireDigit).toBe(true);
    expect(result.rules.requireSpecial).toBe(true);
    expect(result.password.length).toBeGreaterThanOrEqual(10);
  });

  it('should work end-to-end with only title', () => {
    const result = smartGenerate({
      title: 'Minimum 8 characters, must include a capital letter',
    });
    expect(result.rules.minLength).toBe(8);
    expect(result.rules.requireUppercase).toBe(true);
    expect(result.password.length).toBeGreaterThanOrEqual(8);
    expect(/[A-Z]/.test(result.password)).toBe(true);
  });
});
