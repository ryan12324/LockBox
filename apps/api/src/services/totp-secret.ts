import { base32Decode } from '@lockbox/totp';

const ENVELOPE_VERSION = 'v1';
const IV_LENGTH = 12;
const TOTP_SECRET_LENGTH = 20;
const AAD_CONTEXT = 'lockbox:account-totp:v1';

export type TotpSecretBindings = {
  TOTP_ENCRYPTION_KEY?: string;
  TOTP_ENCRYPTION_KEY_PREVIOUS?: string;
};

export type DecryptedTotpSecret = {
  secret: Uint8Array;
  migratedEnvelope?: string;
};

/** Operational failure that must not be presented as an invalid TOTP code. */
export class TotpSecretUnavailableError extends Error {
  constructor() {
    super('Account TOTP secret is unavailable');
    this.name = 'TotpSecretUnavailableError';
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new TotpSecretUnavailableError();
  }

  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new TotpSecretUnavailableError();
  }
}

function decodeEncryptionKey(value: string | undefined): Uint8Array<ArrayBuffer> {
  if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value)) {
    throw new TotpSecretUnavailableError();
  }

  const bytes = base64ToBytes(value);
  if (bytes.byteLength !== 32 || bytesToBase64(bytes) !== value) {
    throw new TotpSecretUnavailableError();
  }
  return bytes;
}

async function importEncryptionKey(value: string | undefined): Promise<CryptoKey> {
  const keyBytes = decodeEncryptionKey(value);
  return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

function additionalData(userId: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(`${AAD_CONTEXT}\0${userId}`);
}

function ownedBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

function validateSecret(secret: Uint8Array): void {
  if (secret.byteLength !== TOTP_SECRET_LENGTH) {
    throw new TotpSecretUnavailableError();
  }
}

export async function encryptTotpSecret(
  secret: Uint8Array,
  userId: string,
  encryptionKey: string | undefined,
): Promise<string> {
  validateSecret(secret);

  try {
    const key = await importEncryptionKey(encryptionKey);
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: additionalData(userId), tagLength: 128 },
      key,
      ownedBytes(secret),
    );
    return `${ENVELOPE_VERSION}.${bytesToBase64(iv)}.${bytesToBase64(
      new Uint8Array(ciphertext),
    )}`;
  } catch (error) {
    if (error instanceof TotpSecretUnavailableError) throw error;
    throw new TotpSecretUnavailableError();
  }
}

async function decryptEnvelope(
  envelope: string,
  userId: string,
  encryptionKey: string | undefined,
): Promise<Uint8Array> {
  const parts = envelope.split('.');
  if (parts.length !== 3 || parts[0] !== ENVELOPE_VERSION) {
    throw new TotpSecretUnavailableError();
  }

  const iv = base64ToBytes(parts[1]);
  const ciphertext = base64ToBytes(parts[2]);
  if (iv.byteLength !== IV_LENGTH || ciphertext.byteLength !== TOTP_SECRET_LENGTH + 16) {
    throw new TotpSecretUnavailableError();
  }

  try {
    const key = await importEncryptionKey(encryptionKey);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: additionalData(userId), tagLength: 128 },
      key,
      ciphertext,
    );
    const secret = new Uint8Array(plaintext);
    validateSecret(secret);
    return secret;
  } catch {
    throw new TotpSecretUnavailableError();
  }
}

function decodeLegacySecret(stored: string): Uint8Array {
  if (!/^[A-Z2-7]+={0,6}$/.test(stored)) {
    throw new TotpSecretUnavailableError();
  }

  try {
    const secret = base32Decode(stored);
    validateSecret(secret);
    return secret;
  } catch {
    throw new TotpSecretUnavailableError();
  }
}

/**
 * Decrypt a versioned envelope. Existing plaintext Base32 rows are accepted
 * only as a migration source and are immediately returned with an encrypted
 * replacement. Envelopes decrypted by the previous key are rewrapped too.
 */
export async function decryptStoredTotpSecret(
  stored: string,
  userId: string,
  bindings: TotpSecretBindings,
): Promise<DecryptedTotpSecret> {
  // Validate the current key first: legacy and previous-key reads must always
  // be capable of completing their migration to the current key.
  decodeEncryptionKey(bindings.TOTP_ENCRYPTION_KEY);

  if (!stored.startsWith(`${ENVELOPE_VERSION}.`)) {
    if (stored.startsWith('v')) throw new TotpSecretUnavailableError();
    const secret = decodeLegacySecret(stored);
    return {
      secret,
      migratedEnvelope: await encryptTotpSecret(
        secret,
        userId,
        bindings.TOTP_ENCRYPTION_KEY,
      ),
    };
  }

  try {
    return {
      secret: await decryptEnvelope(stored, userId, bindings.TOTP_ENCRYPTION_KEY),
    };
  } catch (error) {
    if (!bindings.TOTP_ENCRYPTION_KEY_PREVIOUS) throw error;
  }

  const secret = await decryptEnvelope(stored, userId, bindings.TOTP_ENCRYPTION_KEY_PREVIOUS);
  return {
    secret,
    migratedEnvelope: await encryptTotpSecret(secret, userId, bindings.TOTP_ENCRYPTION_KEY),
  };
}
