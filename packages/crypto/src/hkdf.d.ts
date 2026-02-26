/**
 * HKDF-SHA-256 sub-key derivation using native WebCrypto API.
 * RFC 5869 compliant.
 */
/**
 * Derive a sub-key from a master key using HKDF-SHA-256.
 * @param masterKey - The input key material (32 bytes recommended)
 * @param info - Context string to bind the derived key to its purpose
 * @param length - Output key length in bytes (default: 32)
 * @param salt - Optional salt (defaults to zero-filled bytes of hash length)
 */
export declare function deriveSubKey(masterKey: Uint8Array, info: string, length?: number, salt?: Uint8Array): Promise<Uint8Array>;
//# sourceMappingURL=hkdf.d.ts.map