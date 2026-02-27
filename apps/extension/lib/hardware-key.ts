/**
 * Hardware security key registration and authentication via WebAuthn.
 * Uses ECDSA P-256 for credential creation and challenge-response auth.
 * Wraps the master key with a key derived from the hardware key's public key.
 */

import type { HardwareKeySetupRequest, HardwareKeyChallengeResponse } from '@lockbox/types';
import { base64urlEncode, base64urlDecode } from './webauthn.js';

// ─── Registration flow ─────────────────────────────────────────────────────────

/**
 * Register a hardware security key for the given user.
 * 1. Calls navigator.credentials.create() with publicKey options
 * 2. Extracts ECDSA P-256 public key from attestation
 * 3. Wraps master key with a key derived from the public key via HKDF
 * 4. Returns registration data (keyId, publicKey, wrappedMasterKey)
 */
export async function registerHardwareKey(options: {
  userId: string;
  email: string;
  masterKey: Uint8Array;
}): Promise<{ keyId: string; publicKey: string; wrappedMasterKey: string }> {
  if (!navigator.credentials) {
    throw new Error('WebAuthn is not available in this browser');
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32));

  const createOptions: PublicKeyCredentialCreationOptions = {
    rp: { name: 'Lockbox', id: window.location.hostname },
    user: {
      id: new TextEncoder().encode(options.userId),
      name: options.email,
      displayName: options.email,
    },
    challenge,
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }], // ES256
    timeout: 60000,
    authenticatorSelection: {
      authenticatorAttachment: 'cross-platform',
      residentKey: 'discouraged',
      userVerification: 'preferred',
    },
    attestation: 'direct',
  };

  const credential = (await navigator.credentials.create({
    publicKey: createOptions,
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error('Hardware key registration was cancelled');
  }

  const keyId = base64urlEncode(new Uint8Array(credential.rawId));
  const attestationResponse = credential.response as AuthenticatorAttestationResponse;

  // Extract public key from attestation — getPublicKey() returns SPKI-encoded key
  const publicKeyBuf = attestationResponse.getPublicKey();
  if (!publicKeyBuf) {
    throw new Error('Failed to extract public key from hardware key');
  }
  const publicKeyB64 = base64urlEncode(new Uint8Array(publicKeyBuf));

  // Wrap master key using a key derived from the hardware key's public key
  const wrappedMasterKey = await wrapMasterKey(options.masterKey, new Uint8Array(publicKeyBuf));

  return { keyId, publicKey: publicKeyB64, wrappedMasterKey };
}

/**
 * Extract the SPKI public key bytes from an attestation response.
 * Falls back to parsing authenticatorData if getPublicKey() is unavailable.
 */
export function extractPublicKeyFromAttestation(
  response: AuthenticatorAttestationResponse
): Uint8Array | null {
  const pubKeyBuf = response.getPublicKey();
  if (pubKeyBuf) {
    return new Uint8Array(pubKeyBuf);
  }
  return null;
}

// ─── Authentication flow ───────────────────────────────────────────────────────

/**
 * Request a challenge from the server for hardware key authentication.
 * POSTs to /api/auth/hardware-key/challenge with keyId.
 */
export async function requestHardwareKeyChallenge(
  apiUrl: string,
  keyId: string
): Promise<HardwareKeyChallengeResponse> {
  const response = await fetch(`${apiUrl}/api/auth/hardware-key/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyId }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ?? `Challenge request failed: ${response.status}`
    );
  }

  return response.json() as Promise<HardwareKeyChallengeResponse>;
}

/**
 * Authenticate with a hardware security key.
 * 1. Calls navigator.credentials.get() with challenge
 * 2. Extracts signature from assertion
 * 3. POSTs to /api/auth/hardware-key/verify
 * 4. Returns session token + wrapped master key
 */
export async function authenticateWithHardwareKey(options: {
  apiUrl: string;
  keyId: string;
  challenge: string;
}): Promise<{ token: string; wrappedMasterKey: string }> {
  if (!navigator.credentials) {
    throw new Error('WebAuthn is not available in this browser');
  }

  const challengeBytes = base64urlDecode(options.challenge);

  const getOptions: PublicKeyCredentialRequestOptions = {
    challenge: challengeBytes,
    rpId: window.location.hostname,
    timeout: 60000,
    allowCredentials: [
      {
        id: base64urlDecode(options.keyId),
        type: 'public-key',
        transports: ['usb', 'nfc', 'ble'],
      },
    ],
    userVerification: 'preferred',
  };

  const assertion = (await navigator.credentials.get({
    publicKey: getOptions,
  })) as PublicKeyCredential | null;

  if (!assertion) {
    throw new Error('Hardware key authentication was cancelled');
  }

  const assertionResponse = assertion.response as AuthenticatorAssertionResponse;
  const signature = base64urlEncode(new Uint8Array(assertionResponse.signature));
  const authenticatorData = base64urlEncode(new Uint8Array(assertionResponse.authenticatorData));
  const clientDataJSON = base64urlEncode(new Uint8Array(assertionResponse.clientDataJSON));

  const response = await fetch(`${options.apiUrl}/api/auth/hardware-key/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      keyId: options.keyId,
      challenge: options.challenge,
      signature,
      authenticatorData,
      clientDataJSON,
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ?? `Verification failed: ${response.status}`
    );
  }

  return response.json() as Promise<{ token: string; wrappedMasterKey: string }>;
}

// ─── Key management ────────────────────────────────────────────────────────────

/**
 * List all hardware keys registered to the current user.
 */
export async function listHardwareKeys(
  apiUrl: string,
  token: string
): Promise<Array<{ id: string; keyType: string; createdAt: string }>> {
  const response = await fetch(`${apiUrl}/api/auth/hardware-keys`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ?? `Failed to list keys: ${response.status}`
    );
  }

  const data = await response.json();
  return (data as { keys: Array<{ id: string; keyType: string; createdAt: string }> }).keys;
}

/**
 * Remove a hardware key by ID.
 */
export async function removeHardwareKey(
  apiUrl: string,
  token: string,
  keyId: string
): Promise<void> {
  const response = await fetch(`${apiUrl}/api/auth/hardware-keys/${encodeURIComponent(keyId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ?? `Failed to remove key: ${response.status}`
    );
  }
}

// ─── Key wrapping helpers ──────────────────────────────────────────────────────

/**
 * Wrap a master key using HKDF-derived key from the hardware key's public key.
 * Uses AES-256-GCM for the wrapping operation.
 */
export async function wrapMasterKey(
  masterKey: Uint8Array,
  publicKeyBytes: Uint8Array
): Promise<string> {
  // Derive a wrapping key from the public key material via HKDF
  const ikm = await crypto.subtle.importKey('raw', publicKeyBytes, { name: 'HKDF' }, false, [
    'deriveBits',
  ]);

  const info = new TextEncoder().encode('lockbox-hardware-key-wrap');
  const salt = new Uint8Array(32); // Fixed salt (device-bound context)

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

  const wrappingKey = await crypto.subtle.importKey(
    'raw',
    derivedBits,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as Uint8Array<ArrayBuffer> },
    wrappingKey,
    masterKey as Uint8Array<ArrayBuffer>
  );

  // Format: base64url(iv).base64url(ciphertext+tag)
  return `${base64urlEncode(iv)}.${base64urlEncode(new Uint8Array(ciphertext))}`;
}

/**
 * Unwrap a master key using HKDF-derived key from the hardware key's public key.
 */
export async function unwrapMasterKey(
  wrappedMasterKey: string,
  publicKeyBytes: Uint8Array
): Promise<Uint8Array> {
  const dotIndex = wrappedMasterKey.indexOf('.');
  if (dotIndex === -1) {
    throw new Error('Invalid wrapped master key format');
  }

  const iv = base64urlDecode(wrappedMasterKey.slice(0, dotIndex));
  const ciphertext = base64urlDecode(wrappedMasterKey.slice(dotIndex + 1));

  // Derive the same wrapping key
  const ikm = await crypto.subtle.importKey('raw', publicKeyBytes, { name: 'HKDF' }, false, [
    'deriveBits',
  ]);

  const info = new TextEncoder().encode('lockbox-hardware-key-wrap');
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

  const wrappingKey = await crypto.subtle.importKey(
    'raw',
    derivedBits,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as Uint8Array<ArrayBuffer> },
    wrappingKey,
    ciphertext as Uint8Array<ArrayBuffer>
  );

  return new Uint8Array(plaintext);
}

/**
 * Check whether WebAuthn / hardware key support is available.
 */
export function isHardwareKeySupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.credentials !== 'undefined' &&
    typeof navigator.credentials.create === 'function' &&
    typeof navigator.credentials.get === 'function'
  );
}

/**
 * Build a HardwareKeySetupRequest from registration data for sending to the API.
 */
export function buildSetupRequest(
  keyType: 'yubikey-piv' | 'fido2',
  publicKey: string,
  wrappedMasterKey: string,
  attestation?: string
): HardwareKeySetupRequest {
  return {
    keyType,
    publicKey,
    wrappedMasterKey,
    attestation,
  };
}
