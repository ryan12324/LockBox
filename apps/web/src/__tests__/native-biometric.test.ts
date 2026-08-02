import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toBase64 } from '@lockbox/crypto';
import {
  authenticateNativeBiometric,
  clearNativeBiometric,
  enrollNativeBiometric,
  getNativeBiometricStatus,
} from '../lib/native-biometric.js';
import { clearNativeDeviceState } from '../lib/native-device-state.js';

const SCOPE_KEY = 'authwell-native-biometric-scope-v1';

function installBridge(options: {
  enrolled?: boolean;
  userKey?: Uint8Array;
} = {}) {
  let enrolled = options.enrolled ?? false;
  const userKey = options.userKey ?? new Uint8Array(64).fill(7);
  const nativePromise = vi.fn(async (plugin: string, method: string) => {
    if (plugin === 'Biometric' && method === 'checkAvailability') {
      return { available: true, biometryType: 'face' };
    }
    if (plugin === 'Biometric' && method === 'isEnrolled') return { enrolled };
    if (plugin === 'Biometric' && method === 'enrollBiometric') {
      enrolled = true;
      return {};
    }
    if (plugin === 'Biometric' && method === 'unenroll') {
      enrolled = false;
      return {};
    }
    if (plugin === 'Biometric' && method === 'authenticate') {
      return { success: true, userKey: toBase64(userKey) };
    }
    return {};
  });
  Object.assign(window, {
    Capacitor: {
      isNativePlatform: () => true,
      isPluginAvailable: () => true,
      nativePromise,
    },
  });
  return nativePromise;
}

describe('native biometric integration', () => {
  beforeEach(() => {
    localStorage.clear();
    Reflect.deleteProperty(window, 'Capacitor');
  });

  it('reports Face ID enrollment only for the current account scope', async () => {
    installBridge({ enrolled: true });
    localStorage.setItem(SCOPE_KEY, 'server#account-a');

    await expect(getNativeBiometricStatus('server#account-a')).resolves.toMatchObject({
      supported: true,
      enrolled: true,
      replacementRequired: false,
      biometryType: 'face',
    });
    await expect(getNativeBiometricStatus('server#account-b')).resolves.toMatchObject({
      enrolled: false,
      replacementRequired: true,
    });
  });

  it('replaces stale native enrollment before protecting the current key', async () => {
    const nativePromise = installBridge({ enrolled: true });
    const userKey = new Uint8Array(64).fill(9);

    await enrollNativeBiometric(userKey, 'server#account-b');

    expect(nativePromise).toHaveBeenCalledWith('Biometric', 'unenroll', {});
    expect(nativePromise).toHaveBeenCalledWith('Biometric', 'enrollBiometric', {
      userKey: toBase64(userKey),
    });
    expect(localStorage.getItem(SCOPE_KEY)).toBe('server#account-b');
  });

  it('does not release a key for another account scope', async () => {
    const nativePromise = installBridge({ enrolled: true });
    localStorage.setItem(SCOPE_KEY, 'server#account-a');

    await expect(authenticateNativeBiometric('server#account-b')).resolves.toBeNull();
    expect(nativePromise).not.toHaveBeenCalledWith(
      'Biometric',
      'authenticate',
      expect.anything()
    );
  });

  it('returns the 64-byte key after native biometric authentication', async () => {
    const userKey = new Uint8Array(64).fill(11);
    installBridge({ enrolled: true, userKey });
    localStorage.setItem(SCOPE_KEY, 'server#account-a');

    await expect(authenticateNativeBiometric('server#account-a')).resolves.toEqual(userKey);
  });

  it('clears biometric, AutoFill, and offline native state on logout', async () => {
    const nativePromise = installBridge({ enrolled: true });
    localStorage.setItem(SCOPE_KEY, 'server#account-a');

    await clearNativeDeviceState();

    expect(nativePromise).toHaveBeenCalledWith('Autofill', 'clearCredentialIndex', {});
    expect(nativePromise).toHaveBeenCalledWith('Biometric', 'unenroll', {});
    expect(nativePromise).toHaveBeenCalledWith('Storage', 'clearAll', {});
    expect(localStorage.getItem(SCOPE_KEY)).toBeNull();
  });

  it('clears the account scope even when native unenrollment fails', async () => {
    const nativePromise = installBridge({ enrolled: true });
    nativePromise.mockRejectedValueOnce(new Error('Keychain unavailable'));
    localStorage.setItem(SCOPE_KEY, 'server#account-a');

    await expect(clearNativeBiometric()).rejects.toThrow('Keychain unavailable');
    expect(localStorage.getItem(SCOPE_KEY)).toBeNull();
  });
});
