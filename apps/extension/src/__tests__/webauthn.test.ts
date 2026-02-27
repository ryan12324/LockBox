/**
 * Tests for WebAuthn interceptor logic and passkey management.
 * Tests the pure functions from lib/webauthn.ts in isolation.
 */

import { describe, it, expect } from 'vitest';
import {
  base64urlEncode,
  base64urlDecode,
  generateCredentialId,
  createAuthenticatorData,
  hashRpId,
  generatePasskeyKeyPair,
  importPrivateKey,
  signChallenge,
  spkiToCOSE,
  buildAttestationObject,
  buildClientDataJSON,
  findMatchingPasskeys,
  getWebAuthnInterceptorScript,
} from '../../lib/webauthn.js';
import type { StoredPasskey } from '../../lib/webauthn.js';

// ─── base64url encode/decode ────────────────────────────────────────────────────

describe('base64url encode/decode', () => {
  it('round-trips simple data', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const encoded = base64urlEncode(data);
    const decoded = base64urlDecode(encoded);
    expect(decoded).toEqual(data);
  });

  it('round-trips empty data', () => {
    const data = new Uint8Array(0);
    const encoded = base64urlEncode(data);
    expect(encoded).toBe('');
    const decoded = base64urlDecode(encoded);
    expect(decoded).toEqual(data);
  });

  it('round-trips 32 random bytes', () => {
    const data = crypto.getRandomValues(new Uint8Array(32));
    const encoded = base64urlEncode(data);
    const decoded = base64urlDecode(encoded);
    expect(decoded).toEqual(data);
  });

  it('produces url-safe characters (no +, /, =)', () => {
    // Use data that produces +, /, = in standard base64
    const data = new Uint8Array([0xff, 0xff, 0xff, 0xfe, 0xfd]);
    const encoded = base64urlEncode(data);
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('=');
  });

  it('decodes base64url with padding variants', () => {
    // "Hello" in base64url = "SGVsbG8" (no padding needed)
    const decoded = base64urlDecode('SGVsbG8');
    const text = new TextDecoder().decode(decoded);
    expect(text).toBe('Hello');
  });

  it('round-trips large data (256 bytes)', () => {
    const data = crypto.getRandomValues(new Uint8Array(256));
    const decoded = base64urlDecode(base64urlEncode(data));
    expect(decoded).toEqual(data);
  });
});

// ─── Credential ID generation ───────────────────────────────────────────────────

describe('generateCredentialId', () => {
  it('returns 32 bytes', () => {
    const id = generateCredentialId();
    expect(id).toBeInstanceOf(Uint8Array);
    expect(id.length).toBe(32);
  });

  it('returns unique values on successive calls', () => {
    const id1 = generateCredentialId();
    const id2 = generateCredentialId();
    expect(base64urlEncode(id1)).not.toBe(base64urlEncode(id2));
  });
});

// ─── Authenticator data construction ────────────────────────────────────────────

describe('createAuthenticatorData', () => {
  it('builds 37-byte assertion data (no attested credential)', () => {
    const rpIdHash = new Uint8Array(32).fill(0xaa);
    const data = createAuthenticatorData(rpIdHash, 42);
    // 32 (rpIdHash) + 1 (flags) + 4 (counter) = 37
    expect(data.length).toBe(37);
  });

  it('sets rpIdHash in first 32 bytes', () => {
    const rpIdHash = new Uint8Array(32).fill(0xbb);
    const data = createAuthenticatorData(rpIdHash, 0);
    expect(data.slice(0, 32)).toEqual(rpIdHash);
  });

  it('sets UP + UV flags (0x05) for assertion', () => {
    const rpIdHash = new Uint8Array(32);
    const data = createAuthenticatorData(rpIdHash, 0);
    // flags at byte 32: UP (0x01) | UV (0x04) = 0x05
    expect(data[32]).toBe(0x05);
  });

  it('sets UP + UV + AT flags (0x45) for attestation', () => {
    const rpIdHash = new Uint8Array(32);
    const credId = new Uint8Array(16).fill(0xcc);
    const pubKey = new Uint8Array(10).fill(0xdd);
    const data = createAuthenticatorData(rpIdHash, 0, credId, pubKey);
    // flags at byte 32: UP (0x01) | UV (0x04) | AT (0x40) = 0x45
    expect(data[32]).toBe(0x45);
  });

  it('encodes counter as big-endian uint32', () => {
    const rpIdHash = new Uint8Array(32);
    const data = createAuthenticatorData(rpIdHash, 256);
    // Counter at bytes 33-36
    const counterView = new DataView(data.buffer, data.byteOffset + 33, 4);
    expect(counterView.getUint32(0, false)).toBe(256);
  });

  it('includes attested credential data for registration', () => {
    const rpIdHash = new Uint8Array(32).fill(0x11);
    const credId = new Uint8Array(8).fill(0x22);
    const pubKey = new Uint8Array(5).fill(0x33);
    const data = createAuthenticatorData(rpIdHash, 1, credId, pubKey);

    // Total: 32 + 1 + 4 + 16 (aaguid) + 2 (credIdLen) + 8 (credId) + 5 (pubKey) = 68
    expect(data.length).toBe(68);

    // AAGUID at offset 37 should be 16 zero bytes
    const aaguid = data.slice(37, 53);
    expect(aaguid).toEqual(new Uint8Array(16));

    // credIdLen at offset 53 should be 8 (big-endian)
    const credIdLen = new DataView(data.buffer, data.byteOffset + 53, 2).getUint16(0, false);
    expect(credIdLen).toBe(8);

    // credId at offset 55
    expect(data.slice(55, 63)).toEqual(credId);

    // pubKey at offset 63
    expect(data.slice(63, 68)).toEqual(pubKey);
  });
});

// ─── hashRpId ───────────────────────────────────────────────────────────────────

describe('hashRpId', () => {
  it('returns a 32-byte SHA-256 hash', async () => {
    const hash = await hashRpId('example.com');
    expect(hash).toBeInstanceOf(Uint8Array);
    expect(hash.length).toBe(32);
  });

  it('produces deterministic output for same input', async () => {
    const hash1 = await hashRpId('github.com');
    const hash2 = await hashRpId('github.com');
    expect(base64urlEncode(hash1)).toBe(base64urlEncode(hash2));
  });

  it('produces different output for different inputs', async () => {
    const hash1 = await hashRpId('github.com');
    const hash2 = await hashRpId('gitlab.com');
    expect(base64urlEncode(hash1)).not.toBe(base64urlEncode(hash2));
  });
});

// ─── Key generation & signing ───────────────────────────────────────────────────

describe('generatePasskeyKeyPair', () => {
  it('generates a key pair with all expected fields', async () => {
    const result = await generatePasskeyKeyPair();
    expect(result.keyPair).toBeDefined();
    expect(result.keyPair.publicKey).toBeDefined();
    expect(result.keyPair.privateKey).toBeDefined();
    expect(result.publicKeySPKI).toBeInstanceOf(Uint8Array);
    expect(result.privateKeyPKCS8).toBeInstanceOf(Uint8Array);
    expect(result.publicKeyCOSE).toBeInstanceOf(Uint8Array);
  });

  it('exports SPKI public key (91 bytes for P-256)', async () => {
    const result = await generatePasskeyKeyPair();
    expect(result.publicKeySPKI.length).toBe(91);
  });

  it('generates unique key pairs', async () => {
    const kp1 = await generatePasskeyKeyPair();
    const kp2 = await generatePasskeyKeyPair();
    expect(base64urlEncode(kp1.publicKeySPKI)).not.toBe(base64urlEncode(kp2.publicKeySPKI));
  });
});

describe('spkiToCOSE', () => {
  it('produces a valid COSE key starting with A5 (map of 5)', async () => {
    const { publicKeySPKI } = await generatePasskeyKeyPair();
    const cose = spkiToCOSE(publicKeySPKI);
    // CBOR map(5)
    expect(cose[0]).toBe(0xa5);
  });

  it('includes kty=EC2 (01 02)', async () => {
    const { publicKeySPKI } = await generatePasskeyKeyPair();
    const cose = spkiToCOSE(publicKeySPKI);
    // Bytes 1,2 should be 0x01, 0x02
    expect(cose[1]).toBe(0x01);
    expect(cose[2]).toBe(0x02);
  });

  it('throws on invalid SPKI data', () => {
    const badData = new Uint8Array(50);
    expect(() => spkiToCOSE(badData)).toThrow();
  });
});

describe('importPrivateKey + signChallenge', () => {
  it('imports a PKCS#8 key and signs data', async () => {
    const { privateKeyPKCS8 } = await generatePasskeyKeyPair();
    const privKey = await importPrivateKey(privateKeyPKCS8);
    expect(privKey).toBeDefined();

    const authData = new Uint8Array(37).fill(0x01);
    const clientDataHash = new Uint8Array(32).fill(0x02);
    const signature = await signChallenge(privKey, authData, clientDataHash);

    expect(signature).toBeInstanceOf(Uint8Array);
    expect(signature.length).toBeGreaterThan(0);
  });

  it('produces different signatures for different data', async () => {
    const { privateKeyPKCS8 } = await generatePasskeyKeyPair();
    const privKey = await importPrivateKey(privateKeyPKCS8);

    const authData = new Uint8Array(37).fill(0x01);
    const hash1 = new Uint8Array(32).fill(0x02);
    const hash2 = new Uint8Array(32).fill(0x03);

    const sig1 = await signChallenge(privKey, authData, hash1);
    const sig2 = await signChallenge(privKey, authData, hash2);

    expect(base64urlEncode(sig1)).not.toBe(base64urlEncode(sig2));
  });
});

// ─── Attestation object ─────────────────────────────────────────────────────────

describe('buildAttestationObject', () => {
  it('builds a CBOR map starting with A3 (map of 3)', () => {
    const authData = new Uint8Array(37).fill(0xaa);
    const obj = buildAttestationObject(authData);
    // First byte should be 0xA3 (CBOR map with 3 items)
    expect(obj[0]).toBe(0xa3);
  });

  it('contains the authData bytes', () => {
    const authData = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    const obj = buildAttestationObject(authData);
    // The authData bytes should appear somewhere in the output
    const objStr = Array.from(obj)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    expect(objStr).toContain('deadbeef');
  });
});

// ─── clientDataJSON ─────────────────────────────────────────────────────────────

describe('buildClientDataJSON', () => {
  it('builds valid JSON with correct fields for create', () => {
    const data = buildClientDataJSON(
      'webauthn.create',
      'dGVzdC1jaGFsbGVuZ2U',
      'https://example.com'
    );
    const parsed = JSON.parse(new TextDecoder().decode(data));
    expect(parsed.type).toBe('webauthn.create');
    expect(parsed.challenge).toBe('dGVzdC1jaGFsbGVuZ2U');
    expect(parsed.origin).toBe('https://example.com');
    expect(parsed.crossOrigin).toBe(false);
  });

  it('builds valid JSON with correct fields for get', () => {
    const data = buildClientDataJSON('webauthn.get', 'c29tZS1jaGFsbGVuZ2U', 'https://github.com');
    const parsed = JSON.parse(new TextDecoder().decode(data));
    expect(parsed.type).toBe('webauthn.get');
    expect(parsed.challenge).toBe('c29tZS1jaGFsbGVuZ2U');
    expect(parsed.origin).toBe('https://github.com');
  });
});

// ─── Passkey matching ───────────────────────────────────────────────────────────

describe('findMatchingPasskeys', () => {
  const passkeys: StoredPasskey[] = [
    {
      credentialId: 'cred-github-1',
      rpId: 'github.com',
      rpName: 'GitHub',
      userName: 'alice',
      userDisplayName: 'Alice',
      userId: 'user-1',
      publicKeyAlgorithm: -7,
      publicKeySPKI: 'pk-1',
      counter: 5,
      createdAt: '2025-01-01T00:00:00Z',
    },
    {
      credentialId: 'cred-github-2',
      rpId: 'github.com',
      rpName: 'GitHub',
      userName: 'bob',
      userDisplayName: 'Bob',
      userId: 'user-2',
      publicKeyAlgorithm: -7,
      publicKeySPKI: 'pk-2',
      counter: 3,
      createdAt: '2025-01-02T00:00:00Z',
    },
    {
      credentialId: 'cred-gitlab-1',
      rpId: 'gitlab.com',
      rpName: 'GitLab',
      userName: 'alice',
      userDisplayName: 'Alice',
      userId: 'user-3',
      publicKeyAlgorithm: -7,
      publicKeySPKI: 'pk-3',
      counter: 1,
      createdAt: '2025-01-03T00:00:00Z',
    },
  ];

  it('filters by rpId', () => {
    const result = findMatchingPasskeys(passkeys, 'github.com');
    expect(result).toHaveLength(2);
    expect(result.every((pk) => pk.rpId === 'github.com')).toBe(true);
  });

  it('returns empty for non-matching rpId', () => {
    const result = findMatchingPasskeys(passkeys, 'example.com');
    expect(result).toHaveLength(0);
  });

  it('filters by allowCredentials when provided', () => {
    const result = findMatchingPasskeys(passkeys, 'github.com', [
      { id: 'cred-github-1', type: 'public-key' },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].credentialId).toBe('cred-github-1');
  });

  it('returns empty when allowCredentials has no matches', () => {
    const result = findMatchingPasskeys(passkeys, 'github.com', [
      { id: 'cred-nonexistent', type: 'public-key' },
    ]);
    expect(result).toHaveLength(0);
  });

  it('returns all rpId matches when allowCredentials is empty array', () => {
    const result = findMatchingPasskeys(passkeys, 'github.com', []);
    expect(result).toHaveLength(2);
  });

  it('handles empty passkeys array', () => {
    const result = findMatchingPasskeys([], 'github.com');
    expect(result).toHaveLength(0);
  });

  it('matches multiple allowCredentials', () => {
    const result = findMatchingPasskeys(passkeys, 'github.com', [
      { id: 'cred-github-1', type: 'public-key' },
      { id: 'cred-github-2', type: 'public-key' },
    ]);
    expect(result).toHaveLength(2);
  });
});

// ─── Interceptor script ─────────────────────────────────────────────────────────

describe('getWebAuthnInterceptorScript', () => {
  it('returns a non-empty string', () => {
    const script = getWebAuthnInterceptorScript();
    expect(typeof script).toBe('string');
    expect(script.length).toBeGreaterThan(100);
  });

  it('contains navigator.credentials override code', () => {
    const script = getWebAuthnInterceptorScript();
    expect(script).toContain('navigator.credentials.create');
    expect(script).toContain('navigator.credentials.get');
  });

  it('contains lockbox message types', () => {
    const script = getWebAuthnInterceptorScript();
    expect(script).toContain('lockbox-webauthn-create');
    expect(script).toContain('lockbox-webauthn-get');
    expect(script).toContain('lockbox-webauthn-response');
  });

  it('saves original methods before overriding', () => {
    const script = getWebAuthnInterceptorScript();
    expect(script).toContain('origCreate');
    expect(script).toContain('origGet');
  });

  it('implements fallback to original methods', () => {
    const script = getWebAuthnInterceptorScript();
    // Should call origCreate / origGet when extension declines
    expect(script).toContain('origCreate(options)');
    expect(script).toContain('origGet(options)');
  });

  it('is wrapped in an IIFE for isolation', () => {
    const script = getWebAuthnInterceptorScript();
    expect(script.trimStart().startsWith('(function()')).toBe(true);
    expect(script.trimEnd().endsWith('})();')).toBe(true);
  });
});

// ─── End-to-end key generation + signing flow ───────────────────────────────────

describe('end-to-end passkey flow', () => {
  it('generates a key pair, exports, re-imports, and signs successfully', async () => {
    // 1. Generate key pair (registration)
    const { publicKeySPKI, privateKeyPKCS8, publicKeyCOSE } = await generatePasskeyKeyPair();

    // 2. Credential ID
    const credId = generateCredentialId();
    expect(credId.length).toBe(32);

    // 3. Build authenticator data with attested credential
    const rpIdHash = await hashRpId('example.com');
    const authDataCreate = createAuthenticatorData(rpIdHash, 1, credId, publicKeyCOSE);
    expect(authDataCreate.length).toBeGreaterThan(37);

    // 4. Build attestation object
    const attestObj = buildAttestationObject(authDataCreate);
    expect(attestObj[0]).toBe(0xa3);

    // 5. Now simulate authentication: re-import private key
    const privKey = await importPrivateKey(privateKeyPKCS8);

    // 6. Build assertion authenticator data
    const authDataGet = createAuthenticatorData(rpIdHash, 2);
    expect(authDataGet.length).toBe(37);

    // 7. Build client data and hash it
    const clientDataJSON = buildClientDataJSON(
      'webauthn.get',
      base64urlEncode(crypto.getRandomValues(new Uint8Array(32))),
      'https://example.com'
    );
    const clientDataHash = new Uint8Array(await crypto.subtle.digest('SHA-256', clientDataJSON.buffer as ArrayBuffer));

    // 8. Sign
    const signature = await signChallenge(privKey, authDataGet, clientDataHash);
    expect(signature.length).toBeGreaterThan(0);

    // 9. Verify signature with original public key
    const pubKey = await crypto.subtle.importKey(
      'spki',
      publicKeySPKI.buffer as ArrayBuffer,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
    const signedData = new Uint8Array(authDataGet.length + clientDataHash.length);
    signedData.set(authDataGet, 0);
    signedData.set(clientDataHash, authDataGet.length);

    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      pubKey,
      signature.buffer as ArrayBuffer,
      signedData
    );
    expect(valid).toBe(true);
  });
});
