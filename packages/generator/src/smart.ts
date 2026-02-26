import { generatePassword } from './random';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Where the detected rules originated. */
export type RuleSource = 'html-attributes' | 'visible-text' | 'defaults';

/** Detected password rules from a form / page. */
export interface PasswordRules {
  /** Minimum length (default: 16). */
  minLength: number;
  /** Maximum length (default: 128). */
  maxLength: number;
  /** Require at least one uppercase letter. */
  requireUppercase: boolean;
  /** Require at least one lowercase letter. */
  requireLowercase: boolean;
  /** Require at least one digit. */
  requireDigit: boolean;
  /** Require at least one special character. */
  requireSpecial: boolean;
  /** If restricted, the set of allowed special characters. */
  allowedSpecialChars?: string;
  /** Characters explicitly disallowed. */
  forbiddenChars?: string;
  /** Where the rules came from. */
  source: RuleSource;
}

/**
 * Serializable form-field metadata for rule detection.
 * Mirrors the shape a browser extension would extract from the DOM.
 */
export interface PasswordFieldMetadata {
  /** HTML `minlength` attribute. */
  minLength?: number;
  /** HTML `maxlength` attribute. */
  maxLength?: number;
  /** HTML `pattern` attribute (regex). */
  pattern?: string;
  /** HTML `title` attribute (often contains requirements text). */
  title?: string;
  /** `aria-describedby` text content. */
  ariaDescription?: string;
  /** Visible text near the password field (requirement bullets, labels). */
  nearbyText?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const DEFAULT_SPECIAL = '!@#$%^&*()-_=+[]{}|;:,.<>?';

const DEFAULT_RULES: PasswordRules = {
  minLength: 16,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireDigit: true,
  requireSpecial: false,
  source: 'defaults',
};

// ---------------------------------------------------------------------------
// Internal helpers — randomness
// ---------------------------------------------------------------------------

/** Return a cryptographically random index in `[0, max)`. */
function getRandomIndex(max: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % max;
}

/** Fisher-Yates shuffle (in-place) using crypto randomness. */
function shuffleArray(arr: string[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = getRandomIndex(i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers — text parsing
// ---------------------------------------------------------------------------

/**
 * Extract the first integer that follows a keyword-style pattern such as
 * "at least 8", "minimum 8", etc.
 */
function extractNumber(text: string, ...prefixes: RegExp[]): number | null {
  for (const prefix of prefixes) {
    const match = prefix.exec(text);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > 0) return num;
    }
  }
  return null;
}

/** Merge `partial` into `rules`, keeping the higher-priority source. */
function mergeRules(
  rules: PasswordRules,
  partial: Partial<PasswordRules>,
  source: RuleSource
): void {
  if (partial.minLength !== undefined) rules.minLength = partial.minLength;
  if (partial.maxLength !== undefined) rules.maxLength = partial.maxLength;
  if (partial.requireUppercase) rules.requireUppercase = true;
  if (partial.requireLowercase) rules.requireLowercase = true;
  if (partial.requireDigit) rules.requireDigit = true;
  if (partial.requireSpecial) rules.requireSpecial = true;
  if (partial.allowedSpecialChars !== undefined)
    rules.allowedSpecialChars = partial.allowedSpecialChars;
  if (partial.forbiddenChars !== undefined) {
    rules.forbiddenChars = (rules.forbiddenChars ?? '') + partial.forbiddenChars;
  }
  // Only upgrade source priority: html-attributes > visible-text > defaults
  const priority: Record<RuleSource, number> = {
    defaults: 0,
    'visible-text': 1,
    'html-attributes': 2,
  };
  if (priority[source] > priority[rules.source]) {
    rules.source = source;
  }
}

// ---------------------------------------------------------------------------
// Pattern regex parsing
// ---------------------------------------------------------------------------

function parsePattern(pattern: string): Partial<PasswordRules> {
  const partial: Partial<PasswordRules> = {};

  // Uppercase requirement
  if (/\[A-Z]/.test(pattern) || /\(\?=\.\*\[A-Z]\)/.test(pattern)) {
    partial.requireUppercase = true;
  }

  // Lowercase requirement
  if (/\[a-z]/.test(pattern) || /\(\?=\.\*\[a-z]\)/.test(pattern)) {
    partial.requireLowercase = true;
  }

  // Digit requirement
  if (
    /\[0-9]/.test(pattern) ||
    /\\d/.test(pattern) ||
    /\(\?=\.\*\\d\)/.test(pattern) ||
    /\(\?=\.\*\[0-9]\)/.test(pattern)
  ) {
    partial.requireDigit = true;
  }

  // Special character requirement — look for character class with symbols
  const specialClassMatch = /\[([\W_!@#$%^&*()\-+=[\]{}|;:,.<>?/~`'"\\]+)]/.exec(pattern);
  if (specialClassMatch) {
    partial.requireSpecial = true;
    // Extract the allowed special characters from the class
    const chars = specialClassMatch[1];
    // Filter to only actual special characters (not regex meta-sequences)
    partial.allowedSpecialChars = chars.replace(/\\(.)/g, '$1');
  }

  // Length from quantifier: {N,} or {N,M}
  const lenMatch = /\{(\d+),(\d*)}/.exec(pattern);
  if (lenMatch) {
    const min = parseInt(lenMatch[1], 10);
    if (!isNaN(min) && min > 0) partial.minLength = min;
    if (lenMatch[2]) {
      const max = parseInt(lenMatch[2], 10);
      if (!isNaN(max) && max > 0) partial.maxLength = max;
    }
  }

  return partial;
}

// ---------------------------------------------------------------------------
// Free-text parsing (title, nearbyText, ariaDescription)
// ---------------------------------------------------------------------------

function parseText(text: string): Partial<PasswordRules> {
  const partial: Partial<PasswordRules> = {};
  const lower = text.toLowerCase();

  // --- Length requirements ---
  const minLen = extractNumber(
    lower,
    /at\s+least\s+(\d+)\s*(?:char|letter|digit)/,
    /minimum\s+(?:of\s+)?(\d+)\s*(?:char|letter|digit)/,
    /min(?:imum)?\s*(?:length)?[:\s]+(\d+)/,
    /(\d+)\s*(?:char|letter)\w*\s+(?:or\s+)?(?:more|min)/,
    /at\s+least\s+(\d+)/
  );
  if (minLen !== null) partial.minLength = minLen;

  const maxLen = extractNumber(
    lower,
    /(?:no\s+more\s+than|at\s+most|maximum\s+(?:of\s+)?|max(?:imum)?\s*(?:length)?[:\s]+)(\d+)/,
    /up\s+to\s+(\d+)\s*char/
  );
  if (maxLen !== null) partial.maxLength = maxLen;

  // "between N and M" / "N-M characters" / "N to M characters"
  const rangeMatch = /(?:between\s+)?(\d+)\s*(?:-|to|and)\s*(\d+)\s*char/i.exec(lower);
  if (rangeMatch) {
    const lo = parseInt(rangeMatch[1], 10);
    const hi = parseInt(rangeMatch[2], 10);
    if (!isNaN(lo) && lo > 0) partial.minLength = lo;
    if (!isNaN(hi) && hi > 0) partial.maxLength = hi;
  }

  // --- Character requirements ---
  if (/upper\s*case|capital\s*letter/.test(lower)) {
    partial.requireUppercase = true;
  }
  if (/lower\s*case/.test(lower)) {
    partial.requireLowercase = true;
  }
  if (/number|digit|\bnum\b/.test(lower)) {
    partial.requireDigit = true;
  }
  if (/special\s*char|symbol|punctuation/.test(lower)) {
    partial.requireSpecial = true;
  }

  // Extract allowed special chars from parenthetical hints like "(!@#$%)"
  const specialHintMatch = /special\s*char\w*\s*\(([^)]+)\)|symbol\w*\s*\(([^)]+)\)/.exec(lower);
  if (specialHintMatch) {
    partial.allowedSpecialChars = (specialHintMatch[1] ?? specialHintMatch[2]).trim();
  }

  // --- Restrictions ---
  if (/no\s+spaces?|spaces?\s+(?:are\s+)?not\s+allowed/.test(lower)) {
    partial.forbiddenChars = (partial.forbiddenChars ?? '') + ' ';
  }
  if (/(?:letters?\s+and\s+numbers?\s+only|alphanumeric\s+only)/.test(lower)) {
    // Implicitly forbid special chars — override requireSpecial
    partial.requireSpecial = false;
  }

  return partial;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect password rules from form field metadata.
 *
 * Parses HTML attributes, pattern regex, title text, and nearby visible text
 * to determine what the site requires.
 */
export function detectPasswordRules(field: PasswordFieldMetadata): PasswordRules {
  const rules: PasswordRules = { ...DEFAULT_RULES };

  // 1. Nearby text / aria description (lowest explicit priority)
  const visibleText = [field.nearbyText, field.ariaDescription].filter(Boolean).join(' ');
  if (visibleText) {
    mergeRules(rules, parseText(visibleText), 'visible-text');
  }

  // 2. Title attribute (medium priority — still text-based)
  if (field.title) {
    mergeRules(rules, parseText(field.title), 'visible-text');
  }

  // 3. HTML attributes (highest priority)
  let hasHtmlAttr = false;

  if (field.minLength !== undefined && field.minLength > 0) {
    rules.minLength = field.minLength;
    hasHtmlAttr = true;
  }

  if (field.maxLength !== undefined && field.maxLength > 0 && field.maxLength < 1000) {
    rules.maxLength = field.maxLength;
    hasHtmlAttr = true;
  }

  if (field.pattern) {
    const fromPattern = parsePattern(field.pattern);
    mergeRules(rules, fromPattern, 'html-attributes');
    hasHtmlAttr = true;
  }

  if (hasHtmlAttr) {
    rules.source = 'html-attributes';
  }

  // Sanity: if minLength > maxLength, clamp
  if (rules.minLength > rules.maxLength) {
    rules.maxLength = rules.minLength;
  }

  return rules;
}

/**
 * Generate a password that satisfies the given rules.
 *
 * Falls back to `generatePassword()` from `random.ts` if generation fails
 * after several attempts.
 */
export function generateCompliant(rules: PasswordRules): string {
  const MAX_ATTEMPTS = 10;

  // Determine effective character pools
  const forbidden = new Set((rules.forbiddenChars ?? '').split(''));

  const filterForbidden = (chars: string): string =>
    chars
      .split('')
      .filter((c) => !forbidden.has(c))
      .join('');

  const upperPool = rules.requireUppercase ? filterForbidden(UPPERCASE) : '';
  const lowerPool = rules.requireLowercase ? filterForbidden(LOWERCASE) : '';
  const digitPool = rules.requireDigit ? filterForbidden(DIGITS) : '';

  let specialPool = '';
  if (rules.requireSpecial) {
    const base = rules.allowedSpecialChars ?? DEFAULT_SPECIAL;
    specialPool = filterForbidden(base);
  }

  // Build full pool (union of all enabled sets)
  let fullPool = upperPool + lowerPool + digitPool + specialPool;

  // If nothing is required we still need a pool — use safe defaults minus forbidden
  if (fullPool.length === 0) {
    fullPool = filterForbidden(UPPERCASE + LOWERCASE + DIGITS);
  }
  if (fullPool.length === 0) {
    // Truly degenerate — fall back
    return generatePassword();
  }

  // Target length
  const targetLength = Math.min(Math.max(rules.minLength, 16), rules.maxLength);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const chars: string[] = [];

    // 1. Place one character from each required pool
    if (upperPool.length > 0) chars.push(upperPool[getRandomIndex(upperPool.length)]);
    if (lowerPool.length > 0) chars.push(lowerPool[getRandomIndex(lowerPool.length)]);
    if (digitPool.length > 0) chars.push(digitPool[getRandomIndex(digitPool.length)]);
    if (specialPool.length > 0) chars.push(specialPool[getRandomIndex(specialPool.length)]);

    // 2. Fill remaining with characters from the combined pool
    const remaining = targetLength - chars.length;
    for (let i = 0; i < remaining; i++) {
      chars.push(fullPool[getRandomIndex(fullPool.length)]);
    }

    // 3. Fisher-Yates shuffle
    shuffleArray(chars);

    const password = chars.join('');

    // 4. Verify compliance
    if (verifyCompliance(password, rules)) {
      return password;
    }
  }

  // Fallback: use existing generator
  return generatePassword({
    length: Math.min(Math.max(rules.minLength, 16), rules.maxLength),
    uppercase: rules.requireUppercase,
    lowercase: rules.requireLowercase,
    digits: rules.requireDigit,
    symbols: rules.requireSpecial,
  });
}

/**
 * Convenience: detect rules from field metadata AND generate a compliant
 * password in one call.
 */
export function smartGenerate(field: PasswordFieldMetadata): {
  password: string;
  rules: PasswordRules;
} {
  const rules = detectPasswordRules(field);
  const password = generateCompliant(rules);
  return { password, rules };
}

// ---------------------------------------------------------------------------
// Verification helper
// ---------------------------------------------------------------------------

/** Check that `password` satisfies every constraint in `rules`. */
function verifyCompliance(password: string, rules: PasswordRules): boolean {
  if (password.length < rules.minLength) return false;
  if (password.length > rules.maxLength) return false;

  if (rules.requireUppercase && !/[A-Z]/.test(password)) return false;
  if (rules.requireLowercase && !/[a-z]/.test(password)) return false;
  if (rules.requireDigit && !/[0-9]/.test(password)) return false;
  if (rules.requireSpecial) {
    const specialChars = rules.allowedSpecialChars ?? DEFAULT_SPECIAL;
    const hasSpecial = password.split('').some((c) => specialChars.includes(c));
    if (!hasSpecial) return false;
  }

  if (rules.forbiddenChars) {
    const forbidden = new Set(rules.forbiddenChars.split(''));
    if (password.split('').some((c) => forbidden.has(c))) return false;
  }

  return true;
}
