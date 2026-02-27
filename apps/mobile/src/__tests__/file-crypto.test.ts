import { describe, it, expect } from 'vitest';
import { encryptFile, decryptFile } from '../plugins/file-crypto';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stringToArrayBuffer(str: string): ArrayBuffer {
  const encoder = new TextEncoder();
  return encoder.encode(str).buffer;
}

function arrayBufferToString(buffer: ArrayBuffer): string {
  const decoder = new TextDecoder();
  return decoder.decode(buffer);
}

async function generateTestKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

function generateRawKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

// ─── encryptFile / decryptFile roundtrip ──────────────────────────────────────

describe('file crypto roundtrip', () => {
  it('encrypts and decrypts with CryptoKey', async () => {
    const key = await generateTestKey();
    const plaintext = 'Hello, encrypted world!';
    const data = stringToArrayBuffer(plaintext);
    const aad = 'item-123:2025-01-01T00:00:00.000Z';

    const encrypted = await encryptFile(data, key, aad);
    const decrypted = await decryptFile(encrypted, key, aad);

    expect(arrayBufferToString(decrypted)).toBe(plaintext);
  });

  it('encrypts and decrypts with raw Uint8Array key', async () => {
    const key = generateRawKey();
    const plaintext = 'Raw key encryption test';
    const data = stringToArrayBuffer(plaintext);
    const aad = 'item-456:2025-02-01T00:00:00.000Z';

    const encrypted = await encryptFile(data, key, aad);
    const decrypted = await decryptFile(encrypted, key, aad);

    expect(arrayBufferToString(decrypted)).toBe(plaintext);
  });

  it('produces base64(iv).base64(ciphertext) format', async () => {
    const key = await generateTestKey();
    const data = stringToArrayBuffer('test');
    const aad = 'item:rev';

    const encrypted = await encryptFile(data, key, aad);

    expect(encrypted).toContain('.');
    const parts = encrypted.split('.');
    expect(parts).toHaveLength(2);
    expect(parts[0].length).toBeGreaterThan(0);
    expect(parts[1].length).toBeGreaterThan(0);
  });

  it('produces different ciphertexts for same plaintext (random IV)', async () => {
    const key = await generateTestKey();
    const data = stringToArrayBuffer('same content');
    const aad = 'item:rev';

    const encrypted1 = await encryptFile(data, key, aad);
    const encrypted2 = await encryptFile(data, key, aad);

    expect(encrypted1).not.toBe(encrypted2);
  });

  it('handles empty data', async () => {
    const key = await generateTestKey();
    const data = new ArrayBuffer(0);
    const aad = 'item:rev';

    const encrypted = await encryptFile(data, key, aad);
    const decrypted = await decryptFile(encrypted, key, aad);

    expect(decrypted.byteLength).toBe(0);
  });

  it('handles large data', async () => {
    const key = await generateTestKey();
    const largeData = new Uint8Array(100_000);
    for (let i = 0; i < largeData.length; i += 65536) {
      const chunk = largeData.subarray(i, Math.min(i + 65536, largeData.length));
      crypto.getRandomValues(chunk);
    }
    const aad = 'item:rev';

    const encrypted = await encryptFile(largeData.buffer, key, aad);
    const decrypted = await decryptFile(encrypted, key, aad);

    const decryptedBytes = new Uint8Array(decrypted);
    expect(decryptedBytes.length).toBe(largeData.length);
    expect(decryptedBytes.every((b, i) => b === largeData[i])).toBe(true);
  });
});

// ─── Decryption failure cases ─────────────────────────────────────────────────

describe('decryptFile error handling', () => {
  it('throws for missing dot separator', async () => {
    const key = await generateTestKey();
    await expect(decryptFile('nodot', key, 'aad')).rejects.toThrow('missing "."');
  });

  it('throws for wrong key', async () => {
    const encryptKey = await generateTestKey();
    const decryptKey = await generateTestKey();
    const data = stringToArrayBuffer('secret');
    const aad = 'item:rev';

    const encrypted = await encryptFile(data, encryptKey, aad);
    await expect(decryptFile(encrypted, decryptKey, aad)).rejects.toThrow();
  });

  it('throws for wrong AAD', async () => {
    const key = await generateTestKey();
    const data = stringToArrayBuffer('secret');

    const encrypted = await encryptFile(data, key, 'correct-aad');
    await expect(decryptFile(encrypted, key, 'wrong-aad')).rejects.toThrow();
  });

  it('throws for tampered ciphertext', async () => {
    const key = await generateTestKey();
    const data = stringToArrayBuffer('secret');
    const aad = 'item:rev';

    const encrypted = await encryptFile(data, key, aad);
    const parts = encrypted.split('.');
    // Tamper with ciphertext
    const tampered = parts[0] + '.' + 'AAAA' + parts[1].slice(4);
    await expect(decryptFile(tampered, key, aad)).rejects.toThrow();
  });
});
