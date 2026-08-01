/**
 * Autofill Plugin — TypeScript bridge for native Android AutofillService.
 *
 * The native AutofillService runs in a separate process from the Capacitor WebView.
 * Communication goes through the Room DB as a shared bridge.
 */

import { registerPlugin } from '@capacitor/core';

/** Decrypted login fields sent to native code while the vault is unlocked. */
export interface AutofillIndexCredential {
  id: string;
  name: string;
  username: string;
  password: string;
  uris: string[];
}

/** Result from checking if autofill service is enabled */
export interface AutofillEnabledResult {
  enabled: boolean;
}

export interface AutofillIndexResult {
  indexed: number;
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

/** Decrypted passkey material accepted only during an unlocked vault refresh. */
export interface AutofillPasskeyIndexEntry extends AutofillPasskeyEntry {
  userId: string;
  privateKey: string;
  createdAt: string;
}

/**
 * AutofillPlugin interface — defines the contract between TypeScript and native Kotlin.
 *
 * Methods:
 * - isEnabled: Checks if LockboxAutofillService is the active autofill provider
 * - requestEnable: Opens Android Settings to let user enable LockboxAutofillService
 * - replaceCredentialIndex: Atomically rebuilds the biometric-gated local index
 * - clearCredentialIndex: Clears account data on logout
 */
export interface AutofillPlugin {
  /** Check if LockboxAutofillService is the active autofill provider */
  isEnabled(): Promise<AutofillEnabledResult>;

  /** Open Android Settings to enable LockboxAutofillService */
  requestEnable(): Promise<void>;

  /** Rebuild the native index. Native code encrypts every credential immediately. */
  replaceCredentialIndex(options: {
    credentials: AutofillIndexCredential[];
  }): Promise<AutofillIndexResult>;

  /** Rebuild the biometric-gated passkey index from encrypted vault items. */
  replacePasskeyIndex(options: {
    passkeys: AutofillPasskeyIndexEntry[];
  }): Promise<AutofillIndexResult>;

  /** Remove every indexed credential, used when logging out. */
  clearCredentialIndex(): Promise<void>;

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
