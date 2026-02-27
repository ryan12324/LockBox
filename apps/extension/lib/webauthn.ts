/**
 * WebAuthn interceptor logic and passkey management.
 *
 * This module provides:
 * 1. An interceptor script that runs in PAGE context — overrides
 *    navigator.credentials.create() / .get() and relays to the content script.
 * 2. Helper functions for base64url encoding, authenticator data construction,
 *    credential serialization, and ECDSA signing — all running in the
 *    extension (background / content) context where private keys stay safe.
 */

// ─── Data structures ────────────────────────────────────────────────────────────

export interface StoredPasskey {
  credentialId: string; // base64url encoded
  rpId: string;
  rpName: string;
  userName: string;
  userDisplayName: string;
  userId: string; // base64url-encoded RP user handle
  publicKeyAlgorithm: number; // -7 for ES256
  publicKeySPKI: string; // base64url-encoded SubjectPublicKeyInfo
  counter: number;
  createdAt: string;
  // Private key is stored encrypted in the vault item's encryptedData
}

export interface WebAuthnCreateRequest {
  type: 'lockbox-webauthn-create';
  requestId: string;
  origin: string;
  options: SerializedCreationOptions;
}

export interface WebAuthnGetRequest {
  type: 'lockbox-webauthn-get';
  requestId: string;
  origin: string;
  options: SerializedRequestOptions;
}

export interface WebAuthnResponse {
  type: 'lockbox-webauthn-response';
  requestId: string;
  credential?: SerializedCredential;
  error?: string;
  fallback?: boolean;
}

/**
 * JSON-safe representation of PublicKeyCredentialCreationOptions.
 * ArrayBuffer values are transported as base64url strings.
 */
export interface SerializedCreationOptions {
  rp: { id?: string; name: string };
  user: { id: string; name: string; displayName: string }; // id = base64url
  challenge: string; // base64url
  pubKeyCredParams: Array<{ type: string; alg: number }>;
  timeout?: number;
  excludeCredentials?: Array<{ id: string; type: string; transports?: string[] }>;
  authenticatorSelection?: {
    authenticatorAttachment?: string;
    residentKey?: string;
    requireResidentKey?: boolean;
    userVerification?: string;
  };
  attestation?: string;
}

/**
 * JSON-safe representation of PublicKeyCredentialRequestOptions.
 */
export interface SerializedRequestOptions {
  challenge: string; // base64url
  rpId?: string;
  timeout?: number;
  allowCredentials?: Array<{ id: string; type: string; transports?: string[] }>;
  userVerification?: string;
}

/**
 * JSON-safe representation of a PublicKeyCredential response.
 */
export interface SerializedCredential {
  id: string;
  rawId: string; // base64url
  type: string;
  authenticatorAttachment?: string;
  response: {
    clientDataJSON: string; // base64url
    attestationObject?: string; // base64url (create)
    authenticatorData?: string; // base64url (create + get)
    signature?: string; // base64url (get)
    userHandle?: string; // base64url (get)
    publicKey?: string; // base64url SPKI (create)
    publicKeyAlgorithm?: number; // -7 for ES256 (create)
    transports?: string[]; // e.g. ['internal'] (create)
  };
}

// ─── Base64url helpers ──────────────────────────────────────────────────────────

/** Encode a Uint8Array to a base64url string (no padding). */
export function base64urlEncode(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decode a base64url string to a Uint8Array. */
export function base64urlDecode(str: string): Uint8Array {
  // Restore standard base64
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  // Pad
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ─── Credential helpers ─────────────────────────────────────────────────────────

/** Generate a random 32-byte credential ID. */
export function generateCredentialId(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

/**
 * Build authenticator data according to the WebAuthn spec.
 *
 * Layout (without extensions):
 *   rpIdHash (32) | flags (1) | counter (4) [ | aaguid (16) | credIdLen (2) | credId | pubKey ]
 *
 * The attested credential data (aaguid .. pubKey) is included only during registration.
 */
export function createAuthenticatorData(
  rpIdHash: Uint8Array,
  counter: number,
  credentialId?: Uint8Array,
  publicKeyCOSE?: Uint8Array
): Uint8Array {
  // flags: UP (0x01) | UV (0x04) | BE (0x08) | BS (0x10) | AT if attested (0x40)
  const flags = credentialId ? 0x5d : 0x1d; // UP + UV + BE + BS + AT  or  UP + UV + BE + BS

  const counterBuf = new Uint8Array(4);
  new DataView(counterBuf.buffer).setUint32(0, counter, false);

  if (!credentialId || !publicKeyCOSE) {
    // Assertion: 37 bytes total
    const data = new Uint8Array(37);
    data.set(rpIdHash, 0);
    data[32] = flags;
    data.set(counterBuf, 33);
    return data;
  }

  // Attestation: include attested credential data
  // AAGUID = 16 zero bytes (software authenticator)
  const aaguid = new Uint8Array(16);
  const credIdLenBuf = new Uint8Array(2);
  new DataView(credIdLenBuf.buffer).setUint16(0, credentialId.length, false);

  const totalLen = 32 + 1 + 4 + 16 + 2 + credentialId.length + publicKeyCOSE.length;
  const data = new Uint8Array(totalLen);
  let offset = 0;

  data.set(rpIdHash, offset);
  offset += 32;
  data[offset] = flags;
  offset += 1;
  data.set(counterBuf, offset);
  offset += 4;
  data.set(aaguid, offset);
  offset += 16;
  data.set(credIdLenBuf, offset);
  offset += 2;
  data.set(credentialId, offset);
  offset += credentialId.length;
  data.set(publicKeyCOSE, offset);

  return data;
}

/**
 * Hash an rpId using SHA-256 for use in authenticator data.
 */
export async function hashRpId(rpId: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const data = encoder.encode(rpId);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(hash);
}

/**
 * Generate an ECDSA P-256 key pair for passkey registration.
 * Returns both the CryptoKeyPair and exported key material.
 */
export async function generatePasskeyKeyPair(): Promise<{
  keyPair: CryptoKeyPair;
  publicKeySPKI: Uint8Array;
  privateKeyPKCS8: Uint8Array;
  publicKeyCOSE: Uint8Array;
}> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true, // extractable
    ['sign', 'verify']
  );

  const spki = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

  // Convert SPKI public key to COSE Key format for authenticator data
  const publicKeyCOSE = spkiToCOSE(new Uint8Array(spki));

  return {
    keyPair,
    publicKeySPKI: new Uint8Array(spki),
    privateKeyPKCS8: new Uint8Array(pkcs8),
    publicKeyCOSE,
  };
}

/**
 * Convert an SPKI-encoded P-256 public key to COSE_Key format (EC2, ES256).
 *
 * COSE_Key map:
 *   1 (kty)  → 2 (EC2)
 *   3 (alg)  → -7 (ES256)
 *  -1 (crv)  → 1 (P-256)
 *  -2 (x)    → 32 bytes
 *  -3 (y)    → 32 bytes
 *
 * Encoded as CBOR map with 5 entries.
 */
export function spkiToCOSE(spki: Uint8Array): Uint8Array {
  // SPKI for P-256 is 91 bytes:
  //   30 59 30 13 06 07 ... (header) 03 42 00 04 <x 32> <y 32>
  // The uncompressed point (04 || x || y) starts at offset 26.
  const uncompressedPoint = spki.slice(26);
  if (uncompressedPoint[0] !== 0x04 || uncompressedPoint.length !== 65) {
    throw new Error('Invalid SPKI: expected uncompressed P-256 point');
  }
  const x = uncompressedPoint.slice(1, 33);
  const y = uncompressedPoint.slice(33, 65);

  // Build CBOR manually — a map(5) with known integer keys.
  // CBOR: A5 (map of 5 items)
  //   01 02              — kty: EC2
  //   03 26              — alg: ES256 (-7 → major 1, value 6)
  //   20 01              — crv: P-256 (-1 → major 1, value 0; 1)
  //   21 5820 <x>        — x: bstr(32)
  //   22 5820 <y>        — y: bstr(32)
  const cbor = new Uint8Array(2 + 2 + 2 + 2 + 2 + 1 + 32 + 2 + 1 + 32);
  let off = 0;

  // Map(5)
  cbor[off++] = 0xa5;

  // 1: 2 (kty = EC2)
  cbor[off++] = 0x01;
  cbor[off++] = 0x02;

  // 3: -7 (alg = ES256)
  cbor[off++] = 0x03;
  cbor[off++] = 0x26; // negative int: -1 - 6 = -7

  // -1: 1 (crv = P-256)
  cbor[off++] = 0x20; // negative int key: -1
  cbor[off++] = 0x01;

  // -2: x (bstr 32)
  cbor[off++] = 0x21; // negative int key: -2
  cbor[off++] = 0x58; // bstr with 1-byte length
  cbor[off++] = 0x20; // 32
  cbor.set(x, off);
  off += 32;

  // -3: y (bstr 32)
  cbor[off++] = 0x22; // negative int key: -3
  cbor[off++] = 0x58;
  cbor[off++] = 0x20;
  cbor.set(y, off);

  return cbor;
}

/**
 * Import a PKCS#8-encoded ECDSA P-256 private key.
 */
export async function importPrivateKey(pkcs8: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'pkcs8',
    pkcs8.buffer as ArrayBuffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

/**
 * Sign a WebAuthn assertion.
 *
 * The signed data is: authenticatorData || SHA-256(clientDataJSON)
 */
export async function signChallenge(
  privateKey: CryptoKey,
  authenticatorData: Uint8Array,
  clientDataHash: Uint8Array
): Promise<Uint8Array> {
  const signedData = new Uint8Array(authenticatorData.length + clientDataHash.length);
  signedData.set(authenticatorData, 0);
  signedData.set(clientDataHash, authenticatorData.length);

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    signedData
  );

  return new Uint8Array(signature);
}

/**
 * Convert an ECDSA signature from IEEE P1363 format (r || s) to DER/ASN.1.
 * WebCrypto returns P1363; WebAuthn RPs expect DER.
 */
export function p1363ToDer(signature: Uint8Array): Uint8Array {
  const r = signature.slice(0, 32);
  const s = signature.slice(32, 64);

  function encodeInteger(bytes: Uint8Array): Uint8Array {
    let start = 0;
    while (start < bytes.length - 1 && bytes[start] === 0) start++;
    const needsPad = bytes[start] >= 0x80;
    const len = bytes.length - start + (needsPad ? 1 : 0);
    const result = new Uint8Array(2 + len);
    result[0] = 0x02; // INTEGER tag
    result[1] = len;
    if (needsPad) result[2] = 0x00;
    result.set(bytes.slice(start), needsPad ? 3 : 2);
    return result;
  }

  const rDer = encodeInteger(r);
  const sDer = encodeInteger(s);

  // SEQUENCE { INTEGER r, INTEGER s }
  const seqLen = rDer.length + sDer.length;
  const result = new Uint8Array(2 + seqLen);
  result[0] = 0x30; // SEQUENCE tag
  result[1] = seqLen;
  result.set(rDer, 2);
  result.set(sDer, 2 + rDer.length);
  return result;
}

/**
 * Build a minimal CBOR-encoded attestation object (fmt = "none").
 *
 * Structure:
 *   { "fmt": "none", "attStmt": {}, "authData": <bytes> }
 */
export function buildAttestationObject(authData: Uint8Array): Uint8Array {
  // CBOR map(3)
  // "fmt" → "none"
  // "attStmt" → {}
  // "authData" → bstr

  // Pre-compute pieces
  const fmtKey = cborTextString('fmt');
  const fmtVal = cborTextString('none');
  const attStmtKey = cborTextString('attStmt');
  const attStmtVal = new Uint8Array([0xa0]); // empty map
  const authDataKey = cborTextString('authData');
  const authDataVal = cborByteString(authData);

  const totalLen =
    1 + // map(3) header
    fmtKey.length +
    fmtVal.length +
    attStmtKey.length +
    attStmtVal.length +
    authDataKey.length +
    authDataVal.length;

  const result = new Uint8Array(totalLen);
  let off = 0;

  result[off++] = 0xa3; // map(3)
  result.set(fmtKey, off);
  off += fmtKey.length;
  result.set(fmtVal, off);
  off += fmtVal.length;
  result.set(attStmtKey, off);
  off += attStmtKey.length;
  result.set(attStmtVal, off);
  off += attStmtVal.length;
  result.set(authDataKey, off);
  off += authDataKey.length;
  result.set(authDataVal, off);

  return result;
}

/** Encode a UTF-8 string as a CBOR text string. */
function cborTextString(s: string): Uint8Array {
  const encoded = new TextEncoder().encode(s);
  const header = cborLengthHeader(3, encoded.length); // major type 3
  const result = new Uint8Array(header.length + encoded.length);
  result.set(header, 0);
  result.set(encoded, header.length);
  return result;
}

/** Encode a Uint8Array as a CBOR byte string. */
function cborByteString(data: Uint8Array): Uint8Array {
  const header = cborLengthHeader(2, data.length); // major type 2
  const result = new Uint8Array(header.length + data.length);
  result.set(header, 0);
  result.set(data, header.length);
  return result;
}

/** Build a CBOR length header for a given major type. */
function cborLengthHeader(majorType: number, length: number): Uint8Array {
  const mt = majorType << 5;
  if (length < 24) {
    return new Uint8Array([mt | length]);
  } else if (length < 256) {
    return new Uint8Array([mt | 24, length]);
  } else if (length < 65536) {
    const buf = new Uint8Array(3);
    buf[0] = mt | 25;
    new DataView(buf.buffer).setUint16(1, length, false);
    return buf;
  }
  const buf = new Uint8Array(5);
  buf[0] = mt | 26;
  new DataView(buf.buffer).setUint32(1, length, false);
  return buf;
}

/**
 * Build clientDataJSON for a WebAuthn ceremony.
 */
export function buildClientDataJSON(
  type: 'webauthn.create' | 'webauthn.get',
  challenge: string,
  origin: string
): Uint8Array {
  const clientData = {
    type,
    challenge,
    origin,
    crossOrigin: false,
  };
  return new TextEncoder().encode(JSON.stringify(clientData));
}

/**
 * Serialize a PublicKeyCredential to a JSON-safe object for message passing.
 */
export function serializePublicKeyCredential(
  credential: PublicKeyCredential
): SerializedCredential {
  const response = credential.response;
  const serialized: SerializedCredential = {
    id: credential.id,
    rawId: base64urlEncode(new Uint8Array(credential.rawId)),
    type: credential.type,
    response: {
      clientDataJSON: base64urlEncode(new Uint8Array(response.clientDataJSON)),
    },
  };

  if (credential.authenticatorAttachment) {
    serialized.authenticatorAttachment = credential.authenticatorAttachment;
  }

  // Registration response
  if ('attestationObject' in response) {
    const attestResp = response as AuthenticatorAttestationResponse;
    serialized.response.attestationObject = base64urlEncode(
      new Uint8Array(attestResp.attestationObject)
    );
  }

  // Authentication response
  if ('authenticatorData' in response && 'signature' in response) {
    const assertResp = response as AuthenticatorAssertionResponse;
    serialized.response.authenticatorData = base64urlEncode(
      new Uint8Array(assertResp.authenticatorData)
    );
    serialized.response.signature = base64urlEncode(new Uint8Array(assertResp.signature));
    if (assertResp.userHandle) {
      serialized.response.userHandle = base64urlEncode(new Uint8Array(assertResp.userHandle));
    }
  }

  return serialized;
}

/**
 * Match stored passkeys against a WebAuthn get request.
 *
 * @param passkeys All stored passkeys
 * @param rpId The relying party ID from the request
 * @param allowCredentials Optional list of allowed credential IDs
 * @returns Matching passkeys, filtered by rpId and optionally by allowCredentials
 */
export function findMatchingPasskeys(
  passkeys: StoredPasskey[],
  rpId: string,
  allowCredentials?: Array<{ id: string; type: string }>
): StoredPasskey[] {
  // Filter by rpId
  const rpMatches = passkeys.filter((pk) => pk.rpId === rpId);

  if (!allowCredentials || allowCredentials.length === 0) {
    // Discoverable credential flow — return all for this RP
    return rpMatches;
  }

  // Filter by allowCredentials list
  const allowedIds = new Set(allowCredentials.map((c) => c.id));
  return rpMatches.filter((pk) => allowedIds.has(pk.credentialId));
}

// ─── Interceptor script (runs in PAGE context) ─────────────────────────────────

/**
 * Returns a self-contained JavaScript string that, when injected into a page,
 * overrides navigator.credentials.create() and navigator.credentials.get()
 * to communicate with the Lockbox content script via postMessage.
 *
 * The script:
 * 1. Saves original credential methods.
 * 2. Overrides create() — posts a message, waits for a response.
 *    If the extension handles it, returns the credential.
 *    If declined/error/fallback, falls through to the original method.
 * 3. Overrides get() — same pattern.
 *
 * SECURITY: No private key material ever enters page context.
 */
export function getWebAuthnInterceptorScript(): string {
  return `(function() {
  'use strict';

  // Bail out if credentials API not available
  if (!navigator.credentials) return;

  const origCreate = navigator.credentials.create.bind(navigator.credentials);
  const origGet = navigator.credentials.get.bind(navigator.credentials);

  // Helper: ArrayBuffer → base64url
  function bufToB64url(buf) {
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
  }

  // Helper: base64url → ArrayBuffer
  function b64urlToBuf(str) {
    let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) b64 += '=';
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // Serialize creation options for message passing
  function serializeCreateOptions(opts) {
    if (!opts || !opts.publicKey) return null;
    const pk = opts.publicKey;
    return {
      rp: { id: pk.rp.id, name: pk.rp.name },
      user: {
        id: bufToB64url(pk.user.id),
        name: pk.user.name,
        displayName: pk.user.displayName
      },
      challenge: bufToB64url(pk.challenge),
      pubKeyCredParams: pk.pubKeyCredParams.map(function(p) {
        return { type: p.type, alg: p.alg };
      }),
      timeout: pk.timeout,
      excludeCredentials: (pk.excludeCredentials || []).map(function(c) {
        return { id: bufToB64url(c.id), type: c.type, transports: c.transports };
      }),
      authenticatorSelection: pk.authenticatorSelection,
      attestation: pk.attestation
    };
  }

  // Serialize get options for message passing
  function serializeGetOptions(opts) {
    if (!opts || !opts.publicKey) return null;
    const pk = opts.publicKey;
    return {
      challenge: bufToB64url(pk.challenge),
      rpId: pk.rpId,
      timeout: pk.timeout,
      allowCredentials: (pk.allowCredentials || []).map(function(c) {
        return { id: bufToB64url(c.id), type: c.type, transports: c.transports };
      }),
      userVerification: pk.userVerification
    };
  }

  // Deserialize credential response from the extension
  function deserializeCredential(data) {
    if (!data) return null;
    var isCreate = !!data.response.attestationObject;
    var response = {};
    if (data.response.clientDataJSON) {
      response.clientDataJSON = b64urlToBuf(data.response.clientDataJSON);
    }
    if (data.response.attestationObject) {
      response.attestationObject = b64urlToBuf(data.response.attestationObject);
      var authDataBuf = data.response.authenticatorData ? b64urlToBuf(data.response.authenticatorData) : new ArrayBuffer(0);
      var pubKeyBuf = data.response.publicKey ? b64urlToBuf(data.response.publicKey) : null;
      var pubKeyAlg = data.response.publicKeyAlgorithm || -7;
      var transports = data.response.transports || ['internal'];
      response.getAuthenticatorData = function() { return authDataBuf; };
      response.getPublicKey = function() { return pubKeyBuf; };
      response.getPublicKeyAlgorithm = function() { return pubKeyAlg; };
      response.getTransports = function() { return transports; };
    }
    if (data.response.authenticatorData && !data.response.attestationObject) {
      response.authenticatorData = b64urlToBuf(data.response.authenticatorData);
    }
    if (data.response.signature) {
      response.signature = b64urlToBuf(data.response.signature);
    }
    if (data.response.userHandle) {
      response.userHandle = b64urlToBuf(data.response.userHandle);
    }

    var cred = {
      id: data.id,
      rawId: b64urlToBuf(data.rawId),
      type: data.type || 'public-key',
      authenticatorAttachment: data.authenticatorAttachment || 'platform',
      response: response,
      getClientExtensionResults: function() {
        return isCreate ? { credProps: { rk: true } } : {};
      },
      toJSON: function() {
        var json = { id: data.id, rawId: data.rawId, type: data.type || 'public-key' };
        json.response = {};
        if (data.response.clientDataJSON) json.response.clientDataJSON = data.response.clientDataJSON;
        if (data.response.attestationObject) json.response.attestationObject = data.response.attestationObject;
        if (data.response.authenticatorData) json.response.authenticatorData = data.response.authenticatorData;
        if (data.response.signature) json.response.signature = data.response.signature;
        if (data.response.userHandle) json.response.userHandle = data.response.userHandle;
        return json;
      }
    };

    // CRITICAL: Set prototype chain so instanceof checks pass on RP sites
    if (typeof PublicKeyCredential !== 'undefined') {
      Object.setPrototypeOf(cred, PublicKeyCredential.prototype);
      if (isCreate && typeof AuthenticatorAttestationResponse !== 'undefined') {
        Object.setPrototypeOf(response, AuthenticatorAttestationResponse.prototype);
      } else if (!isCreate && typeof AuthenticatorAssertionResponse !== 'undefined') {
        Object.setPrototypeOf(response, AuthenticatorAssertionResponse.prototype);
      }
    }

    return cred;
  }

  // Generate a unique request ID
  function makeRequestId() {
    return 'lockbox-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }

  // Wait for a response with matching requestId, with timeout
  function waitForResponse(requestId, timeoutMs) {
    return new Promise(function(resolve) {
      var timer = setTimeout(function() {
        window.removeEventListener('message', handler);
        resolve({ fallback: true });
      }, timeoutMs || 30000);

      function handler(event) {
        if (event.source !== window) return;
        if (!event.data || event.data.type !== 'lockbox-webauthn-response') return;
        if (event.data.requestId !== requestId) return;
        clearTimeout(timer);
        window.removeEventListener('message', handler);
        resolve(event.data);
      }
      window.addEventListener('message', handler);
    });
  }

  // Override create
  navigator.credentials.create = function(options) {
    var serialized = serializeCreateOptions(options);
    if (!serialized) return origCreate(options);

    var requestId = makeRequestId();
    window.postMessage({
      type: 'lockbox-webauthn-create',
      requestId: requestId,
      origin: window.location.origin,
      options: serialized
    }, '*');

    return waitForResponse(requestId, (options.publicKey && options.publicKey.timeout) || 60000)
      .then(function(resp) {
        if (resp.fallback || resp.error) {
          return origCreate(options);
        }
        if (resp.credential) {
          return deserializeCredential(resp.credential);
        }
        return origCreate(options);
      });
  };

  // Override get
  navigator.credentials.get = function(options) {
    var serialized = serializeGetOptions(options);
    if (!serialized) return origGet(options);

    var requestId = makeRequestId();
    window.postMessage({
      type: 'lockbox-webauthn-get',
      requestId: requestId,
      origin: window.location.origin,
      options: serialized
    }, '*');

    return waitForResponse(requestId, (options.publicKey && options.publicKey.timeout) || 60000)
      .then(function(resp) {
        if (resp.fallback || resp.error) {
          return origGet(options);
        }
        if (resp.credential) {
          return deserializeCredential(resp.credential);
        }
        return origGet(options);
      });
  };
})();`;
}
