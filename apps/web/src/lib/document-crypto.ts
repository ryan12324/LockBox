const MAGIC = new Uint8Array([0x4c, 0x42, 0x58, 0x44]); // LBXD
const VERSION = 1;
const IV_LENGTH = 12;
const HEADER_LENGTH = MAGIC.length + 1 + IV_LENGTH;

function aad(itemId: string): ArrayBuffer {
  const bytes = new TextEncoder().encode(`${itemId}:document:v1`);
  return bytes.buffer as ArrayBuffer;
}

async function importAesKey(userKey: Uint8Array): Promise<CryptoKey> {
  if (userKey.byteLength < 32) throw new Error('Invalid vault key');
  const keyBytes = new Uint8Array(32);
  keyBytes.set(userKey.subarray(0, 32));
  return crypto.subtle.importKey('raw', keyBytes.buffer, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

/** Encrypt a document into a versioned binary envelope. */
export async function encryptDocument(
  plaintext: ArrayBuffer,
  userKey: Uint8Array,
  itemId: string
): Promise<Blob> {
  const key = await importAesKey(userKey);
  const ivBytes = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: ivBytes.buffer, additionalData: aad(itemId) },
      key,
      plaintext
    )
  );
  const envelope = new Uint8Array(HEADER_LENGTH + encrypted.byteLength);
  envelope.set(MAGIC, 0);
  envelope[MAGIC.length] = VERSION;
  envelope.set(ivBytes, MAGIC.length + 1);
  envelope.set(encrypted, HEADER_LENGTH);
  return new Blob([envelope], { type: 'application/octet-stream' });
}

/** Decrypt and authenticate a document envelope for its owning vault item. */
export async function decryptDocument(
  envelope: ArrayBuffer,
  userKey: Uint8Array,
  itemId: string
): Promise<ArrayBuffer> {
  const bytes = new Uint8Array(envelope);
  if (
    bytes.byteLength < HEADER_LENGTH + 16 ||
    !MAGIC.every((value, index) => bytes[index] === value) ||
    bytes[MAGIC.length] !== VERSION
  ) {
    throw new Error('Unsupported or corrupt document');
  }

  const key = await importAesKey(userKey);
  const iv = new Uint8Array(IV_LENGTH);
  iv.set(bytes.subarray(MAGIC.length + 1, HEADER_LENGTH));
  const ciphertext = bytes.slice(HEADER_LENGTH).buffer as ArrayBuffer;
  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer, additionalData: aad(itemId) },
    key,
    ciphertext
  );
}
