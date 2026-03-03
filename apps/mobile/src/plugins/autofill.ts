/**
 * Autofill Plugin — TypeScript bridge for native Android AutofillService.
 *
 * The native AutofillService runs in a separate process from the Capacitor WebView.
 * Communication goes through the Room DB as a shared bridge.
 */

import { registerPlugin } from '@capacitor/core';

/** Credential data returned by autofill lookup */
export interface AutofillCredential {
  id: string;
  username: string;
  uri: string;
}

/** Result from checking if autofill service is enabled */
export interface AutofillEnabledResult {
  enabled: boolean;
}

/** Result from listing saved credentials for a URI */
export interface AutofillCredentialsResult {
  credentials: AutofillCredential[];
}

/** Passkey metadata returned by autofill passkey lookup */
export interface AutofillPasskeyEntry {
  credentialId: string;
  rpId: string;
  rpName: string;
  userName: string;
  userDisplayName: string;
}

/** Result from listing passkeys for a URI */
export interface AutofillPasskeysResult {
  passkeys: AutofillPasskeyEntry[];
}

/**
 * AutofillPlugin interface — defines the contract between TypeScript and native Kotlin.
 *
 * Methods:
 * - isEnabled: Checks if LockboxAutofillService is the active autofill provider
 * - requestEnable: Opens Android Settings to let user enable LockboxAutofillService
 * - getCredentialsForUri: Finds matching credentials for a given website URI
 * - saveCredential: Stores a new credential (encrypted blob) for autofill use
 * - removeCredential: Removes a credential from the autofill-accessible store
 */
export interface AutofillPlugin {
  /** Check if LockboxAutofillService is the active autofill provider */
  isEnabled(): Promise<AutofillEnabledResult>;

  /** Open Android Settings to enable LockboxAutofillService */
  requestEnable(): Promise<void>;

  /** Find matching credentials for a website URI */
  getCredentialsForUri(options: { uri: string }): Promise<AutofillCredentialsResult>;

  /** Store a credential for autofill use (encrypted blob only) */
  saveCredential(options: { id: string; encryptedData: string; uri: string }): Promise<void>;

  /** Remove a credential from the autofill-accessible store */
  removeCredential(options: { id: string }): Promise<void>;

  /** Find matching passkeys for a website URI (queries Room DB by rpId) */
  getPasskeysForUri(options: { uri: string }): Promise<AutofillPasskeysResult>;
}

const Autofill = registerPlugin<AutofillPlugin>('Autofill');

export async function getPasskeysForUri(uri: string): Promise<AutofillPasskeyEntry[]> {
  try {
    const result = await Autofill.getPasskeysForUri({ uri });
    return result.passkeys;
  } catch (err) {
    console.error('Autofill: failed to get passkeys for URI', err);
    return [];
  }
}

export { Autofill };
