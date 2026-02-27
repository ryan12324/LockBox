/**
 * RSA-OAEP key management tests.
 * Tests key pair generation, private key encryption/decryption, and RSA encryption/decryption.
 */

import { describe, it, expect } from 'vitest';
import {
  generateRsaKeyPair,
  encryptPrivateKey,
  decryptPrivateKey,
  importPublicKey,
  rsaEncrypt,
  rsaDecrypt,
} from '../rsa.js';
import { toBase64, fromBase64, toUtf8 } from '../utils.js';

describe('rsa', () => {
  describe('generateRsaKeyPair', () => {
    it('returns a valid key pair with publicKey as JWK and privateKey as CryptoKey', async () => {
      const { publicKey, privateKey } = await generateRsaKeyPair();

      // Public key should be a JWK object
      expect(publicKey).toBeDefined();
      expect(publicKey.kty).toBe('RSA');
      expect(publicKey.n).toBeDefined(); // modulus
      expect(publicKey.e).toBeDefined(); // public exponent

      // Private key should be a CryptoKey
      expect(privateKey).toBeDefined();
      expect(privateKey.type).toBe('private');
      expect(privateKey.algorithm.name).toBe('RSA-OAEP');
    });

    it('generates different key pairs on each call', async () => {
      const { publicKey: pk1 } = await generateRsaKeyPair();
      const { publicKey: pk2 } = await generateRsaKeyPair();

      // Moduli should be different
      expect(pk1.n).not.toBe(pk2.n);
    });
  });

  describe('encryptPrivateKey / decryptPrivateKey', () => {
    it('round-trip preserves the private key', async () => {
      const { publicKey: jwk, privateKey } = await generateRsaKeyPair();
      const userKey = crypto.getRandomValues(new Uint8Array(32));

      // Encrypt the private key
      const encrypted = await encryptPrivateKey(privateKey, userKey);
      expect(typeof encrypted).toBe('string');

      // Decrypt it back
      const decrypted = await decryptPrivateKey(encrypted, userKey);

      // Verify the decrypted key works by using it to decrypt something
      const publicKey = await importPublicKey(jwk);
      const testData = new Uint8Array([1, 2, 3, 4, 5]);
      const ciphertext = await rsaEncrypt(testData, publicKey);

      // Use original private key to decrypt
      const decrypted1 = await rsaDecrypt(ciphertext, privateKey);

      // Use decrypted private key to decrypt the same ciphertext
      const ciphertext2 = await rsaEncrypt(testData, publicKey);
      const decrypted2 = await rsaDecrypt(ciphertext2, decrypted);

      expect(decrypted1).toEqual(testData);
      expect(decrypted2).toEqual(testData);
    });

    it('throws when decrypting with wrong user key', async () => {
      const { privateKey } = await generateRsaKeyPair();
      const userKey = crypto.getRandomValues(new Uint8Array(32));
      const wrongKey = crypto.getRandomValues(new Uint8Array(32));

      const encrypted = await encryptPrivateKey(privateKey, userKey);

      await expect(decryptPrivateKey(encrypted, wrongKey)).rejects.toThrow();
    });

    it('produces different ciphertexts for the same key with different user keys', async () => {
      const { privateKey } = await generateRsaKeyPair();
      const userKey1 = crypto.getRandomValues(new Uint8Array(32));
      const userKey2 = crypto.getRandomValues(new Uint8Array(32));

      const encrypted1 = await encryptPrivateKey(privateKey, userKey1);
      const encrypted2 = await encryptPrivateKey(privateKey, userKey2);

      expect(encrypted1).not.toBe(encrypted2);
    });
  });

  describe('importPublicKey', () => {
    it('imports a JWK public key as a usable CryptoKey', async () => {
      const { publicKey: jwk } = await generateRsaKeyPair();

      const importedKey = await importPublicKey(jwk);

      expect(importedKey).toBeDefined();
      expect(importedKey.type).toBe('public');
      expect(importedKey.algorithm.name).toBe('RSA-OAEP');
    });

    it('imported key can be used to encrypt data', async () => {
      const { publicKey: jwk, privateKey } = await generateRsaKeyPair();
      const importedKey = await importPublicKey(jwk);

      const testData = new Uint8Array([42, 43, 44]);
      const ciphertext = await rsaEncrypt(testData, importedKey);

      // Decrypt with original private key to verify
      const decrypted = await rsaDecrypt(ciphertext, privateKey);
      expect(decrypted).toEqual(testData);
    });
  });

  describe('rsaEncrypt / rsaDecrypt', () => {
    it('round-trip preserves data', async () => {
      const { publicKey: jwk, privateKey } = await generateRsaKeyPair();
      const publicKey = await importPublicKey(jwk);
      const testData = new Uint8Array([1, 2, 3, 4, 5, 255, 254, 253]);

      const ciphertext = await rsaEncrypt(testData, publicKey);
      const decrypted = await rsaDecrypt(ciphertext, privateKey);

      expect(decrypted).toEqual(testData);
    });

    it('encrypts strings (as UTF-8 bytes)', async () => {
      const { publicKey: jwk, privateKey } = await generateRsaKeyPair();
      const publicKey = await importPublicKey(jwk);
      const testString = 'Hello, RSA!';
      const testData = toUtf8(testString);

      const ciphertext = await rsaEncrypt(testData, publicKey);
      const decrypted = await rsaDecrypt(ciphertext, privateKey);

      expect(decrypted).toEqual(testData);
    });

    it('produces different ciphertexts for the same plaintext', async () => {
      const { publicKey: jwk, privateKey } = await generateRsaKeyPair();
      const publicKey = await importPublicKey(jwk);
      const testData = new Uint8Array([1, 2, 3]);

      const ciphertext1 = await rsaEncrypt(testData, publicKey);
      const ciphertext2 = await rsaEncrypt(testData, publicKey);

      // RSA-OAEP uses randomness, so ciphertexts should differ
      expect(ciphertext1).not.toBe(ciphertext2);

      // But both should decrypt to the same plaintext
      const decrypted1 = await rsaDecrypt(ciphertext1, privateKey);
      const decrypted2 = await rsaDecrypt(ciphertext2, privateKey);

      expect(decrypted1).toEqual(testData);
      expect(decrypted2).toEqual(testData);
    });

    it('throws when decrypting with wrong private key', async () => {
      const { publicKey: jwk1 } = await generateRsaKeyPair();
      const { privateKey: sk2 } = await generateRsaKeyPair();
      const publicKey = await importPublicKey(jwk1);
      const testData = new Uint8Array([1, 2, 3]);
      const ciphertext = await rsaEncrypt(testData, publicKey);

      // Decrypting with wrong key should throw
      await expect(rsaDecrypt(ciphertext, sk2)).rejects.toThrow();
    });

    it('returns base64-encoded ciphertext', async () => {
      const { publicKey: jwk } = await generateRsaKeyPair();
      const publicKey = await importPublicKey(jwk);
      const testData = new Uint8Array([1, 2, 3]);

      const ciphertext = await rsaEncrypt(testData, publicKey);

      // Should be a valid base64 string
      expect(typeof ciphertext).toBe('string');
      expect(() => fromBase64(ciphertext)).not.toThrow();
    });

    it('handles large data (up to RSA-2048 limit)', async () => {
      const { publicKey: jwk, privateKey } = await generateRsaKeyPair();
      const publicKey = await importPublicKey(jwk);
      // RSA-2048 can encrypt up to 190 bytes with OAEP-SHA256
      const largeData = crypto.getRandomValues(new Uint8Array(190));

      const ciphertext = await rsaEncrypt(largeData, publicKey);
      const decrypted = await rsaDecrypt(ciphertext, privateKey);

      expect(decrypted).toEqual(largeData);
    });
  });
  describe('integration: full RSA workflow', () => {
    it('generates key pair, encrypts private key, decrypts, and uses it', async () => {
      // 1. Generate key pair
      const { publicKey: jwk, privateKey } = await generateRsaKeyPair();

      // 2. Encrypt private key with user key
      const userKey = crypto.getRandomValues(new Uint8Array(32));
      const encryptedPrivateKey = await encryptPrivateKey(privateKey, userKey);

      // 3. Simulate server storage and retrieval
      const storedEncrypted = encryptedPrivateKey;

      // 4. Decrypt private key
      const decryptedPrivateKey = await decryptPrivateKey(storedEncrypted, userKey);

      // 5. Import public key
      const importedPublicKey = await importPublicKey(jwk);

      // 6. Encrypt data with public key
      const folderKey = crypto.getRandomValues(new Uint8Array(32));
      const wrappedKey = await rsaEncrypt(folderKey, importedPublicKey);

      // 7. Decrypt with decrypted private key
      const unwrappedKey = await rsaDecrypt(wrappedKey, decryptedPrivateKey);

      expect(unwrappedKey).toEqual(folderKey);
    });
  });
});
