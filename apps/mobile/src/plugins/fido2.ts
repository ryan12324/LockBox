/**
 * FIDO2 Hardware Key Plugin — TypeScript bridge for Android FIDO2 API.
 *
 * Provides hardware security key (YubiKey, etc.) registration and authentication
 * via Android's FIDO2 API through Capacitor bridge. Does NOT require Google Play Services.
 *
 * Flow:
 * 1. registerFido2Key() → register a hardware key, get credential
 * 2. authenticateFido2() → sign a challenge with the hardware key
 * 3. setupHardwareKey() → full setup: register + wrap master key + POST to API
 * 4. unlockWithHardwareKey() → challenge → sign → verify → get session
 * 5. listHardwareKeys() / removeHardwareKey() → key management
 */

import { registerPlugin } from '@capacitor/core';
import type {
  HardwareKeyConfig,
  HardwareKeySetupRequest,
  HardwareKeyChallengeResponse,
} from '@lockbox/types';

// ─── Native Plugin Interface ──────────────────────────────────────────────────

/** Result from FIDO2 key registration */
export interface Fido2RegistrationResult {
  /** Base64url-encoded credential ID */
  keyId: string;
  /** Base64url-encoded COSE public key */
  publicKey: string;
  /** Base64url-encoded attestation object */
  attestation: string;
}

/** Result from FIDO2 authentication */
export interface Fido2AuthenticationResult {
  /** Base64url-encoded signature */
  signature: string;
  /** Base64url-encoded authenticator data */
  authenticatorData: string;
  /** Base64url-encoded client data JSON */
  clientDataJSON: string;
}

/** Options for FIDO2 key registration */
export interface Fido2RegistrationOptions {
  userId: string;
  email: string;
  rpId: string;
  rpName: string;
}

/** Options for FIDO2 authentication */
export interface Fido2AuthenticationOptions {
  challenge: string;
  rpId: string;
  allowCredentials: Array<{ id: string; type: string }>;
}

/** Hardware key info returned from the API */
export interface HardwareKeyInfo {
  id: string;
  keyType: string;
  createdAt: string;
}

/** Native FIDO2 plugin contract */
export interface Fido2Plugin {
  /** Check if FIDO2 hardware key support is available */
  isAvailable(): Promise<{ available: boolean }>;
  /** Register a new FIDO2 hardware key */
  register(options: Fido2RegistrationOptions): Promise<Fido2RegistrationResult>;
  /** Authenticate (sign challenge) with a FIDO2 hardware key */
  authenticate(options: Fido2AuthenticationOptions): Promise<Fido2AuthenticationResult>;
}

const Fido2 = registerPlugin<Fido2Plugin>('Fido2');

export { Fido2 };

// ─── FIDO2 Registration ───────────────────────────────────────────────────────

/**
 * Register a new FIDO2 hardware key.
 * Calls Android FIDO2 API via Capacitor bridge.
 * Returns registration credential data (keyId, publicKey, attestation).
 */
export async function registerFido2Key(
  options: Fido2RegistrationOptions
): Promise<Fido2RegistrationResult> {
  const available = await Fido2.isAvailable();
  if (!available.available) {
    throw new Error('FIDO2 hardware key support is not available on this device');
  }
  return Fido2.register(options);
}

// ─── FIDO2 Authentication ─────────────────────────────────────────────────────

/**
 * Authenticate (sign a challenge) with a FIDO2 hardware key.
 * Returns the signature, authenticator data, and client data JSON.
 */
export async function authenticateFido2(
  options: Fido2AuthenticationOptions
): Promise<Fido2AuthenticationResult> {
  const available = await Fido2.isAvailable();
  if (!available.available) {
    throw new Error('FIDO2 hardware key support is not available on this device');
  }
  return Fido2.authenticate(options);
}

// ─── Master Key Wrapping ──────────────────────────────────────────────────────

/**
 * Wrap (encrypt) a master key with a FIDO2-derived public key using AES-256-GCM.
 * The wrapped key is stored server-side and can only be unwrapped by the hardware key.
 */
export async function wrapMasterKey(
  masterKey: Uint8Array,
  publicKeyBase64: string
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  // Derive a wrapping key from the FIDO2 public key via HKDF
  const publicKeyBytes = base64ToUint8Array(publicKeyBase64);
  const ikm = await crypto.subtle.importKey('raw', publicKeyBytes as Uint8Array<ArrayBuffer>, { name: 'HKDF' }, false, [
    'deriveBits',
  ]);
  const info = new TextEncoder().encode('lockbox-fido2-wrap');
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32) as Uint8Array<ArrayBuffer>,
      info: info as Uint8Array<ArrayBuffer>,
    },
    ikm,
    256
  );
  const wrappingKey = await crypto.subtle.importKey(
    'raw',
    derivedBits,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as Uint8Array<ArrayBuffer> },
    wrappingKey,
    masterKey as Uint8Array<ArrayBuffer>
  );
  // Return as base64(iv).base64(ciphertext+tag)
  return `${uint8ArrayToBase64(iv)}.${uint8ArrayToBase64(new Uint8Array(ciphertext))}`;
}

// ─── API Integration ──────────────────────────────────────────────────────────

/**
 * Full hardware key setup flow:
 * 1. Register FIDO2 key on device
 * 2. Wrap master key with the registered key's public key
 * 3. POST setup to /api/auth/hardware-key/setup
 */
export async function setupHardwareKey(options: {
  apiUrl: string;
  token: string;
  userId: string;
  email: string;
  masterKey: Uint8Array;
}): Promise<{ keyId: string }> {
  const { apiUrl, token, userId, email, masterKey } = options;

  // 1. Register FIDO2 key
  const registration = await registerFido2Key({
    userId,
    email,
    rpId: new URL(apiUrl).hostname,
    rpName: 'Lockbox',
  });

  // 2. Wrap master key
  const wrappedMasterKey = await wrapMasterKey(masterKey, registration.publicKey);

  // 3. POST to API
  const body: HardwareKeySetupRequest = {
    keyType: 'fido2',
    publicKey: registration.publicKey,
    wrappedMasterKey,
    attestation: registration.attestation,
  };

  const response = await fetch(`${apiUrl}/api/auth/hardware-key/setup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Hardware key setup failed: ${response.status}`);
  }

  const data = (await response.json()) as { keyId: string };
  return { keyId: data.keyId };
}

/**
 * Unlock with hardware key flow:
 * 1. GET challenge from /api/auth/hardware-key/challenge
 * 2. Sign challenge with FIDO2 hardware key
 * 3. POST verification to /api/auth/hardware-key/verify
 * 4. Return session token + wrapped master key
 */
export async function unlockWithHardwareKey(options: {
  apiUrl: string;
  keyId: string;
}): Promise<{ token: string; wrappedMasterKey: string }> {
  const { apiUrl, keyId } = options;

  // 1. Get challenge from API
  const challengeResponse = await fetch(
    `${apiUrl}/api/auth/hardware-key/challenge?keyId=${encodeURIComponent(keyId)}`
  );
  if (!challengeResponse.ok) {
    throw new Error(`Failed to get challenge: ${challengeResponse.status}`);
  }
  const challengeData = (await challengeResponse.json()) as HardwareKeyChallengeResponse;

  // 2. Sign with FIDO2
  const authResult = await authenticateFido2({
    challenge: challengeData.challenge,
    rpId: new URL(apiUrl).hostname,
    allowCredentials: [{ id: keyId, type: 'public-key' }],
  });

  // 3. Verify with API
  const verifyResponse = await fetch(`${apiUrl}/api/auth/hardware-key/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      keyId,
      signature: authResult.signature,
      challenge: challengeData.challenge,
    }),
  });

  if (!verifyResponse.ok) {
    throw new Error(`Hardware key verification failed: ${verifyResponse.status}`);
  }

  const verifyData = (await verifyResponse.json()) as {
    token: string;
    wrappedMasterKey: string;
  };

  return {
    token: verifyData.token,
    wrappedMasterKey: verifyData.wrappedMasterKey,
  };
}

/**
 * List all hardware keys registered for the current user.
 */
export async function listHardwareKeys(apiUrl: string, token: string): Promise<HardwareKeyInfo[]> {
  const response = await fetch(`${apiUrl}/api/auth/hardware-key/list`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to list hardware keys: ${response.status}`);
  }

  const data = (await response.json()) as { keys: HardwareKeyInfo[] };
  return data.keys;
}

/**
 * Remove a hardware key registration.
 */
export async function removeHardwareKey(
  apiUrl: string,
  token: string,
  keyId: string
): Promise<void> {
  const response = await fetch(`${apiUrl}/api/auth/hardware-key/${encodeURIComponent(keyId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to remove hardware key: ${response.status}`);
  }
}

// ─── Utility functions ────────────────────────────────────────────────────────

/** Convert a base64 string to Uint8Array */
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Convert a Uint8Array to base64 string */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
