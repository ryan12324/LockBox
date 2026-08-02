import { clearNativeAutofillIndex } from './native-autofill.js';
import { clearNativeBiometric } from './native-biometric.js';

interface CapacitorBridge {
  isNativePlatform(): boolean;
  isPluginAvailable(name: string): boolean;
  nativePromise(
    plugin: string,
    method: string,
    options: Record<string, unknown>
  ): Promise<Record<string, unknown>>;
}

export async function clearNativeDeviceState(): Promise<void> {
  const bridge = (window as unknown as { Capacitor?: CapacitorBridge }).Capacitor;
  const cleanup: Array<Promise<unknown>> = [
    clearNativeAutofillIndex(),
    clearNativeBiometric(),
  ];
  if (
    bridge?.isNativePlatform()
    && bridge.isPluginAvailable('Storage')
  ) {
    cleanup.push(bridge.nativePromise('Storage', 'clearAll', {}));
  }

  const results = await Promise.allSettled(cleanup);
  if (results.some((result) => result.status === 'rejected')) {
    throw new Error('Some protected device data could not be cleared');
  }
}
