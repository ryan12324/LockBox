/**
 * FIDO2 Hardware Key Plugin — TypeScript bridge for Android FIDO2 API.
 *
 * Provides hardware security key (YubiKey, etc.) registration and authentication
 * via Android's FIDO2 API through Capacitor bridge. Does NOT require Google Play Services.
 *
 * Flow:
 * 1. registerFido2Key() → register a hardware key, get credential
 * 2. authenticateFido2() → sign a challenge with the hardware key
 * 3. wrapMasterKeyWithPrf() → PRF-based hardware-bound master key wrapping
 * 4. unwrapMasterKeyWithPrf() → PRF-based master key unwrapping
 * 5. setupHardwareKey() → full setup: register + PRF wrap + POST to API
 * 6. unlockWithHardwareKey() → challenge → sign → verify → PRF unwrap
 * 5. listHardwareKeys() / removeHardwareKey() → key management
 */

import { registerPlugin } from '@capacitor/core';
import { fromBase64, toBase64 } from '@lockbox/crypto';
import type { HardwareKeySetupRequest, HardwareKeyChallengeResponse } from '@lockbox/types';

// ─── Native Plugin Interface ──────────────────────────────────────────────────

/** Result from FIDO2 key registration */
export interface Fido2RegistrationResult {
  /** Base64url-encoded credential ID */
  keyId: string;
  /** Base64url-encoded COSE public key */
  publicKey: string;
  /** Base64url-encoded attestation object */
  attestation: string;
  /** Whether the authenticator supports the PRF extension */
  prfEnabled?: boolean;
}

/** Result from FIDO2 authentication */
export interface Fido2AuthenticationResult {
  /** Base64url-encoded signature */
  signature: string;
  /** Base64url-encoded authenticator data */
  authenticatorData: string;
  /** Base64url-encoded client data JSON */
  clientDataJSON: string;
  /** Base64url-encoded PRF output (32 bytes) when prfSalt was provided */
  prfOutput?: string;
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
  /** Base64url-encoded PRF salt for hardware-bound key derivation */
  prfSalt?: string;
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

// ─── PRF Constants ────────────────────────────────────────────────────────────

const PRF_CONTEXT = 'lockbox-master-key-wrap-v1';

// ─── PRF Helpers ──────────────────────────────────────────────────────────────

function base64urlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function derivePrfSalt(): Promise<Uint8Array> {
  const encoded = new TextEncoder().encode(PRF_CONTEXT);
  const hash = await crypto.subtle.digest('SHA-256', encoded as Uint8Array<ArrayBuffer>);
  return new Uint8Array(hash);
}

async function deriveWrappingKeyFromPrf(
  prfOutput: Uint8Array,
  usage: KeyUsage[]
): Promise<CryptoKey> {
  const ikm = await crypto.subtle.importKey(
    'raw',
    prfOutput as Uint8Array<ArrayBuffer>,
    { name: 'HKDF' },
    false,
    ['deriveBits']
  );
  const info = new TextEncoder().encode(PRF_CONTEXT);
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
  return crypto.subtle.importKey('raw', derivedBits, { name: 'AES-GCM' }, false, usage);
}

// ─── Master Key Wrapping (PRF-based) ─────────────────────────────────────────

export async function wrapMasterKeyWithPrf(options: {
  masterKey: Uint8Array;
  credentialId: string;
  rpId: string;
}): Promise<{ wrappedMasterKey: string; prfSalt: string }> {
  const { masterKey, credentialId, rpId } = options;

  const salt = await derivePrfSalt();
  const saltBase64url = base64urlEncode(salt);

  const challengeBytes = crypto.getRandomValues(new Uint8Array(32));
  const authResult = await Fido2.authenticate({
    challenge: base64urlEncode(challengeBytes),
    rpId,
    allowCredentials: [{ id: credentialId, type: 'public-key' }],
    prfSalt: saltBase64url,
  });

  if (!authResult.prfOutput) {
    throw new Error(
      'FIDO2 PRF extension is not supported by this authenticator. ' +
        'Hardware key wrapping requires PRF support (Android 14+ with compatible security key).'
    );
  }

  const prfBytes = base64urlDecode(authResult.prfOutput);
  const wrappingKey = await deriveWrappingKeyFromPrf(prfBytes, ['encrypt']);

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as Uint8Array<ArrayBuffer> },
    wrappingKey,
    masterKey as Uint8Array<ArrayBuffer>
  );

  const wrappedMasterKey = `${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`;
  return { wrappedMasterKey, prfSalt: saltBase64url };
}

export async function unwrapMasterKeyWithPrf(options: {
  wrappedMasterKey: string;
  prfSalt: string;
  credentialId: string;
  rpId: string;
}): Promise<Uint8Array> {
  const { wrappedMasterKey, prfSalt, credentialId, rpId } = options;

  const challengeBytes = crypto.getRandomValues(new Uint8Array(32));
  const authResult = await Fido2.authenticate({
    challenge: base64urlEncode(challengeBytes),
    rpId,
    allowCredentials: [{ id: credentialId, type: 'public-key' }],
    prfSalt,
  });

  if (!authResult.prfOutput) {
    throw new Error(
      'FIDO2 PRF extension is not supported by this authenticator. ' +
        'Hardware key unwrapping requires PRF support (Android 14+ with compatible security key).'
    );
  }

  const prfBytes = base64urlDecode(authResult.prfOutput);
  const wrappingKey = await deriveWrappingKeyFromPrf(prfBytes, ['decrypt']);

  const parts = wrappedMasterKey.split('.');
  if (parts.length !== 2) {
    throw new Error('Invalid wrapped master key format');
  }
  const iv = fromBase64(parts[0]);
  const ciphertext = fromBase64(parts[1]);

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as Uint8Array<ArrayBuffer> },
    wrappingKey,
    ciphertext as Uint8Array<ArrayBuffer>
  );

  return new Uint8Array(plaintext);
}

// ─── API Integration ──────────────────────────────────────────────────────────

/**
 * Full hardware key setup flow:
 * 1. Register FIDO2 key on device — reject if PRF not supported
 * 2. Wrap master key via PRF-derived hardware-bound secret
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
  const rpId = new URL(apiUrl).hostname;

  const registration = await registerFido2Key({
    userId,
    email,
    rpId,
    rpName: 'Lockbox',
  });

  if (!registration.prfEnabled) {
    throw new Error(
      'FIDO2 PRF extension is not supported by this authenticator. ' +
        'Hardware key setup requires a security key with PRF support (Android 14+ with compatible key).'
    );
  }

  const { wrappedMasterKey, prfSalt } = await wrapMasterKeyWithPrf({
    masterKey,
    credentialId: registration.keyId,
    rpId,
  });

  const body: HardwareKeySetupRequest = {
    keyType: 'fido2',
    publicKey: registration.publicKey,
    wrappedMasterKey,
    attestation: registration.attestation,
    prfSalt,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/api/auth/hardware-key/setup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Hardware key setup failed: ${response.status}`);
  }

  const data = (await response.json()) as { keyId: string };
  return { keyId: data.keyId };
}

/**
 * Unlock with hardware key flow:
 * 1. GET challenge + prfSalt from /api/auth/hardware-key/challenge
 * 2. Sign challenge with FIDO2 hardware key
 * 3. POST verification to /api/auth/hardware-key/verify
 * 4. Unwrap master key using PRF-derived secret
 * 5. Return session token + decrypted master key
 */
export async function unlockWithHardwareKey(options: {
  apiUrl: string;
  keyId: string;
}): Promise<{ token: string; masterKey: Uint8Array }> {
  const { apiUrl, keyId } = options;
  const rpId = new URL(apiUrl).hostname;

  const challengeController = new AbortController();
  const challengeTimeout = setTimeout(() => challengeController.abort(), 30_000);
  let challengeResponse: Response;
  try {
    challengeResponse = await fetch(
      `${apiUrl}/api/auth/hardware-key/challenge?keyId=${encodeURIComponent(keyId)}`,
      { signal: challengeController.signal }
    );
  } finally {
    clearTimeout(challengeTimeout);
  }
  if (!challengeResponse.ok) {
    throw new Error(`Failed to get challenge: ${challengeResponse.status}`);
  }
  const challengeData = (await challengeResponse.json()) as HardwareKeyChallengeResponse & {
    prfSalt?: string;
    wrappedMasterKey?: string;
  };

  const authResult = await authenticateFido2({
    challenge: challengeData.challenge,
    rpId,
    allowCredentials: [{ id: keyId, type: 'public-key' }],
  });

  const verifyController = new AbortController();
  const verifyTimeout = setTimeout(() => verifyController.abort(), 30_000);
  let verifyResponse: Response;
  try {
    verifyResponse = await fetch(`${apiUrl}/api/auth/hardware-key/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keyId,
        signature: authResult.signature,
        challenge: challengeData.challenge,
      }),
      signal: verifyController.signal,
    });
  } finally {
    clearTimeout(verifyTimeout);
  }

  if (!verifyResponse.ok) {
    throw new Error(`Hardware key verification failed: ${verifyResponse.status}`);
  }

  const verifyData = (await verifyResponse.json()) as {
    token: string;
    wrappedMasterKey: string;
    prfSalt: string;
  };

  const masterKey = await unwrapMasterKeyWithPrf({
    wrappedMasterKey: verifyData.wrappedMasterKey,
    prfSalt: verifyData.prfSalt,
    credentialId: keyId,
    rpId,
  });

  return { token: verifyData.token, masterKey };
}

/**
 * List all hardware keys registered for the current user.
 */
export async function listHardwareKeys(apiUrl: string, token: string): Promise<HardwareKeyInfo[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/api/auth/hardware-key/list`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/api/auth/hardware-key/${encodeURIComponent(keyId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Failed to remove hardware key: ${response.status}`);
  }
}
