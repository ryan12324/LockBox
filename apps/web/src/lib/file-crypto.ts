import { toBase64, fromBase64, toUtf8 } from '@lockbox/crypto';

const IV_LENGTH = 12; // 96 bits

/**
 * Encrypt a file buffer with AES-256-GCM.
 * Returns base64(iv).base64(ciphertext+tag) format matching existing encryptedData format.
 */
export async function encryptFile(
  data: ArrayBuffer,
  key: Uint8Array | CryptoKey,
  aad: string
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  let cryptoKey: CryptoKey;

  if (key instanceof CryptoKey) {
    cryptoKey = key;
  } else {
    cryptoKey = await crypto.subtle.importKey(
      'raw',
      key.slice(0, 32) as Uint8Array<ArrayBuffer>,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );
  }

  const aadBytes = toUtf8(aad);

  const ciphertextBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as Uint8Array<ArrayBuffer>,
      additionalData: aadBytes as Uint8Array<ArrayBuffer>,
    },
    cryptoKey,
    data
  );

  const ciphertext = new Uint8Array(ciphertextBuffer);
  return `${toBase64(iv)}.${toBase64(ciphertext)}`;
}

/**
 * Decrypt a file buffer produced by `encryptFile`.
 */
export async function decryptFile(
  encryptedData: string,
  key: Uint8Array | CryptoKey,
  aad: string
): Promise<ArrayBuffer> {
  const dotIndex = encryptedData.indexOf('.');
  if (dotIndex === -1) throw new Error('Invalid encrypted file format: missing "."');

  const iv = fromBase64(encryptedData.slice(0, dotIndex));
  const ciphertext = fromBase64(encryptedData.slice(dotIndex + 1));
  const aadBytes = toUtf8(aad);

  let cryptoKey: CryptoKey;

  if (key instanceof CryptoKey) {
    cryptoKey = key;
  } else {
    cryptoKey = await crypto.subtle.importKey(
      'raw',
      key.slice(0, 32) as Uint8Array<ArrayBuffer>,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );
  }

  const plaintextBuffer = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv as Uint8Array<ArrayBuffer>,
      additionalData: aadBytes as Uint8Array<ArrayBuffer>,
    },
    cryptoKey,
    ciphertext as Uint8Array<ArrayBuffer>
  );

  return plaintextBuffer;
}
