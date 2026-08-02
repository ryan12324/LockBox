/**
 * Autofill Plugin — TypeScript bridge for Android AutofillService and the iOS AutoFill credential provider.
 *
 * The native credential provider runs outside the Capacitor WebView process.
 * Communication goes through platform-shared encrypted storage.
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
  supported?: boolean;
  enabled: boolean;
  biometricsReady?: boolean;
  indexedCredentials?: number;
  indexedAt?: number | null;
  lastRequestAt?: number | null;
  lastMatchCount?: number | null;
  lastError?: string | null;
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
  id: string;
  userId: string;
  publicKey: string;
  privateKey: string;
  createdAt: string;
}

/** Metadata for an Android AutoFill save waiting for encrypted-vault import. */
export interface PendingAutofillCredentialSave {
  id: string;
  createdAt: string;
}

/** Biometrically decrypted fields from an Android AutoFill save request. */
export interface ExportedAutofillCredentialSave extends PendingAutofillCredentialSave {
  name: string;
  username: string;
  password: string;
  uri: string;
}

/**
 * AutofillPlugin interface — defines the contract between TypeScript and native code.
 *
 * Methods:
 * - isEnabled: Checks if Authwell is enabled as a platform autofill provider
 * - requestEnable: Opens the platform credential-provider settings
 * - requestBiometricEnrollment: Opens Android's biometric enrollment settings
 * - replaceCredentialIndex: Atomically rebuilds the biometric-gated local index
 * - clearCredentialIndex: Clears account data on logout
 */
export interface AutofillPlugin {
  /** Check if Authwell is enabled as the platform autofill provider */
  isEnabled(): Promise<AutofillEnabledResult>;

  /** Open platform settings so the user can enable Authwell AutoFill */
  requestEnable(): Promise<void>;

  /** Open device settings so Android can enroll a strong biometric. */
  requestBiometricEnrollment(): Promise<void>;

  /** Rebuild the native index. Native code encrypts every credential immediately. */
  replaceCredentialIndex(options: {
    credentials: AutofillIndexCredential[];
    accountId: string;
    saveAuthorization: string;
  }): Promise<AutofillIndexResult>;

  /** Rebuild the biometric-gated passkey index from encrypted vault items. */
  replacePasskeyIndex(options: {
    passkeys: AutofillPasskeyIndexEntry[];
    accountId: string;
  }): Promise<AutofillIndexResult>;

  /** Remove every indexed credential, used when logging out. */
  clearCredentialIndex(): Promise<void>;

  /** Find matching passkeys for a website URI in native encrypted storage */
  getPasskeysForUri(options: { uri: string }): Promise<AutofillPasskeysResult>;

  /** List Android-accepted password saves awaiting encrypted-vault import. */
  getPendingCredentialSaves(): Promise<{ saves: PendingAutofillCredentialSave[] }>;

  /** Export one pending password save after biometric approval. */
  exportPendingCredentialSave(options: {
    id: string;
    authorization: string;
  }): Promise<ExportedAutofillCredentialSave>;

  /** Acknowledge a pending password save after its encrypted vault write succeeds. */
  markCredentialSaveSynced(options: { id: string; authorization: string }): Promise<void>;
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
