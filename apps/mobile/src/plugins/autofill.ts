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

/**
 * AutofillPlugin interface — defines the contract between TypeScript and native code.
 *
 * Methods:
 * - isEnabled: Checks if Authwell is enabled as a platform autofill provider
 * - requestEnable: Opens the platform credential-provider settings
 * - replaceCredentialIndex: Atomically rebuilds the biometric-gated local index
 * - clearCredentialIndex: Clears account data on logout
 */
export interface AutofillPlugin {
  /** Check if Authwell is enabled as the platform autofill provider */
  isEnabled(): Promise<AutofillEnabledResult>;

  /** Open platform settings so the user can enable Authwell AutoFill */
  requestEnable(): Promise<void>;

  /** Rebuild the native index. Native code encrypts every credential immediately. */
  replaceCredentialIndex(options: {
    credentials: AutofillIndexCredential[];
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
