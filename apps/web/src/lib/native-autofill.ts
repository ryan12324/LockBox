import type { LoginItem, VaultItem } from '@lockbox/types';

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

export interface NativeAutofillStatus {
  supported: boolean;
  enabled: boolean;
}

export async function getNativeAutofillStatus(): Promise<NativeAutofillStatus> {
  const bridge = getCapacitor();
  if (!bridge) return { supported: false, enabled: false };
  const result = await bridge.nativePromise('Autofill', 'isEnabled', {});
  return { supported: true, enabled: result.enabled === true };
}

export async function openNativeAutofillSettings(): Promise<void> {
  const bridge = getCapacitor();
  if (!bridge) throw new Error('Android autofill is not available on this device');
  await bridge.nativePromise('Autofill', 'requestEnable', {});
}

export async function syncNativeAutofillIndex(items: VaultItem[]): Promise<void> {
  const bridge = getCapacitor();
  if (!bridge) return;

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

  await bridge.nativePromise('Autofill', 'replaceCredentialIndex', { credentials });
}

export async function clearNativeAutofillIndex(): Promise<void> {
  const bridge = getCapacitor();
  if (!bridge) return;
  await bridge.nativePromise('Autofill', 'clearCredentialIndex', {});
}
