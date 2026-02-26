/**
 * Crypto package tests.
 * Includes RFC/NIST test vectors and round-trip tests.
 */

import { describe, it, expect } from 'vitest';
import {
  toBase64,
  fromBase64,
  toUtf8,
  fromUtf8,
  toHex,
  fromHex,
  constantTimeEqual,
  concat,
} from '../utils.js';
import { encrypt, decrypt, encryptString, decryptString } from '../encryption.js';
import { deriveSubKey } from '../hkdf.js';
import { deriveKeyPBKDF2, deriveKeyArgon2id, deriveKey } from '../kdf.js';
import {
  generateUserKey,
  encryptUserKey,
  decryptUserKey,
  makeAuthHash,
  generateRecoveryKey,
} from '../keys.js';

// ─── Utils ────────────────────────────────────────────────────────────────────

describe('utils', () => {
  it('toBase64 / fromBase64 round-trip', () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 255, 254, 253]);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });

  it('toBase64 produces correct output for known input', () => {
    // "Man" → "TWFu"
    const bytes = new Uint8Array([77, 97, 110]);
    expect(toBase64(bytes)).toBe('TWFu');
  });

  it('toUtf8 / fromUtf8 round-trip', () => {
    const str = 'Hello, 世界! 🔐';
    expect(fromUtf8(toUtf8(str))).toBe(str);
  });

  it('toHex produces lowercase hex', () => {
    const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    expect(toHex(bytes)).toBe('deadbeef');
  });

  it('fromHex / toHex round-trip', () => {
    const hex = 'cafebabe01234567';
    expect(toHex(fromHex(hex))).toBe(hex);
  });

  it('fromHex throws on odd-length string', () => {
    expect(() => fromHex('abc')).toThrow();
  });

  it('constantTimeEqual returns true for equal arrays', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 3]);
    expect(constantTimeEqual(a, b)).toBe(true);
  });

  it('constantTimeEqual returns false for different arrays', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 4]);
    expect(constantTimeEqual(a, b)).toBe(false);
  });

  it('constantTimeEqual returns false for different lengths', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2]);
    expect(constantTimeEqual(a, b)).toBe(false);
  });

  it('concat joins arrays correctly', () => {
    const a = new Uint8Array([1, 2]);
    const b = new Uint8Array([3, 4]);
    const c = new Uint8Array([5]);
    expect(concat(a, b, c)).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
  });
});

// ─── AES-256-GCM Encryption ───────────────────────────────────────────────────

describe('encryption', () => {
  it('encrypt / decrypt round-trip without AAD', async () => {
    const key = crypto.getRandomValues(new Uint8Array(32));
    const plaintext = toUtf8('Hello, lockbox!');

    const { ciphertext, iv } = await encrypt(plaintext, key);
    const decrypted = await decrypt(ciphertext, key, iv);

    expect(decrypted).toEqual(plaintext);
  });

  it('encrypt / decrypt round-trip with AAD', async () => {
    const key = crypto.getRandomValues(new Uint8Array(32));
    const plaintext = toUtf8('Secret vault item');
    const aad = toUtf8('item-uuid-123:2024-01-01T00:00:00Z');

    const { ciphertext, iv } = await encrypt(plaintext, key, aad);
    const decrypted = await decrypt(ciphertext, key, iv, aad);

    expect(decrypted).toEqual(plaintext);
  });

  it('decrypt throws with wrong AAD (ciphertext transplant protection)', async () => {
    const key = crypto.getRandomValues(new Uint8Array(32));
    const plaintext = toUtf8('Secret');
    const aad = toUtf8('item-123');

    const { ciphertext, iv } = await encrypt(plaintext, key, aad);

    await expect(decrypt(ciphertext, key, iv, toUtf8('item-456'))).rejects.toThrow();
  });

  it('decrypt throws with wrong key', async () => {
    const key = crypto.getRandomValues(new Uint8Array(32));
    const wrongKey = crypto.getRandomValues(new Uint8Array(32));
    const plaintext = toUtf8('Secret');

    const { ciphertext, iv } = await encrypt(plaintext, key);

    await expect(decrypt(ciphertext, wrongKey, iv)).rejects.toThrow();
  });

  it('decrypt throws with tampered ciphertext', async () => {
    const key = crypto.getRandomValues(new Uint8Array(32));
    const plaintext = toUtf8('Secret');

    const { ciphertext, iv } = await encrypt(plaintext, key);
    ciphertext[0] ^= 0xff; // flip bits

    await expect(decrypt(ciphertext, key, iv)).rejects.toThrow();
  });

  it('each encryption produces a unique IV', async () => {
    const key = crypto.getRandomValues(new Uint8Array(32));
    const plaintext = toUtf8('Same plaintext');

    const { iv: iv1 } = await encrypt(plaintext, key);
    const { iv: iv2 } = await encrypt(plaintext, key);

    expect(toBase64(iv1)).not.toBe(toBase64(iv2));
  });

  it('encryptString / decryptString round-trip', async () => {
    const key = crypto.getRandomValues(new Uint8Array(32));
    const plaintext = 'My super secret password 🔑';

    const encrypted = await encryptString(plaintext, key);
    const decrypted = await decryptString(encrypted, key);

    expect(decrypted).toBe(plaintext);
  });

  it('encryptString format is iv.ciphertext', async () => {
    const key = crypto.getRandomValues(new Uint8Array(32));
    const encrypted = await encryptString('test', key);

    expect(encrypted).toContain('.');
    const parts = encrypted.split('.');
    expect(parts).toHaveLength(2);
    // IV should be 12 bytes → 16 base64 chars
    expect(fromBase64(parts[0])).toHaveLength(12);
  });

  it('decryptString throws with wrong key', async () => {
    const key = crypto.getRandomValues(new Uint8Array(32));
    const wrongKey = crypto.getRandomValues(new Uint8Array(32));
    const encrypted = await encryptString('secret', key);

    await expect(decryptString(encrypted, wrongKey)).rejects.toThrow();
  });

  it('decryptString throws with AAD mismatch', async () => {
    const key = crypto.getRandomValues(new Uint8Array(32));
    const aad = toUtf8('item-123');
    const encrypted = await encryptString('secret', key, aad);

    await expect(decryptString(encrypted, key, toUtf8('item-456'))).rejects.toThrow();
  });
});

// ─── HKDF ─────────────────────────────────────────────────────────────────────

describe('hkdf', () => {
  /**
   * RFC 5869 Appendix A — Test Case 1
   * Hash: SHA-256
   * IKM:  0x0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b (22 octets)
   * salt: 0x000102030405060708090a0b0c (13 octets)
   * info: 0xf0f1f2f3f4f5f6f7f8f9 (10 octets)
   * L:    42
   * OKM:  0x3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865
   */
  it('RFC 5869 Test Case 1 — SHA-256', async () => {
    const ikm = fromHex('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b');
    const salt = fromHex('000102030405060708090a0b0c');
    const info = fromHex('f0f1f2f3f4f5f6f7f8f9');
    const expectedOkm = '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865';

    // deriveSubKey uses string info — for RFC test we need raw bytes info
    // We'll test via the raw WebCrypto path by using a helper
    const ikm_key = await crypto.subtle.importKey('raw', ikm as Uint8Array<ArrayBuffer>, { name: 'HKDF' }, false, ['deriveBits']);
    const derived = await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: salt as Uint8Array<ArrayBuffer>, info: info as Uint8Array<ArrayBuffer> },
      ikm_key,
      42 * 8,
    );
    expect(toHex(new Uint8Array(derived))).toBe(expectedOkm);
  });

  it('deriveSubKey produces consistent output for same inputs', async () => {
    const masterKey = crypto.getRandomValues(new Uint8Array(32));
    const info = 'lockbox:vault-encryption-key';

    const key1 = await deriveSubKey(masterKey, info, 32);
    const key2 = await deriveSubKey(masterKey, info, 32);

    expect(key1).toEqual(key2);
  });

  it('deriveSubKey produces different output for different info strings', async () => {
    const masterKey = crypto.getRandomValues(new Uint8Array(32));

    const key1 = await deriveSubKey(masterKey, 'lockbox:purpose-a', 32);
    const key2 = await deriveSubKey(masterKey, 'lockbox:purpose-b', 32);

    expect(toHex(key1)).not.toBe(toHex(key2));
  });

  it('deriveSubKey output length matches requested length', async () => {
    const masterKey = crypto.getRandomValues(new Uint8Array(32));

    const key16 = await deriveSubKey(masterKey, 'test', 16);
    const key32 = await deriveSubKey(masterKey, 'test', 32);
    const key64 = await deriveSubKey(masterKey, 'test', 64);

    expect(key16).toHaveLength(16);
    expect(key32).toHaveLength(32);
    expect(key64).toHaveLength(64);
  });
});

// ─── PBKDF2 ───────────────────────────────────────────────────────────────────

describe('kdf - PBKDF2', () => {
  /**
   * RFC 6070 Test Vector:
   * P = "password", S = "salt", c = 4096, dkLen = 32
   * DK = c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a
   */
  it('RFC 6070 test vector — password/salt/4096/32', async () => {
    const password = 'password';
    const salt = toUtf8('salt');
    const expected = 'c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a';

    const derived = await deriveKeyPBKDF2(password, salt, 4096);
    expect(toHex(derived)).toBe(expected);
  });

  it('PBKDF2 output is 32 bytes', async () => {
    const derived = await deriveKeyPBKDF2('password', toUtf8('salt'), 1000);
    expect(derived).toHaveLength(32);
  });

  it('PBKDF2 is deterministic', async () => {
    const salt = toUtf8('mysalt');
    const d1 = await deriveKeyPBKDF2('mypassword', salt, 1000);
    const d2 = await deriveKeyPBKDF2('mypassword', salt, 1000);
    expect(d1).toEqual(d2);
  });

  it('PBKDF2 differs for different passwords', async () => {
    const salt = toUtf8('salt');
    const d1 = await deriveKeyPBKDF2('password1', salt, 1000);
    const d2 = await deriveKeyPBKDF2('password2', salt, 1000);
    expect(toHex(d1)).not.toBe(toHex(d2));
  });

  it('deriveKey dispatches to PBKDF2 for pbkdf2 config', async () => {
    const salt = toUtf8('salt');
    const config = { type: 'pbkdf2' as const, iterations: 1000 };
    const derived = await deriveKey('password', salt, config);
    const expected = await deriveKeyPBKDF2('password', salt, 1000);
    expect(derived).toEqual(expected);
  });
});

// ─── Argon2id ─────────────────────────────────────────────────────────────────

describe('kdf - Argon2id', () => {
  it('Argon2id produces 32-byte output', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const derived = await deriveKeyArgon2id('password', salt, {
      type: 'argon2id',
      iterations: 1,
      memory: 1024, // 1 MiB for fast tests
      parallelism: 1,
    });
    expect(derived).toHaveLength(32);
  });

  it('Argon2id is deterministic', async () => {
    const salt = new Uint8Array(16).fill(0x42);
    const config = { type: 'argon2id' as const, iterations: 1, memory: 1024, parallelism: 1 };

    const d1 = await deriveKeyArgon2id('password', salt, config);
    const d2 = await deriveKeyArgon2id('password', salt, config);
    expect(d1).toEqual(d2);
  });

  it('Argon2id differs for different passwords', async () => {
    const salt = new Uint8Array(16).fill(0x01);
    const config = { type: 'argon2id' as const, iterations: 1, memory: 1024, parallelism: 1 };

    const d1 = await deriveKeyArgon2id('password1', salt, config);
    const d2 = await deriveKeyArgon2id('password2', salt, config);
    expect(toHex(d1)).not.toBe(toHex(d2));
  });

  it('Argon2id differs for different salts', async () => {
    const config = { type: 'argon2id' as const, iterations: 1, memory: 1024, parallelism: 1 };

    const d1 = await deriveKeyArgon2id('password', new Uint8Array(16).fill(0x01), config);
    const d2 = await deriveKeyArgon2id('password', new Uint8Array(16).fill(0x02), config);
    expect(toHex(d1)).not.toBe(toHex(d2));
  });

  it('deriveKey dispatches to Argon2id for argon2id config', async () => {
    const salt = new Uint8Array(16).fill(0x42);
    const config = { type: 'argon2id' as const, iterations: 1, memory: 1024, parallelism: 1 };

    const d1 = await deriveKey('password', salt, config);
    const d2 = await deriveKeyArgon2id('password', salt, config);
    expect(d1).toEqual(d2);
  });
});

// ─── Key Management ───────────────────────────────────────────────────────────

describe('keys', () => {
  it('generateUserKey returns 64 bytes', () => {
    const key = generateUserKey();
    expect(key).toHaveLength(64);
  });

  it('generateUserKey returns different values each call', () => {
    const k1 = generateUserKey();
    const k2 = generateUserKey();
    expect(toBase64(k1)).not.toBe(toBase64(k2));
  });

  it('encryptUserKey / decryptUserKey round-trip', async () => {
    const masterKey = crypto.getRandomValues(new Uint8Array(32));
    const userKey = generateUserKey();

    const encrypted = await encryptUserKey(userKey, masterKey);
    const decrypted = await decryptUserKey(encrypted, masterKey);

    expect(decrypted).toEqual(userKey);
  });

  it('decryptUserKey fails with wrong master key', async () => {
    const masterKey = crypto.getRandomValues(new Uint8Array(32));
    const wrongKey = crypto.getRandomValues(new Uint8Array(32));
    const userKey = generateUserKey();

    const encrypted = await encryptUserKey(userKey, masterKey);

    await expect(decryptUserKey(encrypted, wrongKey)).rejects.toThrow();
  });

  it('makeAuthHash is deterministic for same inputs', async () => {
    const masterKey = crypto.getRandomValues(new Uint8Array(32));
    const password = 'MyMasterPassword123!';

    const hash1 = await makeAuthHash(masterKey, password);
    const hash2 = await makeAuthHash(masterKey, password);

    expect(hash1).toBe(hash2);
  });

  it('makeAuthHash differs for different master keys', async () => {
    const mk1 = crypto.getRandomValues(new Uint8Array(32));
    const mk2 = crypto.getRandomValues(new Uint8Array(32));
    const password = 'SamePassword';

    const h1 = await makeAuthHash(mk1, password);
    const h2 = await makeAuthHash(mk2, password);

    expect(h1).not.toBe(h2);
  });

  it('makeAuthHash differs for different passwords', async () => {
    const masterKey = crypto.getRandomValues(new Uint8Array(32));

    const h1 = await makeAuthHash(masterKey, 'password1');
    const h2 = await makeAuthHash(masterKey, 'password2');

    expect(h1).not.toBe(h2);
  });

  it('makeAuthHash returns base64 string', async () => {
    const masterKey = crypto.getRandomValues(new Uint8Array(32));
    const hash = await makeAuthHash(masterKey, 'password');

    // Should be valid base64 (32 bytes → 44 chars with padding)
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
    expect(() => fromBase64(hash)).not.toThrow();
  });

  it('generateRecoveryKey returns a formatted string', () => {
    const key = generateRecoveryKey();
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
    // Should contain dashes (formatted in groups)
    expect(key).toContain('-');
  });

  it('generateRecoveryKey returns different values each call', () => {
    const k1 = generateRecoveryKey();
    const k2 = generateRecoveryKey();
    expect(k1).not.toBe(k2);
  });

  it('full key lifecycle: derive → encrypt user key → decrypt → verify', async () => {
    // Simulate registration flow
    const password = 'MySecurePassword!';
    const salt = crypto.getRandomValues(new Uint8Array(16));

    // 1. Derive master key from password
    const masterKey = await deriveKeyPBKDF2(password, salt, 10_000);
    expect(masterKey).toHaveLength(32);

    // 2. Generate user key
    const userKey = generateUserKey();
    expect(userKey).toHaveLength(64);

    // 3. Encrypt user key for server storage
    const encryptedUserKey = await encryptUserKey(userKey, masterKey);
    expect(typeof encryptedUserKey).toBe('string');

    // 4. Make auth hash for server
    const authHash = await makeAuthHash(masterKey, password);
    expect(typeof authHash).toBe('string');

    // 5. Simulate login: re-derive master key, decrypt user key
    const masterKey2 = await deriveKeyPBKDF2(password, salt, 10_000);
    const decryptedUserKey = await decryptUserKey(encryptedUserKey, masterKey2);

    // 6. Verify user key matches original
    expect(decryptedUserKey).toEqual(userKey);
  });
});
