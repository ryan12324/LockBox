export interface PasswordOptions {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  digits: boolean;
  symbols: boolean;
  excludeAmbiguous?: boolean;
}

const DEFAULT_OPTIONS: PasswordOptions = {
  length: 20,
  uppercase: true,
  lowercase: true,
  digits: true,
  symbols: true,
  excludeAmbiguous: false,
};

const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const SYMBOLS = '!@#$%^&*()_+-=[]{}|;:,.<>?';
const AMBIGUOUS = '0O1lI|';

function getRandomIndex(max: number): number {
  const randomBytes = new Uint8Array(1);
  crypto.getRandomValues(randomBytes);
  return randomBytes[0] % max;
}
export function generatePassword(opts?: Partial<PasswordOptions>): string {
  const options = { ...DEFAULT_OPTIONS, ...opts };

  // Validate options
  if (options.length < 8 || options.length > 128) {
    throw new Error('Password length must be between 8 and 128');
  }

  if (!options.uppercase && !options.lowercase && !options.digits && !options.symbols) {
    throw new Error('At least one character set must be enabled');
  }

  // Build character pool
  let pool = '';
  const requiredChars: string[] = [];

  if (options.uppercase) {
    const chars = options.excludeAmbiguous
      ? UPPERCASE.split('').filter((c) => !AMBIGUOUS.includes(c)).join('')
      : UPPERCASE;
    pool += chars;
    requiredChars.push(chars[getRandomIndex(chars.length)]);
  }

  if (options.lowercase) {
    const chars = options.excludeAmbiguous
      ? LOWERCASE.split('').filter((c) => !AMBIGUOUS.includes(c)).join('')
      : LOWERCASE;
    pool += chars;
    requiredChars.push(chars[getRandomIndex(chars.length)]);
  }

  if (options.digits) {
    const chars = options.excludeAmbiguous
      ? DIGITS.split('').filter((c) => !AMBIGUOUS.includes(c)).join('')
      : DIGITS;
    pool += chars;
    requiredChars.push(chars[getRandomIndex(chars.length)]);
  }

  if (options.symbols) {
    const chars = options.excludeAmbiguous
      ? SYMBOLS.split('').filter((c) => !AMBIGUOUS.includes(c)).join('')
      : SYMBOLS;
    pool += chars;
    requiredChars.push(chars[getRandomIndex(chars.length)]);
  }

  // Generate password using crypto.getRandomValues()
  const randomBytes = new Uint8Array(options.length);
  crypto.getRandomValues(randomBytes);

  let password = '';
  for (let i = 0; i < options.length; i++) {
    const index = randomBytes[i] % pool.length;
    password += pool[index];
  }

  // Ensure at least one character from each enabled set
  // Shuffle required chars into password
  const passwordArray = password.split('');
  for (let i = 0; i < requiredChars.length && i < passwordArray.length; i++) {
    const randomIndex = getRandomIndex(passwordArray.length);
    passwordArray[randomIndex] = requiredChars[i];
  }

  return passwordArray.join('');
}
