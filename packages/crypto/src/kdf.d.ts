/**
 * Key Derivation Functions for lockbox.
 * Supports Argon2id (via hash-wasm WASM) with PBKDF2 fallback.
 * Master Password → Master Key (32 bytes) derivation.
 */
import type { KdfConfig } from '@lockbox/types';
/**
 * Derive a 32-byte master key using Argon2id.
 * Uses hash-wasm WASM implementation (works in Workers + browser).
 */
export declare function deriveKeyArgon2id(password: string, salt: Uint8Array, config?: Partial<KdfConfig>): Promise<Uint8Array>;
/**
 * Derive a 32-byte master key using PBKDF2-HMAC-SHA256.
 * Fallback when Argon2 is not available or for auth hash derivation.
 */
export declare function deriveKeyPBKDF2(password: string, salt: Uint8Array, iterations?: number): Promise<Uint8Array>;
/**
 * Derive a master key from a password and salt using the configured KDF.
 * Dispatches to Argon2id or PBKDF2 based on config.type.
 */
export declare function deriveKey(password: string, salt: Uint8Array, config: KdfConfig): Promise<Uint8Array>;
//# sourceMappingURL=kdf.d.ts.map