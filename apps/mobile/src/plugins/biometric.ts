/**
 * Biometric Plugin — TypeScript bridge for Android BiometricPrompt + Keystore.
 *
 * Uses Android Keystore to wrap the user key with a biometric-bound key.
 * BiometricPrompt (NOT deprecated FingerprintManager) handles authentication.
 * The encrypted user key is stored in SharedPreferences; only biometric auth can decrypt it.
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
 * BiometricPlugin interface — defines the contract between TypeScript and native Kotlin.
 *
 * Flow:
 * 1. checkAvailability() → verify device supports biometrics
 * 2. enrollBiometric({ userKey }) → wrap user key with Keystore biometric key
 * 3. authenticate({ reason }) → BiometricPrompt → unwrap user key
 * 4. unenroll() → remove biometric key from Keystore
 */
export interface BiometricPlugin {
  /** Check if device supports biometric authentication */
  checkAvailability(): Promise<BiometricAvailabilityResult>;

  /** Check if biometric unlock has been enrolled for this app */
  isEnrolled(): Promise<BiometricEnrolledResult>;

  /**
   * Enroll biometric unlock — wraps user key with a Keystore-backed
   * biometric-bound key. Triggers BiometricPrompt for initial enrollment.
   */
  enrollBiometric(options: { userKey: string }): Promise<void>;

  /**
   * Authenticate with biometrics — unwraps user key using BiometricPrompt.
   * Returns the decrypted user key on success.
   */
  authenticate(options: { reason: string }): Promise<BiometricAuthResult>;

  /** Remove biometric enrollment — deletes key from Android Keystore */
  unenroll(): Promise<void>;
}

const Biometric = registerPlugin<BiometricPlugin>('Biometric');

export { Biometric };
