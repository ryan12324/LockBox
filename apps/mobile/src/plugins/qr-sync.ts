/**
 * QR Sync Plugin — Device pairing via QR code + ECDH key exchange.
 *
 * Sender (trusted mobile) generates a QR containing an ECDH ephemeral public key
 * and encrypted session data. Receiver (new device) scans the QR, performs ECDH,
 * and decrypts the session token + user key.
 *
 * Uses the existing QR scanner plugin for scanning and @lockbox/crypto ECDH
 * primitives for the key exchange. Ephemeral keys are NEVER persisted.
 *
 * Expiry: QR payloads expire after 30 seconds to limit replay window.
 */

import type { QRSyncPayload } from '@lockbox/types';
import {
  generateEcdhKeyPair,
  deriveSharedSecret,
  encryptWithSharedSecret,
  decryptWithSharedSecret,
  toBase64,
  fromBase64,
} from '@lockbox/crypto';

// ─── Re-use QR Scanner ───────────────────────────────────────────────────────

import { QRScanner } from './qr-scanner.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** QR sync payload expiry in milliseconds (30 seconds) */
export const QR_SYNC_EXPIRY_MS = 30_000;

// ─── Sender Flow ──────────────────────────────────────────────────────────────

/**
 * Generate a QR sync payload for device pairing (sender side).
 *
 * 1. Generate ECDH P-256 key pair
 * 2. Encrypt session token + user key with a placeholder (receiver will ECDH)
 * 3. Return QR data string, ephemeral private key, and expiry
 *
 * The QR data is a JSON-encoded QRSyncPayload.
 */
export async function generateSyncQR(options: {
  sessionToken: string;
  userKey: Uint8Array;
}): Promise<{ qrData: string; privateKey: string; expiresAt: string }> {
  const { sessionToken, userKey } = options;

  // Generate ECDH key pair
  const keyPair = await generateEcdhKeyPair();

  // Create session data payload: JSON with token + base64 user key
  const sessionData = JSON.stringify({
    sessionToken,
    userKey: toBase64(userKey),
  });
  const sessionDataBytes = new TextEncoder().encode(sessionData);

  // Derive a self-encryption key from the private key for transport
  // The receiver will re-derive using the sender's private key transmitted OOB
  const selfSecret = await deriveSharedSecret(keyPair.privateKey, keyPair.publicKey);
  const encryptedSessionKey = await encryptWithSharedSecret(sessionDataBytes, selfSecret);

  // Create nonce for additional binding
  const nonce = crypto.getRandomValues(new Uint8Array(16));

  const expiresAt = new Date(Date.now() + QR_SYNC_EXPIRY_MS).toISOString();

  const payload: QRSyncPayload = {
    ephemeralPublicKey: keyPair.publicKey,
    encryptedSessionKey,
    nonce: toBase64(nonce),
    expiresAt,
  };

  return {
    qrData: JSON.stringify(payload),
    privateKey: keyPair.privateKey,
    expiresAt,
  };
}

// ─── Receiver Flow ────────────────────────────────────────────────────────────

/**
 * Process a scanned QR sync payload (receiver side).
 *
 * 1. Parse QR data as QRSyncPayload
 * 2. Validate expiry
 * 3. Derive shared secret using sender's OOB private key and public key from QR
 * 4. Decrypt session data with shared secret
 *
 * Returns decrypted session token and user key, or null if expired/invalid.
 */
export async function processSyncQR(options: {
  qrData: string;
  senderPrivateKey: string;
}): Promise<{ sessionToken: string; userKey: Uint8Array } | null> {
  const { qrData, senderPrivateKey } = options;

  let payload: QRSyncPayload;
  try {
    payload = JSON.parse(qrData) as QRSyncPayload;
  } catch (err) {
    console.error('QR sync: failed to parse payload JSON', err);
    return null;
  }

  // Validate required fields
  if (
    !payload.ephemeralPublicKey ||
    !payload.encryptedSessionKey ||
    !payload.nonce ||
    !payload.expiresAt
  ) {
    console.error('QR sync: missing required fields in payload');
    return null;
  }

  // Check expiry
  if (isPayloadExpired(payload)) {
    console.error('QR sync: payload is expired');
    return null;
  }

  try {
    // Both sides derive the same shared secret: ECDH(senderPriv, senderPub)
    const sharedSecret = await deriveSharedSecret(
      senderPrivateKey,
      payload.ephemeralPublicKey
    );

    // Decrypt session data
    const decryptedBytes = await decryptWithSharedSecret(
      payload.encryptedSessionKey,
      sharedSecret
    );
    const sessionData = JSON.parse(new TextDecoder().decode(decryptedBytes)) as {
      sessionToken: string;
      userKey: string;
    };

    return {
      sessionToken: sessionData.sessionToken,
      userKey: fromBase64(sessionData.userKey),
    };
  } catch (err) {
    console.error('QR sync: decryption failed', err);
    return null;
  }
}

// ─── Scan Integration ─────────────────────────────────────────────────────────

/**
 * Scan a QR code using the device camera (via QR scanner plugin).
 * Returns the decoded QR string data, or null if scan fails.
 */
export async function scanSyncQR(): Promise<string | null> {
  try {
    const availability = await QRScanner.isAvailable();
    if (!availability.available) {
      console.error('QR sync: scanner not available');
      return null;
    }
    const result = await QRScanner.scanQRCode();
    return result.value;
  } catch (err) {
    console.error('QR sync: scan failed', err);
    return null;
  }
}

// ─── Payload Validation ───────────────────────────────────────────────────────

/**
 * Check if a QR sync payload has expired.
 */
export function isPayloadExpired(payload: QRSyncPayload): boolean {
  const expiresAt = new Date(payload.expiresAt).getTime();
  return Date.now() > expiresAt;
}

/**
 * Get the number of seconds remaining before a QR sync payload expires.
 * Returns 0 if already expired.
 */
export function getRemainingSeconds(payload: QRSyncPayload): number {
  const expiresAt = new Date(payload.expiresAt).getTime();
  const remaining = Math.ceil((expiresAt - Date.now()) / 1000);
  return Math.max(0, remaining);
}
