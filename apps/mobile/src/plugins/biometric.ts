/**
 * Biometric Plugin — TypeScript bridge for Android BiometricPrompt/Keystore and iOS LocalAuthentication/Keychain.
 *
 * Uses Android Keystore or iOS Keychain access control to protect the user key.
 * Platform-native biometric UI authorizes access to the protected user key.
 */

import { registerPlugin } from '@capacitor/core';

/** Biometric availability check result */
export interface BiometricAvailabilityResult {
  available: boolean;
  biometryType: 'fingerprint' | 'face' | 'iris' | 'none';
}

/** Result from biometric authentication */
export interface BiometricAuthResult {
  success: boolean;
  /** Base64-encoded user key — only present on successful biometric unlock */
  userKey?: string;
}

/** Result from checking if biometric unlock is enrolled */
export interface BiometricEnrolledResult {
  enrolled: boolean;
}

/**
 * BiometricPlugin interface — defines the contract between TypeScript and native code.
 *
 * Flow:
 * 1. checkAvailability() → verify device supports biometrics
 * 2. enrollBiometric({ userKey }) → protect the key with device biometrics
 * 3. authenticate({ reason }) → native biometric prompt → release the user key
 * 4. unenroll() → remove the protected native key
 */
export interface BiometricPlugin {
  /** Check if device supports biometric authentication */
  checkAvailability(): Promise<BiometricAvailabilityResult>;

  /** Check if biometric unlock has been enrolled for this app */
  isEnrolled(): Promise<BiometricEnrolledResult>;

  /**
   * Enroll biometric unlock with platform-protected, biometric-bound storage.
   */
  enrollBiometric(options: { userKey: string }): Promise<void>;

  /**
   * Authenticate with biometrics through the native platform prompt.
   * Returns the decrypted user key on success.
   */
  authenticate(options: { reason: string }): Promise<BiometricAuthResult>;

  /** Remove biometric enrollment and its protected native key */
  unenroll(): Promise<void>;
}

const Biometric = registerPlugin<BiometricPlugin>('Biometric');

export { Biometric };
