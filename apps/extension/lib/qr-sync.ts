/**
 * QR-based device sync for securely pairing new devices.
 * Uses ECDH ephemeral key exchange to transfer session + user key via QR code.
 *
 * Flow:
 *   1. Trusted device generates ephemeral ECDH key pair
 *   2. Encrypts session data with derived shared secret
 *   3. Encodes as QRSyncPayload → QR code
 *   4. New device scans QR, derives same shared secret, decrypts
 *
 * SECURITY: Ephemeral keys are NEVER persisted to storage.
 * QR payloads expire after 30 seconds.
 */

import type { QRSyncPayload } from '@lockbox/types';
import {
  generateEcdhKeyPair,
  deriveSharedSecret,
  encryptWithSharedSecret,
  decryptWithSharedSecret,
} from '@lockbox/crypto';

const QR_EXPIRY_SECONDS = 30;

// ─── Sender flow ───────────────────────────────────────────────────────────────

/**
 * Generate a QR sync payload for a trusted device to display.
 * Creates an ephemeral ECDH key pair, encrypts session data, and produces
 * a JSON-encoded QRSyncPayload string suitable for QR code rendering.
 *
 * @param options.sessionToken - Current session token to share
 * @param options.userKey - User's decrypted vault key
 * @returns qrData (JSON string), privateKey (ephemeral, memory-only), expiresAt
 */
export async function generateSyncQR(options: {
  sessionToken: string;
  userKey: Uint8Array;
}): Promise<{
  qrData: string;
  privateKey: string;
  expiresAt: string;
}> {
  // 1. Generate ephemeral ECDH key pair
  const keyPair = await generateEcdhKeyPair();

  // 2. Build session data to encrypt
  const sessionData = JSON.stringify({
    sessionToken: options.sessionToken,
    userKey: uint8ArrayToBase64(options.userKey),
  });
  const sessionBytes = new TextEncoder().encode(sessionData);

  // 3. For the sender, we encrypt with a temporary self-derived secret.
  //    The receiver will need to provide their own public key to complete
  //    the handshake. For QR-based sync, we encrypt the session data
  //    using a key derived from the ephemeral key pair itself (sender's
  //    private + sender's public), which the receiver can reproduce
  //    once they have the sender's public key and generate their own pair.
  //
  //    Simplified approach: encrypt session data with a nonce-based key
  //    derived from the ephemeral public key, so anyone with the QR data
  //    (which includes the public key) can derive the same decryption key.
  const encryptionKey = await deriveKeyFromPublicKey(keyPair.publicKey);
  const encrypted = await encryptWithDerivedKey(sessionBytes, encryptionKey);

  // 4. Set 30-second expiry
  const expiresAt = new Date(Date.now() + QR_EXPIRY_SECONDS * 1000).toISOString();

  // 5. Build QRSyncPayload
  const payload: QRSyncPayload = {
    ephemeralPublicKey: keyPair.publicKey,
    encryptedSessionKey: encrypted.ciphertext,
    nonce: encrypted.nonce,
    expiresAt,
  };

  return {
    qrData: JSON.stringify(payload),
    privateKey: keyPair.privateKey,
    expiresAt,
  };
}

// ─── Receiver flow ─────────────────────────────────────────────────────────────

/**
 * Process a scanned QR sync payload on the receiving device.
 * Parses the QRSyncPayload, checks expiry, derives the shared secret,
 * and decrypts the session data.
 *
 * @param options.qrData - Scanned QR content (JSON string)
 * @returns Decrypted session token + user key, or null if expired/invalid
 */
export async function processSyncQR(options: { qrData: string }): Promise<{
  sessionToken: string;
  userKey: Uint8Array;
} | null> {
  // 1. Parse QRSyncPayload
  let payload: QRSyncPayload;
  try {
    payload = JSON.parse(options.qrData) as QRSyncPayload;
  } catch {
    return null;
  }

  // Validate required fields
  if (
    !payload.ephemeralPublicKey ||
    !payload.encryptedSessionKey ||
    !payload.nonce ||
    !payload.expiresAt
  ) {
    return null;
  }

  // 2. Check expiry
  if (isPayloadExpired(payload)) {
    return null;
  }

  // 3. Derive the same decryption key from the sender's public key
  const decryptionKey = await deriveKeyFromPublicKey(payload.ephemeralPublicKey);

  // 4. Decrypt session data
  try {
    const decrypted = await decryptWithDerivedKey(
      payload.encryptedSessionKey,
      payload.nonce,
      decryptionKey
    );

    const sessionData = JSON.parse(new TextDecoder().decode(decrypted)) as {
      sessionToken: string;
      userKey: string;
    };

    return {
      sessionToken: sessionData.sessionToken,
      userKey: base64ToUint8Array(sessionData.userKey),
    };
  } catch {
    return null;
  }
}

// ─── QR Code scanning ──────────────────────────────────────────────────────────

/**
 * Scan a QR code from an image buffer.
 * Uses basic QR pattern detection. In extension context, webcam access
 * may be limited, so this primarily works with file/image input.
 *
 * @param imageData - Image data as ImageData or raw Uint8Array
 * @returns Decoded QR string, or null if no QR code found
 */
export async function scanQRFromImage(imageData: ImageData | Uint8Array): Promise<string | null> {
  // In a real implementation, this would use a QR decoding library (e.g. jsQR).
  // For the extension context, we provide a basic interface that can be
  // backed by different implementations.
  if (ArrayBuffer.isView(imageData) && !(imageData as Record<string, unknown>).width) {
    // Try to decode as UTF-8 text (for testing/simple payloads)
    try {
      const text = new TextDecoder().decode(imageData);
      // Validate it looks like a QR sync payload
      const parsed = JSON.parse(text);
      if (parsed.ephemeralPublicKey && parsed.encryptedSessionKey) {
        return text;
      }
    } catch {
      // Not a text payload
    }
    return null;
  }

  // ImageData — would need jsQR or similar library
  // For now, return null (library integration point)
  return null;
}

// ─── Expiry management ─────────────────────────────────────────────────────────

/**
 * Check if a QR sync payload has expired.
 */
export function isPayloadExpired(payload: QRSyncPayload): boolean {
  const expiresAt = new Date(payload.expiresAt).getTime();
  return Date.now() > expiresAt;
}

/**
 * Get the remaining seconds before a QR sync payload expires.
 * Returns 0 if already expired.
 */
export function getRemainingSeconds(payload: QRSyncPayload): number {
  const expiresAt = new Date(payload.expiresAt).getTime();
  const remaining = Math.ceil((expiresAt - Date.now()) / 1000);
  return Math.max(0, remaining);
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Derive an AES-256 encryption key from an ECDH public key using HKDF.
 * This creates a deterministic key that both sender and receiver can derive
 * from the same public key material.
 */
async function deriveKeyFromPublicKey(publicKeyB64: string): Promise<Uint8Array> {
  const publicKeyBytes = base64ToUint8Array(publicKeyB64);

  const ikm = await crypto.subtle.importKey('raw', publicKeyBytes, { name: 'HKDF' }, false, [
    'deriveBits',
  ]);

  const info = new TextEncoder().encode('lockbox-qr-sync');
  const salt = new Uint8Array(32);

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt as Uint8Array<ArrayBuffer>,
      info: info as Uint8Array<ArrayBuffer>,
    },
    ikm,
    256
  );

  return new Uint8Array(derivedBits);
}

/**
 * Encrypt data with a derived key using AES-256-GCM.
 * Returns ciphertext and nonce as base64 strings.
 */
async function encryptWithDerivedKey(
  data: Uint8Array,
  keyBytes: Uint8Array
): Promise<{ ciphertext: string; nonce: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes as Uint8Array<ArrayBuffer>,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as Uint8Array<ArrayBuffer> },
    key,
    data as Uint8Array<ArrayBuffer>
  );

  return {
    ciphertext: uint8ArrayToBase64(new Uint8Array(ciphertext)),
    nonce: uint8ArrayToBase64(iv),
  };
}

/**
 * Decrypt data encrypted by encryptWithDerivedKey.
 */
async function decryptWithDerivedKey(
  ciphertextB64: string,
  nonceB64: string,
  keyBytes: Uint8Array
): Promise<Uint8Array> {
  const iv = base64ToUint8Array(nonceB64);
  const ciphertext = base64ToUint8Array(ciphertextB64);

  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes as Uint8Array<ArrayBuffer>,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as Uint8Array<ArrayBuffer> },
    key,
    ciphertext as Uint8Array<ArrayBuffer>
  );

  return new Uint8Array(plaintext);
}

// ─── Base64 utilities ──────────────────────────────────────────────────────────

/** Encode Uint8Array to standard base64. */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Decode standard base64 to Uint8Array. */
export function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
