import type { LoginItem, PasskeyItem, VaultItem } from '@lockbox/types';
import { toBase64, toUtf8 } from '@lockbox/crypto';

interface CapacitorBridge {
  isNativePlatform(): boolean;
  isPluginAvailable(name: string): boolean;
  getPlatform?(): string;
  nativePromise(
    plugin: string,
    method: string,
    options: Record<string, unknown>
  ): Promise<Record<string, unknown>>;
}

function getCapacitor(): CapacitorBridge | null {
  const bridge = (window as unknown as { Capacitor?: CapacitorBridge }).Capacitor;
  if (!bridge?.isNativePlatform() || !bridge.isPluginAvailable('Autofill')) return null;
  return bridge;
}

function getCredentialManager(): CapacitorBridge | null {
  const bridge = (window as unknown as { Capacitor?: CapacitorBridge }).Capacitor;
  if (!bridge?.isNativePlatform() || !bridge.isPluginAvailable('CredentialManager')) return null;
  return bridge;
}

function getAndroidAutofill(): CapacitorBridge | null {
  const bridge = getCapacitor();
  if (!bridge) return null;
  return bridge.getPlatform?.() && bridge.getPlatform() !== 'android' ? null : bridge;
}

export interface NativeAutofillStatus {
  supported: boolean;
  enabled: boolean;
  biometricsReady?: boolean;
  indexedCredentials?: number;
  indexedAt?: number;
  lastRequestAt?: number;
  lastMatchCount?: number;
  lastError?: string;
  passwordSaveSupported?: boolean;
  oneTimeCodeSupported?: boolean;
}

export interface NativePasskeyStatus {
  supported: boolean;
  enabled: boolean;
}

export interface PendingNativePasskey {
  credentialId: string;
  vaultItemId: string;
  rpId: string;
  userName: string;
}

export interface ExportedNativePasskey extends PendingNativePasskey {
  rpName: string;
  userId: string;
  userDisplayName: string;
  publicKey: string;
  privateKey: string;
  createdAt: string;
}

export interface PendingNativeCredentialSave {
  id: string;
  createdAt: string;
}

export interface ExportedNativeCredentialSave extends PendingNativeCredentialSave {
  name: string;
  username: string;
  password: string;
  uri: string;
}

export async function getNativeAutofillStatus(): Promise<NativeAutofillStatus> {
  const bridge = getCapacitor();
  if (!bridge) return { supported: false, enabled: false };
  const result = await bridge.nativePromise('Autofill', 'isEnabled', {});
  return {
    supported: result.supported !== false,
    enabled: result.enabled === true,
    biometricsReady:
      typeof result.biometricsReady === 'boolean' ? result.biometricsReady : undefined,
    indexedCredentials: optionalNumber(result.indexedCredentials),
    indexedAt: optionalNumber(result.indexedAt),
    lastRequestAt: optionalNumber(result.lastRequestAt),
    lastMatchCount: optionalNumber(result.lastMatchCount),
    lastError: typeof result.lastError === 'string' ? result.lastError : undefined,
    passwordSaveSupported:
      typeof result.passwordSaveSupported === 'boolean' ? result.passwordSaveSupported : undefined,
    oneTimeCodeSupported:
      typeof result.oneTimeCodeSupported === 'boolean' ? result.oneTimeCodeSupported : undefined,
  };
}

export async function openNativeAutofillSettings(): Promise<void> {
  const bridge = getCapacitor();
  if (!bridge) throw new Error('Native autofill is not available on this device');
  await bridge.nativePromise('Autofill', 'requestEnable', {});
}

export async function openNativeBiometricEnrollment(): Promise<void> {
  const bridge = getCapacitor();
  if (!bridge) throw new Error('Native biometric settings are not available on this device');
  await bridge.nativePromise('Autofill', 'requestBiometricEnrollment', {});
}

/** Notify Android that an app-owned WebView form has completed so SaveInfo can be handled. */
export async function commitNativeAutofillSession(): Promise<void> {
  const bridge = getAndroidAutofill();
  if (!bridge) return;
  await bridge.nativePromise('Autofill', 'commitActiveSession', {});
}

export async function getNativePasskeyStatus(): Promise<NativePasskeyStatus> {
  const bridge = getCredentialManager();
  if (!bridge) return { supported: false, enabled: false };
  const result = await bridge.nativePromise('CredentialManager', 'isProviderEnabled', {});
  return { supported: result.available === true, enabled: result.enabled === true };
}

export async function openNativePasskeySettings(): Promise<void> {
  const bridge = getCredentialManager();
  if (!bridge) throw new Error('Native passkeys are not available on this device');
  await bridge.nativePromise('CredentialManager', 'requestEnableProvider', {});
}

export interface NativeAutofillIndexResult {
  passwords: number;
  passkeys: number;
  oneTimeCodes?: number;
}

export async function syncNativeAutofillIndex(
  items: VaultItem[],
  accountId: string,
  userKey: Uint8Array
): Promise<NativeAutofillIndexResult> {
  const bridge = getCapacitor();
  if (!bridge) return { passwords: 0, passkeys: 0 };

  const credentials = items
    .filter((item): item is LoginItem => item.type === 'login')
    .filter((item) => Boolean(item.password) && (item.uris?.length ?? 0) > 0)
    .map((item) => ({
      id: item.id,
      name: item.name,
      username: item.username ?? '',
      password: item.password,
      uris: item.uris ?? [],
    }));

  const passkeys = items
    .filter((item): item is PasskeyItem => item.type === 'passkey')
    .filter((item) => Boolean(item.privateKey))
    .map((item) => ({
      id: item.id,
      credentialId: item.credentialId,
      rpId: item.rpId,
      rpName: item.rpName,
      userName: item.userName,
      userDisplayName: item.userName,
      userId: item.userId,
      publicKey: item.publicKey,
      privateKey: item.privateKey,
      createdAt: item.createdAt,
    }));

  const totps = items
    .filter((item): item is LoginItem => item.type === 'login')
    .filter((item) => Boolean(item.totp) && (item.uris?.length ?? 0) > 0)
    .map((item) => ({
      id: item.id,
      name: item.name,
      username: item.username ?? '',
      totp: item.totp,
      uris: item.uris ?? [],
    }));

  const saveAuthorization = await deriveNativeCredentialSaveAuthorization(userKey, accountId);

  // Both indexes share one biometric-bound device key. Serialize their first
  // refresh so concurrent calls cannot race while creating that key.
  const passwordResult = await bridge.nativePromise(
    'Autofill',
    'replaceCredentialIndex',
    { credentials, accountId, saveAuthorization }
  );
  const passkeyResult = await bridge.nativePromise(
    'Autofill',
    'replacePasskeyIndex',
    { passkeys, accountId }
  );
  const ios = bridge.getPlatform?.() === 'ios';
  const totpResult = ios
    ? await bridge.nativePromise('Autofill', 'replaceTotpIndex', { totps, accountId })
    : null;
  const result = {
    passwords: optionalNumber(passwordResult.indexed) ?? 0,
    passkeys: optionalNumber(passkeyResult.indexed) ?? 0,
    ...(ios ? { oneTimeCodes: optionalNumber(totpResult?.indexed) ?? 0 } : {}),
  };
  window.dispatchEvent(new CustomEvent('authwell:native-autofill-updated', { detail: result }));
  return result;
}

export async function getPendingNativePasskeys(): Promise<PendingNativePasskey[]> {
  const bridge = getCredentialManager();
  if (!bridge) return [];
  const result = await bridge.nativePromise('CredentialManager', 'getPendingPasskeys', {});
  return Array.isArray(result.passkeys) ? (result.passkeys as PendingNativePasskey[]) : [];
}

export async function exportPendingNativePasskey(
  credentialId: string
): Promise<ExportedNativePasskey> {
  const bridge = getCredentialManager();
  if (!bridge) throw new Error('Native passkey sync is not available on this device');
  return bridge.nativePromise('CredentialManager', 'exportPendingPasskey', {
    credentialId,
  }) as unknown as Promise<ExportedNativePasskey>;
}

export async function markNativePasskeySynced(
  credentialId: string,
  vaultItemId: string
): Promise<void> {
  const bridge = getCredentialManager();
  if (!bridge) return;
  await bridge.nativePromise('CredentialManager', 'markPasskeySynced', {
    credentialId,
    vaultItemId,
  });
}

export async function getPendingNativeCredentialSaves(): Promise<PendingNativeCredentialSave[]> {
  const bridge = getCapacitor();
  if (!bridge) return [];
  const result = await bridge.nativePromise('Autofill', 'getPendingCredentialSaves', {});
  return Array.isArray(result.saves) ? (result.saves as PendingNativeCredentialSave[]) : [];
}

export async function exportPendingNativeCredentialSave(
  id: string,
  authorization: string
): Promise<ExportedNativeCredentialSave> {
  const bridge = getCapacitor();
  if (!bridge) throw new Error('Native saved-login import is not available on this device');
  return bridge.nativePromise('Autofill', 'exportPendingCredentialSave', {
    id,
    authorization,
  }) as unknown as Promise<ExportedNativeCredentialSave>;
}

export async function markNativeCredentialSaveSynced(
  id: string,
  authorization: string
): Promise<void> {
  const bridge = getCapacitor();
  if (!bridge) return;
  await bridge.nativePromise('Autofill', 'markCredentialSaveSynced', { id, authorization });
}

export interface PendingNativeTotpSetup {
  id: string;
  createdAt: string;
  scheme: 'otpauth' | 'otpauth-migration';
}

export interface ExportedNativeTotpSetup extends PendingNativeTotpSetup {
  uri: string;
}

export async function getPendingNativeTotpSetups(): Promise<PendingNativeTotpSetup[]> {
  const bridge = getCapacitor();
  if (!bridge || bridge.getPlatform?.() !== 'ios') return [];
  const result = await bridge.nativePromise('Autofill', 'getPendingTotpSetups', {});
  return Array.isArray(result.setups) ? result.setups as PendingNativeTotpSetup[] : [];
}

export async function exportPendingNativeTotpSetup(
  id: string,
  authorization: string
): Promise<ExportedNativeTotpSetup> {
  const bridge = getCapacitor();
  if (!bridge || bridge.getPlatform?.() !== 'ios') {
    throw new Error('Verification-code setup is not available on this device');
  }
  return bridge.nativePromise('Autofill', 'exportPendingTotpSetup', {
    id,
    authorization,
  }) as unknown as Promise<ExportedNativeTotpSetup>;
}

export async function markNativeTotpSetupHandled(
  id: string,
  authorization: string
): Promise<void> {
  const bridge = getCapacitor();
  if (!bridge || bridge.getPlatform?.() !== 'ios') return;
  await bridge.nativePromise('Autofill', 'markTotpSetupHandled', { id, authorization });
}

/** Derive an account-scoped proof without exposing or persisting the vault key. */
export async function deriveNativeCredentialSaveAuthorization(
  userKey: Uint8Array,
  accountId: string
): Promise<string> {
  const keyBytes = new Uint8Array(userKey.byteLength);
  keyBytes.set(userKey);
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    keyBytes.buffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  keyBytes.fill(0);
  const messageBytes = toUtf8(`authwell:android-pending-save:v1\u0000${accountId}`);
  const message = new Uint8Array(messageBytes.byteLength);
  message.set(messageBytes);
  const proof = new Uint8Array(
    await crypto.subtle.sign(
      'HMAC',
      hmacKey,
      message.buffer
    )
  );
  message.fill(0);
  return toBase64(proof)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

export async function clearNativeAutofillIndex(): Promise<void> {
  const bridge = getCapacitor();
  if (!bridge) return;
  await bridge.nativePromise('Autofill', 'clearCredentialIndex', {});
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
