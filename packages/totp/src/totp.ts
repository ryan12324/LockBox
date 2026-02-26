/**
 * RFC 6238 TOTP (Time-based One-Time Password) implementation
 * https://www.rfc-editor.org/rfc/rfc6238
 * 
 * RFC 4226 HOTP (HMAC-based One-Time Password) implementation
 * https://www.rfc-editor.org/rfc/rfc4226
 */

export interface HOTPOptions {
  digits?: number;
  algorithm?: 'SHA-1' | 'SHA-256' | 'SHA-512';
}

export interface TOTPOptions extends HOTPOptions {
  period?: number;
}

/**
 * Generate HOTP code using HMAC-based One-Time Password algorithm (RFC 4226)
 * 
 * @param secret - The shared secret as Uint8Array
 * @param counter - The counter value (typically time-based for TOTP)
 * @param opts - Options: digits (default 6), algorithm (default SHA-1)
 * @returns The OTP code as a string (zero-padded to digits length)
 */
export async function hotp(
  secret: Uint8Array,
  counter: number,
  opts?: HOTPOptions
): Promise<string> {
  const digits = opts?.digits ?? 6;
  const algorithm = opts?.algorithm ?? 'SHA-1';
  
  // Convert counter to 8-byte big-endian buffer
  const counterBuffer = new ArrayBuffer(8);
  const view = new DataView(counterBuffer);
  view.setBigInt64(0, BigInt(counter), false); // false = big-endian
  
  // Import the secret as HMAC key
  const hashAlgorithm = algorithm === 'SHA-1' ? 'SHA-1' : algorithm === 'SHA-256' ? 'SHA-256' : 'SHA-512';
  const secretBuffer = secret.buffer.slice(secret.byteOffset, secret.byteOffset + secret.byteLength) as ArrayBuffer;
  const key = await crypto.subtle.importKey(
    'raw',
    secretBuffer,
    { name: 'HMAC', hash: hashAlgorithm },
    false,
    ['sign']
  );
  
  // Compute HMAC
  const hmacBuffer = await crypto.subtle.sign('HMAC', key, counterBuffer);
  const hmac = new Uint8Array(hmacBuffer);
  
  // Dynamic truncation (RFC 4226 Section 5.4)
  const offset = hmac[hmac.length - 1] & 0x0f;
  const p = (hmac[offset] & 0x7f) << 24 |
            (hmac[offset + 1] & 0xff) << 16 |
            (hmac[offset + 2] & 0xff) << 8 |
            (hmac[offset + 3] & 0xff);
  
  const code = p % Math.pow(10, digits);
  
  // Zero-pad to digits length
  return code.toString().padStart(digits, '0');
}

/**
 * Generate TOTP code using Time-based One-Time Password algorithm (RFC 6238)
 * 
 * @param secret - The shared secret as Uint8Array
 * @param time - Time in milliseconds (defaults to Date.now())
 * @param opts - Options: period (default 30), digits (default 6), algorithm (default SHA-1)
 * @returns The OTP code as a string (zero-padded to digits length)
 */
export async function totp(
  secret: Uint8Array,
  time?: number,
  opts?: TOTPOptions
): Promise<string> {
  const period = opts?.period ?? 30;
  const currentTime = time ?? Date.now();
  
  // Convert milliseconds to seconds and calculate counter
  const counter = Math.floor(currentTime / 1000 / period);
  
  return hotp(secret, counter, {
    digits: opts?.digits,
    algorithm: opts?.algorithm,
  });
}

/**
 * Get the number of seconds remaining until the next TOTP period
 * 
 * @param period - The TOTP period in seconds (default 30)
 * @returns Number of seconds remaining (0-period)
 */
export function getRemainingSeconds(period?: number): number {
  const p = period ?? 30;
  const now = Math.floor(Date.now() / 1000);
  return p - (now % p);
}
