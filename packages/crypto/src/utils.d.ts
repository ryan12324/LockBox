/**
 * Encoding utilities for the lockbox crypto package.
 * Base64, UTF-8, hex, and constant-time comparison.
 */
/** Encode a Uint8Array to a base64 string. */
export declare function toBase64(bytes: Uint8Array): string;
/** Decode a base64 string to a Uint8Array. */
export declare function fromBase64(b64: string): Uint8Array;
/** Encode a string to UTF-8 bytes. */
export declare function toUtf8(str: string): Uint8Array;
/** Decode UTF-8 bytes to a string. */
export declare function fromUtf8(bytes: Uint8Array): string;
/** Encode a Uint8Array to a lowercase hex string. */
export declare function toHex(bytes: Uint8Array): string;
/** Decode a hex string to a Uint8Array. */
export declare function fromHex(hex: string): Uint8Array;
/**
 * Constant-time comparison of two Uint8Arrays.
 * Prevents timing attacks when comparing secrets.
 */
export declare function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean;
/** Concatenate multiple Uint8Arrays into one. */
export declare function concat(...arrays: Uint8Array[]): Uint8Array;
//# sourceMappingURL=utils.d.ts.map