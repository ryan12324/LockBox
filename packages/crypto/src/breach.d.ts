/**
 * HIBP (Have I Been Pwned) breach checking using k-anonymity.
 *
 * Only the first 5 characters of the SHA-1 hash are sent to the API,
 * so the full password hash is never exposed to the remote service.
 *
 * @see https://haveibeenpwned.com/API/v3#SearchingPwnedPasswordsByRange
 */
import type { BreachCheckResult } from '@lockbox/types';
/**
 * Compute the SHA-1 hex digest of `input` using the Web Crypto API.
 * Returns a lowercase hex string.
 */
export declare function sha1Hex(input: string): Promise<string>;
/**
 * Check a single password against the HIBP Pwned Passwords database.
 *
 * Uses k-anonymity: only the 5-character SHA-1 prefix is sent over the network.
 */
export declare function checkPassword(password: string): Promise<BreachCheckResult>;
/**
 * Check multiple passwords in batch with rate limiting.
 *
 * Inserts a 100 ms delay between successive API calls to respect HIBP guidelines.
 */
export declare function checkBatch(passwords: Array<{
    id: string;
    password: string;
}>): Promise<Map<string, BreachCheckResult>>;
//# sourceMappingURL=breach.d.ts.map