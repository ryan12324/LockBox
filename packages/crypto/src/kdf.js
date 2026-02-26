/**
 * Key Derivation Functions for lockbox.
 * Supports Argon2id (via hash-wasm WASM) with PBKDF2 fallback.
 * Master Password → Master Key (32 bytes) derivation.
 */
import { argon2id } from 'hash-wasm';
import { toUtf8 } from './utils.js';
/** Default Argon2id parameters (OWASP recommended minimums for 2024) */
const ARGON2_DEFAULTS = {
    iterations: 3,
    memorySize: 65536, // 64 MiB in KiB
    parallelism: 4,
    hashLength: 32,
};
/** Default PBKDF2 parameters */
const PBKDF2_DEFAULTS = {
    iterations: 600_000,
    hashLength: 32,
};
/**
 * Derive a 32-byte master key using Argon2id.
 * Uses hash-wasm WASM implementation (works in Workers + browser).
 */
export async function deriveKeyArgon2id(password, salt, config) {
    const iterations = config?.iterations ?? ARGON2_DEFAULTS.iterations;
    const memorySize = config?.memory ?? ARGON2_DEFAULTS.memorySize;
    const parallelism = config?.parallelism ?? ARGON2_DEFAULTS.parallelism;
    const result = await argon2id({
        password: toUtf8(password),
        salt,
        iterations,
        memorySize,
        parallelism,
        hashLength: ARGON2_DEFAULTS.hashLength,
        outputType: 'binary',
    });
    return result;
}
/**
 * Derive a 32-byte master key using PBKDF2-HMAC-SHA256.
 * Fallback when Argon2 is not available or for auth hash derivation.
 */
export async function deriveKeyPBKDF2(password, salt, iterations) {
    const iter = iterations ?? PBKDF2_DEFAULTS.iterations;
    const keyMaterial = await crypto.subtle.importKey('raw', toUtf8(password), { name: 'PBKDF2' }, false, ['deriveBits']);
    const derivedBits = await crypto.subtle.deriveBits({
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt: salt,
        iterations: iter,
    }, keyMaterial, PBKDF2_DEFAULTS.hashLength * 8);
    return new Uint8Array(derivedBits);
}
/**
 * Derive a master key from a password and salt using the configured KDF.
 * Dispatches to Argon2id or PBKDF2 based on config.type.
 */
export async function deriveKey(password, salt, config) {
    if (config.type === 'argon2id') {
        return deriveKeyArgon2id(password, salt, config);
    }
    return deriveKeyPBKDF2(password, salt, config.iterations);
}
//# sourceMappingURL=kdf.js.map