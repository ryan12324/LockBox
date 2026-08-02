import type { LoginItem, PasskeyItem, VaultItem } from '@lockbox/types';

interface CapacitorBridge {
  isNativePlatform(): boolean;
  isPluginAvailable(name: string): boolean;
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

export interface NativeAutofillStatus {
  supported: boolean;
  enabled: boolean;
  indexedCredentials?: number;
  indexedAt?: number;
  lastRequestAt?: number;
  lastMatchCount?: number;
  lastError?: string;
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

export async function getNativeAutofillStatus(): Promise<NativeAutofillStatus> {
  const bridge = getCapacitor();
  if (!bridge) return { supported: false, enabled: false };
  const result = await bridge.nativePromise('Autofill', 'isEnabled', {});
  return {
    supported: result.supported !== false,
    enabled: result.enabled === true,
    indexedCredentials: optionalNumber(result.indexedCredentials),
    indexedAt: optionalNumber(result.indexedAt),
    lastRequestAt: optionalNumber(result.lastRequestAt),
    lastMatchCount: optionalNumber(result.lastMatchCount),
    lastError: typeof result.lastError === 'string' ? result.lastError : undefined,
  };
}

export async function openNativeAutofillSettings(): Promise<void> {
  const bridge = getCapacitor();
  if (!bridge) throw new Error('Native autofill is not available on this device');
  await bridge.nativePromise('Autofill', 'requestEnable', {});
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
}

export async function syncNativeAutofillIndex(
  items: VaultItem[],
  accountId: string
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

  const [passwordResult, passkeyResult] = await Promise.all([
    bridge.nativePromise('Autofill', 'replaceCredentialIndex', { credentials }),
    bridge.nativePromise('Autofill', 'replacePasskeyIndex', { passkeys, accountId }),
  ]);
  const result = {
    passwords: optionalNumber(passwordResult.indexed) ?? 0,
    passkeys: optionalNumber(passkeyResult.indexed) ?? 0,
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

export async function clearNativeAutofillIndex(): Promise<void> {
  const bridge = getCapacitor();
  if (!bridge) return;
  await bridge.nativePromise('Autofill', 'clearCredentialIndex', {});
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
