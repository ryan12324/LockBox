/**
 * Plugin barrel exports — re-exports all Capacitor native plugin bridges.
 */

export { Autofill } from './autofill';
export type {
  AutofillPlugin,
  AutofillIndexCredential,
  AutofillEnabledResult,
  AutofillIndexResult,
  PendingAutofillCredentialSave,
  ExportedAutofillCredentialSave,
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
