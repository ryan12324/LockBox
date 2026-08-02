import {
  decryptString,
  deriveSubKey,
  encryptString,
  fromBase64,
  toBase64,
  toUtf8,
} from '@lockbox/crypto';
import { isNativeLockboxApp } from './server-connection.js';

const STORAGE_KEY = 'authwell-web-prf-unlock-v1';
const RECORD_VERSION = 1;
const PRF_LENGTH = 32;
const VAULT_KEY_LENGTH = 64;
const WEBAUTHN_TIMEOUT_MS = 120_000;

interface WrappedVaultKeyRecord {
  version: typeof RECORD_VERSION;
  scope: string;
  credentialId: string;
  prfSalt: string;
  wrappedVaultKey: string;
  createdAt: string;
}

export interface WebPrfUnlockStatus {
  supported: boolean;
  enrolled: boolean;
  replacementRequired: boolean;
}

export class WebPrfUnlockError extends Error {
  constructor(
    message: string,
    public readonly reason:
      | 'cancelled-or-missing'
      | 'corrupt-envelope'
      | 'prf-unavailable'
      | 'unsupported'
  ) {
    super(message);
    this.name = 'WebPrfUnlockError';
  }
}

function webAuthnContainer(): CredentialsContainer | null {
  if (
    isNativeLockboxApp()
    || !globalThis.isSecureContext
    || typeof PublicKeyCredential !== 'function'
    || !navigator.credentials
  ) {
    return null;
  }
  return navigator.credentials;
}

function bytesFromBufferSource(value: BufferSource): Uint8Array<ArrayBuffer> {
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
}

function toBase64Url(value: BufferSource): string {
  return toBase64(bytesFromBufferSource(value))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid Base64URL data');
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  return new Uint8Array(fromBase64(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')));
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

function isPublicKeyCredential(value: Credential | null): value is PublicKeyCredential {
  return Boolean(
    value
    && value.type === 'public-key'
    && 'rawId' in value
    && 'getClientExtensionResults' in value
    && typeof value.getClientExtensionResults === 'function'
  );
}

function extensionPrfResult(
  credential: PublicKeyCredential
): Uint8Array<ArrayBuffer> | null {
  const first = credential.getClientExtensionResults().prf?.results?.first;
  if (!first) return null;
  const result = bytesFromBufferSource(first);
  return result.length === PRF_LENGTH ? result : null;
}

function parseRecord(value: unknown): WrappedVaultKeyRecord | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (
    record.version !== RECORD_VERSION
    || typeof record.scope !== 'string'
    || record.scope.length < 1
    || record.scope.length > 2_048
    || typeof record.credentialId !== 'string'
    || record.credentialId.length < 1
    || record.credentialId.length > 2_048
    || !/^[A-Za-z0-9_-]+$/.test(record.credentialId)
    || typeof record.prfSalt !== 'string'
    || typeof record.wrappedVaultKey !== 'string'
    || record.wrappedVaultKey.length < 1
    || record.wrappedVaultKey.length > 4_096
    || typeof record.createdAt !== 'string'
  ) {
    return null;
  }

  try {
    if (fromBase64(record.prfSalt).length !== PRF_LENGTH) return null;
  } catch {
    return null;
  }
  return record as unknown as WrappedVaultKeyRecord;
}

function loadRecord(): WrappedVaultKeyRecord | null {
  const serialized = localStorage.getItem(STORAGE_KEY);
  if (!serialized) return null;
  try {
    const record = parseRecord(JSON.parse(serialized));
    if (record) return record;
  } catch {
    // Invalid local metadata must never reach a decoder or WebAuthn request.
  }
  localStorage.removeItem(STORAGE_KEY);
  return null;
}

function wrappingInfo(scope: string, credentialId: string): string {
  return `authwell:web-prf-vault-wrap:v1:${scope}:${credentialId}`;
}

function wrappingAad(scope: string, credentialId: string): Uint8Array {
  return toUtf8(`authwell:web-prf-vault-envelope:v1:${scope}:${credentialId}`);
}

async function getPrfAssertion(
  container: CredentialsContainer,
  credentialId: string,
  prfSalt: Uint8Array<ArrayBuffer>
): Promise<Uint8Array<ArrayBuffer>> {
  let result: Credential | null;
  try {
    result = await container.get({
      publicKey: {
        challenge: randomBytes(32),
        allowCredentials: [{ type: 'public-key', id: fromBase64Url(credentialId) }],
        userVerification: 'required',
        timeout: WEBAUTHN_TIMEOUT_MS,
        extensions: {
          prf: {
            evalByCredential: {
              [credentialId]: { first: prfSalt },
            },
          },
        },
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotSupportedError') {
      throw new WebPrfUnlockError(
        'This browser or passkey cannot provide WebAuthn PRF output. Enter your master password.',
        'prf-unavailable'
      );
    }
    throw new WebPrfUnlockError(
      'Passkey unlock was cancelled or its credential is no longer available. Enter your master password.',
      'cancelled-or-missing'
    );
  }

  if (!isPublicKeyCredential(result) || toBase64Url(result.rawId) !== credentialId) {
    throw new WebPrfUnlockError(
      'The expected passkey was not returned. Enter your master password.',
      'cancelled-or-missing'
    );
  }
  const prfResult = extensionPrfResult(result);
  if (!prfResult) {
    throw new WebPrfUnlockError(
      'This passkey did not provide WebAuthn PRF output. Enter your master password.',
      'prf-unavailable'
    );
  }
  return prfResult;
}

export function getWebPrfUnlockStatus(scope: string): WebPrfUnlockStatus {
  const record = loadRecord();
  return {
    supported: webAuthnContainer() !== null,
    enrolled: record?.scope === scope,
    replacementRequired: Boolean(record && record.scope !== scope),
  };
}

/**
 * Create a local WebAuthn credential and wrap the vault key with its PRF output.
 * The master password and master key are never accepted by this API.
 */
export async function enrollWebPrfUnlock(
  userKey: Uint8Array,
  scope: string,
  accountLabel: string
): Promise<void> {
  const container = webAuthnContainer();
  if (!container) {
    throw new WebPrfUnlockError(
      'Passkey unlock requires WebAuthn in a secure desktop browser.',
      'unsupported'
    );
  }
  if (userKey.length !== VAULT_KEY_LENGTH) throw new Error('The vault key is unavailable');

  const prfSalt = randomBytes(PRF_LENGTH);
  const userId = randomBytes(32);
  let created: Credential | null;
  try {
    created = await container.create({
      publicKey: {
        challenge: randomBytes(32),
        rp: { name: 'Authwell' },
        user: {
          id: userId,
          name: accountLabel.slice(0, 64) || 'Authwell vault',
          displayName: 'Authwell vault unlock',
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          residentKey: 'required',
          userVerification: 'required',
        },
        attestation: 'none',
        timeout: WEBAUTHN_TIMEOUT_MS,
        extensions: { prf: { eval: { first: prfSalt } } },
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotSupportedError') {
      throw new WebPrfUnlockError(
        'This browser or passkey does not support WebAuthn PRF. Continue using your master password.',
        'prf-unavailable'
      );
    }
    throw new WebPrfUnlockError(
      'Passkey setup was cancelled. Your master password is still required.',
      'cancelled-or-missing'
    );
  } finally {
    userId.fill(0);
  }

  if (!isPublicKeyCredential(created)) {
    throw new WebPrfUnlockError('The browser did not create a usable passkey.', 'unsupported');
  }
  const extension = created.getClientExtensionResults().prf;
  if (extension?.enabled !== true) {
    throw new WebPrfUnlockError(
      'That passkey does not support WebAuthn PRF. Continue using your master password.',
      'prf-unavailable'
    );
  }

  const credentialId = toBase64Url(created.rawId);
  const prfResult = extensionPrfResult(created)
    ?? await getPrfAssertion(container, credentialId, prfSalt);

  const wrappingKey = await deriveSubKey(
    prfResult,
    wrappingInfo(scope, credentialId),
    32,
    prfSalt
  );
  try {
    const record: WrappedVaultKeyRecord = {
      version: RECORD_VERSION,
      scope,
      credentialId,
      prfSalt: toBase64(prfSalt),
      wrappedVaultKey: await encryptString(
        toBase64(userKey),
        wrappingKey,
        wrappingAad(scope, credentialId)
      ),
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } finally {
    wrappingKey.fill(0);
    prfResult.fill(0);
    prfSalt.fill(0);
  }
}

export async function unlockWithWebPrf(scope: string): Promise<Uint8Array | null> {
  const container = webAuthnContainer();
  const record = loadRecord();
  if (!container || !record || record.scope !== scope) return null;

  const prfSalt = new Uint8Array(fromBase64(record.prfSalt));
  const prfResult = await getPrfAssertion(
    container,
    record.credentialId,
    prfSalt
  );
  const wrappingKey = await deriveSubKey(
    prfResult,
    wrappingInfo(scope, record.credentialId),
    32,
    prfSalt
  );
  try {
    const encoded = await decryptString(
      record.wrappedVaultKey,
      wrappingKey,
      wrappingAad(scope, record.credentialId)
    );
    const userKey = fromBase64(encoded);
    if (userKey.length !== VAULT_KEY_LENGTH) throw new Error('Invalid vault key length');
    return userKey;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    throw new WebPrfUnlockError(
      'The wrapped vault key is no longer valid. Enter your master password and enable passkey unlock again.',
      'corrupt-envelope'
    );
  } finally {
    wrappingKey.fill(0);
    prfResult.fill(0);
    prfSalt.fill(0);
  }
}

/** Remove the local wrapper. Web browsers do not expose credential deletion. */
export function clearWebPrfUnlock(): void {
  localStorage.removeItem(STORAGE_KEY);
}
