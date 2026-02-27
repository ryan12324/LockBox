/**
 * QR-based device sync types for pairing new devices.
 * Uses ECDH ephemeral key exchange to transfer vault key securely.
 */

export interface QRSyncPayload {
  ephemeralPublicKey: string; // base64
  encryptedSessionKey: string; // base64
  nonce: string; // base64
  expiresAt: string; // ISO 8601
}

export interface DeviceSyncRequest {
  ephemeralPublicKey: string;
  qrPayloadId: string;
}

export interface DeviceSyncResponse {
  encryptedVaultKey: string;
  encryptedSessionToken: string;
  nonce: string;
}
