/**
 * AES-256-GCM encryption/decryption using native WebCrypto API.
 * All operations use a fresh random 96-bit IV per encryption.
 * AAD (Additional Authenticated Data) binding is supported and recommended:
 * callers should pass `itemId + revisionDate` as AAD to prevent ciphertext transplant attacks.
 */
import { toBase64, fromBase64, toUtf8, fromUtf8 } from './utils.js';
const IV_LENGTH = 12; // 96 bits
/**
 * Encrypt plaintext bytes with AES-256-GCM.
 * Returns ciphertext (with 16-byte auth tag appended by WebCrypto) and the IV used.
 */
export async function encrypt(plaintext, key, aad) {
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['encrypt']);
    const params = { name: 'AES-GCM', iv: iv };
    if (aad)
        params.additionalData = aad;
    const ciphertextBuffer = await crypto.subtle.encrypt(params, cryptoKey, plaintext);
    const ciphertext = new Uint8Array(ciphertextBuffer);
    return { ciphertext, iv };
}
/**
 * Decrypt AES-256-GCM ciphertext (with auth tag appended).
 * Throws if authentication fails (wrong key, wrong AAD, or tampered ciphertext).
 */
export async function decrypt(ciphertext, key, iv, aad) {
    const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['decrypt']);
    const params = { name: 'AES-GCM', iv: iv };
    if (aad)
        params.additionalData = aad;
    const plaintextBuffer = await crypto.subtle.decrypt(params, cryptoKey, ciphertext);
    return new Uint8Array(plaintextBuffer);
}
/**
 * Encrypt a UTF-8 string and return a compact string representation.
 * Format: `base64(iv).base64(ciphertext+tag)`
 * AAD is recommended: pass `itemId + revisionDate` to bind ciphertext to its context.
 */
export async function encryptString(plaintext, key, aad) {
    const plaintextBytes = toUtf8(plaintext);
    const { ciphertext, iv } = await encrypt(plaintextBytes, key, aad);
    return `${toBase64(iv)}.${toBase64(ciphertext)}`;
}
/**
 * Decrypt a string produced by `encryptString`.
 * Throws if authentication fails.
 */
export async function decryptString(encrypted, key, aad) {
    const dotIndex = encrypted.indexOf('.');
    if (dotIndex === -1)
        throw new Error('Invalid encrypted string format: missing "."');
    const iv = fromBase64(encrypted.slice(0, dotIndex));
    const ciphertext = fromBase64(encrypted.slice(dotIndex + 1));
    const plaintext = await decrypt(ciphertext, key, iv, aad);
    return fromUtf8(plaintext);
}
//# sourceMappingURL=encryption.js.map