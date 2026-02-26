/**
 * HKDF-SHA-256 sub-key derivation using native WebCrypto API.
 * RFC 5869 compliant.
 */
import { toUtf8 } from './utils.js';
/**
 * Derive a sub-key from a master key using HKDF-SHA-256.
 * @param masterKey - The input key material (32 bytes recommended)
 * @param info - Context string to bind the derived key to its purpose
 * @param length - Output key length in bytes (default: 32)
 * @param salt - Optional salt (defaults to zero-filled bytes of hash length)
 */
export async function deriveSubKey(masterKey, info, length = 32, salt) {
    const ikm = await crypto.subtle.importKey('raw', masterKey, { name: 'HKDF' }, false, [
        'deriveBits',
    ]);
    const infoBytes = toUtf8(info);
    const saltBytes = salt ?? new Uint8Array(32); // default: 32 zero bytes
    const derivedBits = await crypto.subtle.deriveBits({
        name: 'HKDF',
        hash: 'SHA-256',
        salt: saltBytes,
        info: infoBytes,
    }, ikm, length * 8);
    return new Uint8Array(derivedBits);
}
//# sourceMappingURL=hkdf.js.map