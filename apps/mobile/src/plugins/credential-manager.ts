/**
 * Credential Manager Plugin — TypeScript bridge for Android Credential Manager API.
 *
 * Provides passkey (WebAuthn/FIDO2) creation and authentication via
 * Android 14+ Credential Manager. The actual native implementation
 * is in Kotlin; this module defines the TS interface and utility helpers.
 *
 * Falls back gracefully on non-Android environments.
 */

import { registerPlugin } from '@capacitor/core';

/** Options for creating a new passkey */
export interface PasskeyCreationOptions {
  rpId: string;
  rpName: string;
  userName: string;
  userDisplayName: string;
  userId: string; // base64url
  challenge: string; // base64url
  algorithms?: number[]; // default [-7] for ES256
  timeout?: number;
  attestation?: 'none' | 'indirect' | 'direct';
}

/** Result from passkey creation */
export interface PasskeyCreationResult {
  credentialId: string; // base64url
  publicKey: string; // base64url (COSE key)
  attestationObject: string; // base64url
  clientDataJSON: string; // base64url
}

/** Options for passkey authentication */
export interface PasskeyAuthenticationOptions {
  rpId: string;
  challenge: string; // base64url
  allowCredentials?: string[]; // credential IDs
  timeout?: number;
  userVerification?: 'required' | 'preferred' | 'discouraged';
}

/** Result from passkey authentication */
export interface PasskeyAuthenticationResult {
  credentialId: string;
  authenticatorData: string; // base64url
  signature: string; // base64url
  clientDataJSON: string; // base64url
  userHandle?: string; // base64url
}

/** Stored passkey metadata */
export interface StoredPasskeyInfo {
  credentialId: string;
  rpId: string;
  userName: string;
}

/** Native plugin interface for Credential Manager */
export interface CredentialManagerPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  createPasskey(options: PasskeyCreationOptions): Promise<PasskeyCreationResult>;
  authenticate(options: PasskeyAuthenticationOptions): Promise<PasskeyAuthenticationResult>;
  getStoredPasskeys(options?: { rpId?: string }): Promise<{ passkeys: StoredPasskeyInfo[] }>;
  deletePasskey(options: { credentialId: string }): Promise<void>;
}

const CredentialManager = registerPlugin<CredentialManagerPlugin>('CredentialManager');

/**
 * Check if Android Credential Manager is available on this device.
 * Returns false on non-Android environments.
 */
export async function isCredentialManagerAvailable(): Promise<boolean> {
  try {
    const result = await CredentialManager.isAvailable();
    return result.available;
  } catch {
    return false;
  }
}

/**
 * Create a new passkey using Android Credential Manager.
 * Throws if Credential Manager is unavailable.
 */
export async function createPasskey(
  options: PasskeyCreationOptions
): Promise<PasskeyCreationResult> {
  const available = await isCredentialManagerAvailable();
  if (!available) {
    throw new Error('Credential Manager is not available on this device');
  }
  return CredentialManager.createPasskey({
    ...options,
    algorithms: options.algorithms ?? [-7],
    timeout: options.timeout ?? 60000,
    attestation: options.attestation ?? 'none',
  });
}

/**
 * Authenticate with a passkey via Android Credential Manager.
 * Throws if Credential Manager is unavailable.
 */
export async function authenticateWithPasskey(
  options: PasskeyAuthenticationOptions
): Promise<PasskeyAuthenticationResult> {
  const available = await isCredentialManagerAvailable();
  if (!available) {
    throw new Error('Credential Manager is not available on this device');
  }
  return CredentialManager.authenticate({
    ...options,
    timeout: options.timeout ?? 60000,
    userVerification: options.userVerification ?? 'preferred',
  });
}

/**
 * Get stored passkeys, optionally filtered by relying party ID.
 */
export async function getStoredPasskeys(rpId?: string): Promise<StoredPasskeyInfo[]> {
  try {
    const result = await CredentialManager.getStoredPasskeys(rpId ? { rpId } : undefined);
    return result.passkeys;
  } catch {
    return [];
  }
}

/**
 * Delete a stored passkey by credential ID.
 */
export async function deletePasskey(credentialId: string): Promise<void> {
  return CredentialManager.deletePasskey({ credentialId });
}

// ─── Utility functions ─────────────────────────────────────────────────────────

/**
 * Decode a base64url string to a Uint8Array.
 */
export function base64urlToUint8Array(base64url: string): Uint8Array {
  // Replace base64url chars with base64 equivalents
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  // Add padding if needed
  const pad = base64.length % 4;
  if (pad === 2) base64 += '==';
  else if (pad === 3) base64 += '=';

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encode a Uint8Array to a base64url string (no padding).
 */
export function uint8ArrayToBase64url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Check if the device is running Android 14 (API 34) or higher.
 * Uses the userAgent string as a heuristic; actual detection
 * should be done via native plugin in production.
 */
export function isAndroid14OrHigher(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const match = ua.match(/Android (\d+)/);
  if (!match) return false;
  return parseInt(match[1], 10) >= 14;
}

/**
 * Format a credential ID for display — truncates long IDs.
 * Shows first 8 and last 4 characters with ellipsis.
 */
export function formatCredentialId(credentialId: string): string {
  if (credentialId.length <= 16) return credentialId;
  return `${credentialId.slice(0, 8)}…${credentialId.slice(-4)}`;
}

/**
 * Get a human-readable display name for a passkey.
 */
export function getPasskeyDisplayName(rpName: string, userName: string): string {
  return `${rpName} (${userName})`;
}

export { CredentialManager };
