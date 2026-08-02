import { fromBase64, toBase64 } from '@lockbox/crypto';
import { getServerConnection } from './server-connection.js';

interface CapacitorBridge {
  isNativePlatform(): boolean;
  isPluginAvailable(name: string): boolean;
  nativePromise(
    plugin: string,
    method: string,
    options: Record<string, unknown>
  ): Promise<Record<string, unknown>>;
}

export interface NativeBiometricStatus {
  supported: boolean;
  enrolled: boolean;
  replacementRequired: boolean;
  biometryType: 'fingerprint' | 'face' | 'iris' | 'none';
}

const SCOPE_STORAGE_KEY = 'authwell-native-biometric-scope-v1';

function getBridge(): CapacitorBridge | null {
  const bridge = (window as unknown as { Capacitor?: CapacitorBridge }).Capacitor;
  if (!bridge?.isNativePlatform() || !bridge.isPluginAvailable('Biometric')) return null;
  return bridge;
}

export function nativeBiometricScope(accountId: string): string {
  const apiOrigin = getServerConnection()?.apiBaseUrl ?? window.location.origin;
  return `${apiOrigin.replace(/\/$/, '')}#${accountId}`;
}

export async function getNativeBiometricStatus(
  scope: string
): Promise<NativeBiometricStatus> {
  const bridge = getBridge();
  if (!bridge) {
    return {
      supported: false,
      enrolled: false,
      replacementRequired: false,
      biometryType: 'none',
    };
  }

  const availability = await bridge.nativePromise('Biometric', 'checkAvailability', {});
  const supported = availability.available === true;
  const biometryType = normalizeBiometryType(availability.biometryType);
  if (!supported) {
    return { supported, enrolled: false, replacementRequired: false, biometryType };
  }

  const enrollment = await bridge.nativePromise('Biometric', 'isEnrolled', {});
  const nativeEnrolled = enrollment.enrolled === true;
  const savedScope = localStorage.getItem(SCOPE_STORAGE_KEY);
  return {
    supported,
    enrolled: nativeEnrolled && savedScope === scope,
    replacementRequired: nativeEnrolled && savedScope !== scope,
    biometryType,
  };
}

export async function enrollNativeBiometric(
  userKey: Uint8Array,
  scope: string
): Promise<void> {
  const bridge = getBridge();
  if (!bridge) throw new Error('Biometric unlock is not available on this device');
  if (userKey.length !== 64) throw new Error('The vault key is unavailable');

  const enrollment = await bridge.nativePromise('Biometric', 'isEnrolled', {});
  if (enrollment.enrolled === true) {
    await bridge.nativePromise('Biometric', 'unenroll', {});
  }
  await bridge.nativePromise('Biometric', 'enrollBiometric', {
    userKey: toBase64(userKey),
  });
  localStorage.setItem(SCOPE_STORAGE_KEY, scope);
}

export async function authenticateNativeBiometric(
  scope: string,
  reason = 'Unlock Authwell'
): Promise<Uint8Array | null> {
  const bridge = getBridge();
  if (!bridge || localStorage.getItem(SCOPE_STORAGE_KEY) !== scope) return null;
  const result = await bridge.nativePromise('Biometric', 'authenticate', { reason });
  if (result.success !== true || typeof result.userKey !== 'string') return null;
  const userKey = fromBase64(result.userKey);
  return userKey.length === 64 ? userKey : null;
}

export async function clearNativeBiometric(): Promise<void> {
  const bridge = getBridge();
  try {
    if (bridge) await bridge.nativePromise('Biometric', 'unenroll', {});
  } finally {
    localStorage.removeItem(SCOPE_STORAGE_KEY);
  }
}

function normalizeBiometryType(value: unknown): NativeBiometricStatus['biometryType'] {
  return value === 'fingerprint' || value === 'face' || value === 'iris'
    ? value
    : 'none';
}
