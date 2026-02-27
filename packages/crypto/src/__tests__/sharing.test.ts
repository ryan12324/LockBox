/**
 * Folder key and share link crypto tests.
 * Tests folder key generation/wrapping, shared item encryption, and share link derivation.
 */

import { describe, it, expect } from 'vitest';
import {
  generateFolderKey,
  wrapFolderKey,
  unwrapFolderKey,
  encryptSharedItem,
  decryptSharedItem,
  generateShareSecret,
  deriveShareComponents,
  encryptForShareLink,
  decryptFromShareLink,
  hashShareToken,
  encodeShareSecret,
  decodeShareSecret,
} from '../sharing.js';
import { generateRsaKeyPair, importPublicKey } from '../rsa.js';
import { toUtf8, toHex, fromUtf8 } from '../utils.js';

describe('sharing', () => {
  describe('generateFolderKey', () => {
    it('returns a 32-byte random key', () => {
      const key = generateFolderKey();

      expect(key).toBeInstanceOf(Uint8Array);
      expect(key).toHaveLength(32);
    });

    it('returns different keys on each call', () => {
      const key1 = generateFolderKey();
      const key2 = generateFolderKey();

      expect(toHex(key1)).not.toBe(toHex(key2));
    });
  });

  describe('wrapFolderKey / unwrapFolderKey', () => {
    it('round-trip preserves the folder key', async () => {
      const { publicKey: jwk, privateKey } = await generateRsaKeyPair();
      const publicKey = await importPublicKey(jwk);
      const folderKey = generateFolderKey();

      const wrapped = await wrapFolderKey(folderKey, publicKey);
      const unwrapped = await unwrapFolderKey(wrapped, privateKey);

      expect(unwrapped).toEqual(folderKey);
    });

    it('wrapped key is a base64 string', async () => {
      const { publicKey: jwk } = await generateRsaKeyPair();
      const publicKey = await importPublicKey(jwk);
      const folderKey = generateFolderKey();

      const wrapped = await wrapFolderKey(folderKey, publicKey);

      expect(typeof wrapped).toBe('string');
      // Should be valid base64
      expect(() => atob(wrapped)).not.toThrow();
    });

    it('throws when unwrapping with wrong private key', async () => {
      const { publicKey: jwk1 } = await generateRsaKeyPair();
      const { privateKey: sk2 } = await generateRsaKeyPair();
      const publicKey = await importPublicKey(jwk1);
      const folderKey = generateFolderKey();

      const wrapped = await wrapFolderKey(folderKey, publicKey);

      await expect(unwrapFolderKey(wrapped, sk2)).rejects.toThrow();
    });

    it('produces different wrapped keys for the same folder key with different public keys', async () => {
      const { publicKey: jwk1 } = await generateRsaKeyPair();
      const { publicKey: jwk2 } = await generateRsaKeyPair();
      const pk1 = await importPublicKey(jwk1);
      const pk2 = await importPublicKey(jwk2);
      const folderKey = generateFolderKey();

      const wrapped1 = await wrapFolderKey(folderKey, pk1);
      const wrapped2 = await wrapFolderKey(folderKey, pk2);

      expect(wrapped1).not.toBe(wrapped2);
    });
  });

  describe('encryptSharedItem / decryptSharedItem', () => {
    it('round-trip preserves plaintext with correct AAD', async () => {
      const folderKey = generateFolderKey();
      const itemId = 'item-uuid-123';
      const revisionDate = '2024-01-01T00:00:00Z';
      const plaintext = 'My secret password';

      const ciphertext = await encryptSharedItem(plaintext, folderKey, itemId, revisionDate);
      const decrypted = await decryptSharedItem(ciphertext, folderKey, itemId, revisionDate);

      expect(decrypted).toBe(plaintext);
    });

    it('throws when decrypting with wrong AAD (itemId mismatch)', async () => {
      const folderKey = generateFolderKey();
      const itemId = 'item-123';
      const revisionDate = '2024-01-01T00:00:00Z';
      const plaintext = 'Secret';

      const ciphertext = await encryptSharedItem(plaintext, folderKey, itemId, revisionDate);

      // Try to decrypt with different itemId
      await expect(
        decryptSharedItem(ciphertext, folderKey, 'item-456', revisionDate)
      ).rejects.toThrow();
    });

    it('throws when decrypting with wrong AAD (revisionDate mismatch)', async () => {
      const folderKey = generateFolderKey();
      const itemId = 'item-123';
      const revisionDate = '2024-01-01T00:00:00Z';
      const plaintext = 'Secret';

      const ciphertext = await encryptSharedItem(plaintext, folderKey, itemId, revisionDate);

      // Try to decrypt with different revisionDate
      await expect(
        decryptSharedItem(ciphertext, folderKey, itemId, '2024-01-02T00:00:00Z')
      ).rejects.toThrow();
    });

    it('throws when decrypting with wrong folder key', async () => {
      const folderKey1 = generateFolderKey();
      const folderKey2 = generateFolderKey();
      const itemId = 'item-123';
      const revisionDate = '2024-01-01T00:00:00Z';
      const plaintext = 'Secret';

      const ciphertext = await encryptSharedItem(plaintext, folderKey1, itemId, revisionDate);

      await expect(
        decryptSharedItem(ciphertext, folderKey2, itemId, revisionDate)
      ).rejects.toThrow();
    });

    it('produces different ciphertexts for the same plaintext', async () => {
      const folderKey = generateFolderKey();
      const itemId = 'item-123';
      const revisionDate = '2024-01-01T00:00:00Z';
      const plaintext = 'Secret';

      const ciphertext1 = await encryptSharedItem(plaintext, folderKey, itemId, revisionDate);
      const ciphertext2 = await encryptSharedItem(plaintext, folderKey, itemId, revisionDate);

      // Different IVs should produce different ciphertexts
      expect(ciphertext1).not.toBe(ciphertext2);
    });

    it('handles JSON plaintext', async () => {
      const folderKey = generateFolderKey();
      const itemId = 'item-123';
      const revisionDate = '2024-01-01T00:00:00Z';
      const plaintext = JSON.stringify({ username: 'user@example.com', password: 'secret' });

      const ciphertext = await encryptSharedItem(plaintext, folderKey, itemId, revisionDate);
      const decrypted = await decryptSharedItem(ciphertext, folderKey, itemId, revisionDate);

      expect(JSON.parse(decrypted)).toEqual(JSON.parse(plaintext));
    });
  });

  describe('generateShareSecret', () => {
    it('returns a 32-byte random secret', () => {
      const secret = generateShareSecret();

      expect(secret).toBeInstanceOf(Uint8Array);
      expect(secret).toHaveLength(32);
    });

    it('returns different secrets on each call', () => {
      const secret1 = generateShareSecret();
      const secret2 = generateShareSecret();

      expect(toHex(secret1)).not.toBe(toHex(secret2));
    });
  });

  describe('deriveShareComponents', () => {
    it('returns encKey (32B), authToken (16B), and shareId (hex string)', async () => {
      const secret = generateShareSecret();

      const { encKey, authToken, shareId } = await deriveShareComponents(secret);

      expect(encKey).toBeInstanceOf(Uint8Array);
      expect(encKey).toHaveLength(32);

      expect(authToken).toBeInstanceOf(Uint8Array);
      expect(authToken).toHaveLength(16);

      expect(typeof shareId).toBe('string');
      expect(shareId).toHaveLength(32); // 16 bytes → 32 hex chars
      // Should be valid hex
      expect(/^[0-9a-f]{32}$/.test(shareId)).toBe(true);
    });

    it('is deterministic (same secret → same output)', async () => {
      const secret = generateShareSecret();

      const result1 = await deriveShareComponents(secret);
      const result2 = await deriveShareComponents(secret);

      expect(result1.encKey).toEqual(result2.encKey);
      expect(result1.authToken).toEqual(result2.authToken);
      expect(result1.shareId).toBe(result2.shareId);
    });

    it('produces different outputs for different secrets', async () => {
      const secret1 = generateShareSecret();
      const secret2 = generateShareSecret();

      const result1 = await deriveShareComponents(secret1);
      const result2 = await deriveShareComponents(secret2);

      expect(toHex(result1.encKey)).not.toBe(toHex(result2.encKey));
      expect(toHex(result1.authToken)).not.toBe(toHex(result2.authToken));
      expect(result1.shareId).not.toBe(result2.shareId);
    });
  });

  describe('encryptForShareLink / decryptFromShareLink', () => {
    it('round-trip preserves plaintext with correct shareId AAD', async () => {
      const secret = generateShareSecret();
      const { encKey, shareId } = await deriveShareComponents(secret);
      const plaintext = 'Shared password';

      const ciphertext = await encryptForShareLink(plaintext, encKey, shareId);
      const decrypted = await decryptFromShareLink(ciphertext, encKey, shareId);

      expect(decrypted).toBe(plaintext);
    });

    it('throws when decrypting with wrong shareId AAD', async () => {
      const secret = generateShareSecret();
      const { encKey, shareId } = await deriveShareComponents(secret);
      const plaintext = 'Secret';

      const ciphertext = await encryptForShareLink(plaintext, encKey, shareId);

      // Try with different shareId
      const wrongShareId = 'a'.repeat(32);
      await expect(decryptFromShareLink(ciphertext, encKey, wrongShareId)).rejects.toThrow();
    });

    it('throws when decrypting with wrong encKey', async () => {
      const secret1 = generateShareSecret();
      const secret2 = generateShareSecret();
      const { encKey: encKey1, shareId } = await deriveShareComponents(secret1);
      const { encKey: encKey2 } = await deriveShareComponents(secret2);
      const plaintext = 'Secret';

      const ciphertext = await encryptForShareLink(plaintext, encKey1, shareId);

      await expect(decryptFromShareLink(ciphertext, encKey2, shareId)).rejects.toThrow();
    });

    it('produces different ciphertexts for the same plaintext', async () => {
      const secret = generateShareSecret();
      const { encKey, shareId } = await deriveShareComponents(secret);
      const plaintext = 'Secret';

      const ciphertext1 = await encryptForShareLink(plaintext, encKey, shareId);
      const ciphertext2 = await encryptForShareLink(plaintext, encKey, shareId);

      expect(ciphertext1).not.toBe(ciphertext2);
    });
  });

  describe('hashShareToken', () => {
    it('returns a 64-character hex string (SHA-256)', async () => {
      const authToken = crypto.getRandomValues(new Uint8Array(16));

      const hash = await hashShareToken(authToken);

      expect(typeof hash).toBe('string');
      expect(hash).toHaveLength(64); // 32 bytes → 64 hex chars
      expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
    });

    it('is deterministic (same token → same hash)', async () => {
      const authToken = crypto.getRandomValues(new Uint8Array(16));

      const hash1 = await hashShareToken(authToken);
      const hash2 = await hashShareToken(authToken);

      expect(hash1).toBe(hash2);
    });

    it('produces different hashes for different tokens', async () => {
      const token1 = crypto.getRandomValues(new Uint8Array(16));
      const token2 = crypto.getRandomValues(new Uint8Array(16));

      const hash1 = await hashShareToken(token1);
      const hash2 = await hashShareToken(token2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('encodeShareSecret / decodeShareSecret', () => {
    it('round-trip preserves the secret', () => {
      const secret = generateShareSecret();

      const encoded = encodeShareSecret(secret);
      const decoded = decodeShareSecret(encoded);

      expect(decoded).toEqual(secret);
    });

    it('encoded secret is a valid base64url string', () => {
      const secret = generateShareSecret();

      const encoded = encodeShareSecret(secret);

      // Should not contain +, /, or = (base64url)
      expect(encoded).not.toContain('+');
      expect(encoded).not.toContain('/');
      expect(encoded).not.toContain('=');

      // Should be valid base64url (can decode without error)
      expect(() => decodeShareSecret(encoded)).not.toThrow();
    });

    it('produces different encoded strings for different secrets', () => {
      const secret1 = generateShareSecret();
      const secret2 = generateShareSecret();

      const encoded1 = encodeShareSecret(secret1);
      const encoded2 = encodeShareSecret(secret2);

      expect(encoded1).not.toBe(encoded2);
    });

    it('handles 32-byte secrets correctly', () => {
      const secret = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        secret[i] = i;
      }

      const encoded = encodeShareSecret(secret);
      const decoded = decodeShareSecret(encoded);

      expect(decoded).toEqual(secret);
    });
  });

  describe('integration: full share link workflow', () => {
    it('generates secret, derives components, encrypts item, and decrypts', async () => {
      // 1. Generate share secret
      const secret = generateShareSecret();

      // 2. Derive components
      const { encKey, authToken, shareId } = await deriveShareComponents(secret);

      // 3. Encrypt an item for the share link
      const plaintext = JSON.stringify({
        username: 'user@example.com',
        password: 'shared-password',
      });
      const ciphertext = await encryptForShareLink(plaintext, encKey, shareId);

      // 4. Hash the auth token for server storage
      const tokenHash = await hashShareToken(authToken);

      // 5. Encode secret for URL fragment
      const encodedSecret = encodeShareSecret(secret);

      // 6. Simulate share link access: decode secret, derive components, decrypt
      const decodedSecret = decodeShareSecret(encodedSecret);
      const { encKey: recoveredEncKey, shareId: recoveredShareId } =
        await deriveShareComponents(decodedSecret);

      const decrypted = await decryptFromShareLink(ciphertext, recoveredEncKey, recoveredShareId);

      expect(JSON.parse(decrypted)).toEqual(JSON.parse(plaintext));
      expect(typeof tokenHash).toBe('string');
      expect(tokenHash).toHaveLength(64);
    });

    it('multiple items in same folder use same folder key but different AAD', async () => {
      const folderKey = generateFolderKey();
      const item1Id = 'item-1';
      const item2Id = 'item-2';
      const revisionDate = '2024-01-01T00:00:00Z';

      const plaintext1 = 'Password 1';
      const plaintext2 = 'Password 2';

      const ciphertext1 = await encryptSharedItem(plaintext1, folderKey, item1Id, revisionDate);
      const ciphertext2 = await encryptSharedItem(plaintext2, folderKey, item2Id, revisionDate);

      // Ciphertexts should be different (different AAD)
      expect(ciphertext1).not.toBe(ciphertext2);

      // But both should decrypt with the same folder key
      const decrypted1 = await decryptSharedItem(ciphertext1, folderKey, item1Id, revisionDate);
      const decrypted2 = await decryptSharedItem(ciphertext2, folderKey, item2Id, revisionDate);

      expect(decrypted1).toBe(plaintext1);
      expect(decrypted2).toBe(plaintext2);

      // Cross-decryption should fail (AAD mismatch)
      await expect(
        decryptSharedItem(ciphertext1, folderKey, item2Id, revisionDate)
      ).rejects.toThrow();
    });

    it('folder key wrapping for multiple team members', async () => {
      // 1. Generate folder key
      const folderKey = generateFolderKey();

      // 2. Generate key pairs for two team members
      const { publicKey: jwk1, privateKey: sk1 } = await generateRsaKeyPair();
      const { publicKey: jwk2, privateKey: sk2 } = await generateRsaKeyPair();
      const pk1 = await importPublicKey(jwk1);
      const pk2 = await importPublicKey(jwk2);

      // 3. Wrap folder key for each member
      const wrapped1 = await wrapFolderKey(folderKey, pk1);
      const wrapped2 = await wrapFolderKey(folderKey, pk2);

      // 4. Each member can unwrap their copy
      const unwrapped1 = await unwrapFolderKey(wrapped1, sk1);
      const unwrapped2 = await unwrapFolderKey(wrapped2, sk2);

      expect(unwrapped1).toEqual(folderKey);
      expect(unwrapped2).toEqual(folderKey);

      // 5. Member 1 cannot unwrap member 2's copy
      await expect(unwrapFolderKey(wrapped2, sk1)).rejects.toThrow();
    });
  });
});
