import { describe, expect, it } from 'vitest';
import { decryptDocument, encryptDocument } from '../lib/document-crypto.js';

describe('document encryption envelope', () => {
  const key = new Uint8Array(Array.from({ length: 32 }, (_, index) => index + 1));
  const plaintext = new TextEncoder().encode('confidential document contents').buffer;

  it('round-trips binary document content', async () => {
    const encrypted = await encryptDocument(plaintext, key, 'document-1');
    expect(encrypted.size).toBe(plaintext.byteLength + 33);

    const decrypted = await decryptDocument(
      await encrypted.arrayBuffer(),
      key,
      'document-1'
    );
    expect(new Uint8Array(decrypted)).toEqual(new Uint8Array(plaintext));
  });

  it('binds ciphertext to the owning item ID', async () => {
    const encrypted = await encryptDocument(plaintext, key, 'document-1');
    await expect(
      decryptDocument(await encrypted.arrayBuffer(), key, 'document-2')
    ).rejects.toThrow();
  });

  it('rejects modified ciphertext', async () => {
    const encrypted = new Uint8Array(await (await encryptDocument(plaintext, key, 'document-1')).arrayBuffer());
    encrypted[encrypted.length - 1] ^= 1;
    await expect(decryptDocument(encrypted.buffer, key, 'document-1')).rejects.toThrow();
  });

  it('rejects unsupported envelopes before decryption', async () => {
    await expect(decryptDocument(new Uint8Array(64).buffer, key, 'document-1')).rejects.toThrow(
      'Unsupported or corrupt document'
    );
  });
});
