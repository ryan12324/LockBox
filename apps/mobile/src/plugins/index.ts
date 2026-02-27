/**
 * Plugin barrel exports — re-exports all Capacitor native plugin bridges.
 */

export { Autofill } from './autofill';
export type {
  AutofillPlugin,
  AutofillCredential,
  AutofillEnabledResult,
  AutofillCredentialsResult,
} from './autofill';

export { Biometric } from './biometric';
export type {
  BiometricPlugin,
  BiometricAvailabilityResult,
  BiometricAuthResult,
  BiometricEnrolledResult,
} from './biometric';

export { Storage } from './storage';
export type {
  StoragePlugin,
  StoredVaultItem,
  StorageListResult,
  StorageGetResult,
  StoragePendingResult,
  StorageTimestampResult,
  SyncStatus,
} from './storage';

export { QRScanner } from './qr-scanner';
export type {
  QRScannerPlugin,
  QRScanResult,
  QRScannerAvailabilityResult,
} from './qr-scanner';

export { encryptFile, decryptFile } from './file-crypto';

export {
  CredentialManager,
  isCredentialManagerAvailable,
  createPasskey,
  authenticateWithPasskey,
  getStoredPasskeys,
  deletePasskey,
  base64urlToUint8Array,
  uint8ArrayToBase64url,
  isAndroid14OrHigher,
  formatCredentialId,
  getPasskeyDisplayName,
} from './credential-manager';
export type {
  CredentialManagerPlugin,
  PasskeyCreationOptions,
  PasskeyCreationResult,
  PasskeyAuthenticationOptions,
  PasskeyAuthenticationResult,
  StoredPasskeyInfo,
} from './credential-manager';
