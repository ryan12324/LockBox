/**
 * Background service worker for Lockbox extension.
 * Handles auth, vault caching, sync, auto-lock, and crypto proxy.
 *
 * SECURITY:
 * - Session token stored in chrome.storage.session (cleared on browser close)
 * - Decrypted vault items held in memory only (cleared on lock)
 * - Master key and user key held in memory only (cleared on lock)
 * - Never persist decrypted data to any storage
 */

import {
  deriveKey,
  decryptUserKey,
  makeAuthHash,
  encryptString,
  decryptString,
  decrypt,
  toUtf8,
  toBase64,
  fromBase64,
} from '@lockbox/crypto';
import { totp as generateTOTP, parseOtpAuthUri } from '@lockbox/totp';
import { checkBatch } from '@lockbox/crypto';
import { analyzeVaultHealth, analyzeItem } from '@lockbox/ai';
import { generatePassword, generatePassphrase } from '@lockbox/generator';
import {
  PhishingDetector,
  SecurityAlertEngine,
  SemanticSearch,
  KeywordEmbeddingProvider,
  SecurityCopilot,
} from '@lockbox/ai';
import type { VaultItem, LoginItem, PasskeyItem, KdfConfig, Folder } from '@lockbox/types';
import { api } from '../lib/api.js';
import type { AuthenticatedLoginResponse } from '../lib/api.js';
import { checkSite as checkTwoFaSite } from '../lib/twofa-directory.js';
import {
  base64urlEncode,
  base64urlDecode,
  generateCredentialId,
  generatePasskeyKeyPair,
  importPrivateKey,
  hashRpId,
  createAuthenticatorData,
  signChallenge,
  p1363ToDer,
  buildAttestationObject,
  buildClientDataJSON,
  findMatchingPasskeys,
  isValidBase64url,
  resolveWebAuthnCaller,
} from '../lib/webauthn.js';
import type {
  StoredPasskey,
  SerializedCreationOptions,
  SerializedRequestOptions,
  SerializedCredential,
} from '../lib/webauthn.js';
import {
  getSessionToken,
  setSessionToken,
  clearSession,
  setStoredEmail,
} from '../lib/storage.js';
import { urlMatchesUri } from '../lib/form-detector.js';

const ALIAS_API_KEY_AAD = toUtf8('lockbox:alias-api-key:v1');

async function decryptAliasApiKey(encryptedApiKey: string, key: Uint8Array): Promise<string> {
  try {
    return await decryptString(encryptedApiKey, key.slice(0, 32), ALIAS_API_KEY_AAD);
  } catch {
    return decryptString(encryptedApiKey, key.slice(0, 32));
  }
}

// ─── In-memory state (cleared on lock) ────────────────────────────────────────

let masterKey: Uint8Array | null = null;
let userKey: Uint8Array | null = null;
let pendingTwoFactorToken: string | null = null;
let pendingTwoFactorEmail: string | null = null;
let vaultItems: Map<string, VaultItem> = new Map();
let folders: Folder[] = [];
let userId: string | null = null;
let privateKey: CryptoKey | null = null;
let sharedFolderKeys: Map<string, Uint8Array> = new Map();
let sharedItems: Map<string, VaultItem[]> = new Map();
let teams: Array<{ id: string; name: string; role: string; createdAt: string }> = [];
let sharedFoldersList: Array<{
  folderId: string;
  teamId: string;
  ownerUserId: string;
  permissionLevel: string;
  folderName: string;
}> = [];
let hasKeyPairFlag = false;
let cachedBreachStatus: {
  breachedCount: number;
  breachedItemIds: string[];
  failedCount: number;
} = {
  breachedCount: 0,
  breachedItemIds: [],
  failedCount: 0,
};
const phishingDetector = new PhishingDetector();
let searchEngine: SemanticSearch | null = null;
// ─── Crypto helpers ───────────────────────────────────────────────────────────

async function decryptVaultItem(
  encryptedData: string,
  itemId: string,
  revisionDate: string
): Promise<VaultItem | null> {
  if (!userKey) return null;
  try {
    const { decryptString, toUtf8 } = await import('@lockbox/crypto');
    const aad = toUtf8(`${itemId}:${revisionDate}`);
    const plaintext = await decryptString(encryptedData, userKey.slice(0, 32), aad);
    return JSON.parse(plaintext) as VaultItem;
  } catch {
    return null;
  }
}

async function encryptVaultItem(
  item: VaultItem,
  itemId: string,
  revisionDate: string
): Promise<string | null> {
  if (!userKey) return null;
  try {
    const { encryptString, toUtf8 } = await import('@lockbox/crypto');
    const plaintext = JSON.stringify(item);
    const aad = toUtf8(`${itemId}:${revisionDate}`);
    return encryptString(plaintext, userKey.slice(0, 32), aad);
  } catch {
    return null;
  }
}

// ─── Vault loading ────────────────────────────────────────────────────────────

async function loadVault(token: string): Promise<void> {
  const res = (await api.vault.list(token)) as {
    items: Array<{
      id: string;
      type: string;
      encryptedData: string;
      revisionDate: string;
      deletedAt: string | null;
    }>;
    folders: Folder[];
  };

  // Build the next snapshot separately. Never replace a valid in-memory vault
  // with a partial or empty one when a row is corrupt or the wrong key is used.
  const nextItems = new Map<string, VaultItem>();
  const failedItemIds: string[] = [];
  for (const item of res.items) {
    if (item.deletedAt) continue;
    const decrypted = await decryptVaultItem(item.encryptedData, item.id, item.revisionDate);
    if (decrypted) {
      nextItems.set(item.id, decrypted);
    } else {
      failedItemIds.push(item.id);
    }
  }

  if (failedItemIds.length > 0) {
    throw new Error(
      `Could not decrypt ${failedItemIds.length} vault item${failedItemIds.length === 1 ? '' : 's'}. ` +
        'The vault was left locked to prevent incomplete data from being used.'
    );
  }

  vaultItems.clear();
  for (const [id, item] of nextItems) vaultItems.set(id, item);
  folders = res.folders ?? [];
  searchEngine = null; // Reset search index when vault is reloaded
}

// ─── URL matching ─────────────────────────────────────────────────────────────

function getMatchingItems(url: string): VaultItem[] {
  try {
    new URL(url);
    const matches: VaultItem[] = [];

    // Search personal vault items
    for (const item of vaultItems.values()) {
      if (item.type !== 'login') continue;
      const login = item as LoginItem;
      for (const uri of login.uris ?? []) {
        if (urlMatchesUri(url, uri)) {
          matches.push(item);
          break;
        }
      }
    }

    // Search shared items from team folders
    for (const folderItems of sharedItems.values()) {
      for (const item of folderItems) {
        if (item.type !== 'login') continue;
        const login = item as LoginItem;
        for (const uri of login.uris ?? []) {
          if (urlMatchesUri(url, uri)) {
            matches.push(item);
            break;
          }
        }
      }
    }

    return matches;
  } catch {
    return [];
  }
}

// ─── Auto-lock ────────────────────────────────────────────────────────────────

const LOCK_ALARM = 'lockbox-auto-lock';
const SYNC_ALARM = 'lockbox-sync';
const COPILOT_ALARM = 'lockbox-copilot';
const DEFAULT_LOCK_TIMEOUT = 30; // minutes
const LOCK_TIMEOUT_KEY = 'lockTimeoutMinutes';
/** Read the user-configured lock timeout (minutes). Falls back to 30. */
async function getLockTimeout(): Promise<number> {
  const result = await chrome.storage.local.get(LOCK_TIMEOUT_KEY);
  const val = result[LOCK_TIMEOUT_KEY];
  return typeof val === 'number' && val >= 0 ? val : DEFAULT_LOCK_TIMEOUT;
}

async function scheduleAutoLock(): Promise<void> {
  const timeout = await getLockTimeout();
  if (timeout === 0) return; // 0 = never lock
  chrome.alarms.create(LOCK_ALARM, { delayInMinutes: timeout });
}

function schedulePeriodSync() {
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 5 });
  chrome.alarms.create(COPILOT_ALARM, { periodInMinutes: 24 * 60 });
}
async function runBreachCheck(): Promise<{
  breachedCount: number;
  breachedItemIds: string[];
  failedCount: number;
}> {
  if (!userKey) throw new Error('Vault is locked');
  const loginItems: Array<{ id: string; password: string }> = [];
  for (const item of vaultItems.values()) {
    if (item.type === 'login') {
      const login = item as LoginItem;
      if (login.password) {
        loginItems.push({ id: login.id, password: login.password });
      }
    }
  }
  if (loginItems.length === 0) {
    cachedBreachStatus = { breachedCount: 0, breachedItemIds: [], failedCount: 0 };
    return cachedBreachStatus;
  }
  const results = await checkBatch(loginItems);
  const breachedItemIds = Array.from(results.entries())
    .filter(([, result]) => result.found)
    .map(([itemId]) => itemId);
  const failedCount = Array.from(results.values()).filter((result) => result.error).length;
  cachedBreachStatus = { breachedCount: breachedItemIds.length, breachedItemIds, failedCount };
  return cachedBreachStatus;
}
function lock() {
  masterKey = null;
  userKey = null;
  pendingTwoFactorToken = null;
  pendingTwoFactorEmail = null;
  vaultItems.clear();
  folders = [];
  cachedBreachStatus = { breachedCount: 0, breachedItemIds: [], failedCount: 0 };
  searchEngine = null;
  userId = null;
  privateKey = null;
  sharedFolderKeys.clear();
  sharedItems.clear();
  teams = [];
  sharedFoldersList = [];
  hasKeyPairFlag = false;
  chrome.alarms.clear(LOCK_ALARM);
}

async function completeLogin(
  loginResponse: AuthenticatedLoginResponse,
  email: string
): Promise<void> {
  if (!masterKey) throw new Error('Login expired. Enter your master password again.');

  try {
    userKey = await decryptUserKey(loginResponse.user.encryptedUserKey, masterKey);
    userId = loginResponse.user.id;

    // Prove the key can decrypt the complete server snapshot before persisting
    // the authenticated session or reporting unlock success.
    await loadVault(loginResponse.token);
    await setSessionToken(loginResponse.token);
    await setStoredEmail(email);
    pendingTwoFactorToken = null;
    pendingTwoFactorEmail = null;

    await scheduleAutoLock();
    schedulePeriodSync();

    loadTeamData(loginResponse.token).catch((err) =>
      console.error('[Lockbox] Failed to load team data:', err)
    );
  } catch (error) {
    lock();
    await clearSession();
    throw error;
  }
}

// ─── Team data loading ─────────────────────────────────────────────────────────

async function loadTeamData(token: string): Promise<void> {
  if (!userKey) return;
  try {
    const keypairRes = await api.keypair.get(token);
    hasKeyPairFlag = true;

    const { decryptPrivateKey, unwrapFolderKey } = await import('@lockbox/crypto');
    privateKey = await decryptPrivateKey(keypairRes.encryptedPrivateKey, userKey);

    const teamsRes = await api.teams.list(token);
    teams = teamsRes.teams;

    const foldersRes = await api.sharing.listSharedFolders(token);
    sharedFoldersList = foldersRes.sharedFolders;

    for (const sf of sharedFoldersList) {
      try {
        const keysRes = await api.sharing.getFolderKeys(sf.folderId, token);
        const myKey = keysRes.key.userId === userId ? keysRes.key : null;
        if (!myKey || !privateKey) continue;

        const folderKey = await unwrapFolderKey(myKey.encryptedFolderKey, privateKey);
        sharedFolderKeys.set(sf.folderId, folderKey);

        const itemsRes = await api.sharing.listSharedFolderItems(sf.folderId, token);
        const { decryptString, toUtf8 } = await import('@lockbox/crypto');
        const decryptedItems: VaultItem[] = [];
        for (const item of itemsRes.items) {
          if (item.deletedAt) continue;
          try {
            const aad = toUtf8(`${item.id}:${item.revisionDate}`);
            const plaintext = await decryptString(item.encryptedData, folderKey, aad);
            decryptedItems.push(JSON.parse(plaintext) as VaultItem);
          } catch {
            // Skip items that fail to decrypt
          }
        }
        sharedItems.set(sf.folderId, decryptedItems);
      } catch {
        // Skip folders that fail to load
      }
    }
  } catch {
    hasKeyPairFlag = false;
  }
}

// ─── Message handlers ─────────────────────────────────────────────────────────

type Message =
  | { type: 'unlock'; email: string; password: string }
  | { type: 'validate-login-2fa'; code: string }
  | { type: 'cancel-login-2fa' }
  | { type: 'lock' }
  | { type: 'get-matches'; url: string }
  | { type: 'get-vault' }
  | { type: 'get-totp'; secret: string }
  | { type: 'generate-password'; opts: Parameters<typeof generatePassword>[0] }
  | { type: 'generate-passphrase'; opts: Parameters<typeof generatePassphrase>[0] }
  | { type: 'activity' }
  | { type: 'is-unlocked' }
  | { type: 'create-item'; itemData: object; itemType: string }
  | { type: 'update-item'; id: string; itemData: object }
  | { type: 'delete-item'; id: string }
  | { type: 'get-folders' }
  | { type: 'create-folder'; name: string }
  | { type: 'update-folder'; id: string; name: string }
  | { type: 'delete-folder'; id: string }
  | { type: 'run-health-analysis' }
  | { type: 'run-breach-check' }
  | { type: 'get-breach-status' }
  | { type: 'search-vault'; query: string }
  | { type: 'get-phishing-status'; tabId: number }
  | { type: 'check-url-security'; url: string }
  | { type: 'get-teams' }
  | { type: 'get-shared-items' }
  | { type: 'get-shared-folders' }
  | { type: 'has-keypair' }
  | { type: 'check-credentials'; url: string; username: string; password: string }
  | { type: 'save-credentials'; url: string; username: string; password: string }
  | { type: 'update-credentials'; url: string; username: string; password: string; itemId: string }
  | { type: 'get-attachments'; itemId: string }
  | { type: 'download-attachment'; itemId: string; attachmentId: string }
  | { type: 'check-2fa'; domain: string }
  | { type: 'get-alias-config' }
  | { type: 'save-alias-config'; provider?: string; apiKey?: string }
  | { type: 'delete-alias-config' }
  | { type: 'generate-alias' }
  | {
      type: 'WEBAUTHN_CREATE';
      requestId: string;
      origin: string;
      options: SerializedCreationOptions;
    }
  | { type: 'WEBAUTHN_GET'; requestId: string; origin: string; options: SerializedRequestOptions }
  | {
      type: 'WEBAUTHN_GET_SELECTED';
      credentialId: string;
      rpId: string;
      challenge: string;
      origin: string;
    }
  | { type: 'get-trash' }
  | { type: 'restore-item'; id: string }
  | { type: 'permanent-delete'; id: string }
  | { type: 'set-travel-mode'; enabled: boolean }
  | { type: 'get-travel-mode' }
  | { type: 'get-versions'; itemId: string }
  | { type: 'restore-version'; itemId: string; versionId: string }
  | { type: 'setup-2fa' }
  | { type: 'get-2fa-status' }
  | { type: 'verify-2fa'; code: string }
  | { type: 'disable-2fa'; code: string }
  | { type: 'open-popup' }
  | { type: 'get-lock-timeout' }
  | { type: 'set-lock-timeout'; minutes: number };

/** Sign a passkey assertion for a specific credentialId. Shared by WEBAUTHN_GET and WEBAUTHN_GET_SELECTED. */
async function signPasskeyAssertion(
  credentialId: string,
  rpId: string,
  challenge: string,
  origin: string
): Promise<{ credential: SerializedCredential } | { fallback: true }> {
  // Find the vault item
  let matchedItem: (PasskeyItem & { privateKey?: string }) | null = null;
  for (const item of vaultItems.values()) {
    if (item.type !== 'passkey') continue;
    const pk = item as PasskeyItem & { privateKey?: string };
    if (pk.credentialId === credentialId && pk.rpId === rpId) {
      matchedItem = pk;
      break;
    }
  }
  if (!matchedItem?.privateKey) return { fallback: true };

  // Import private key and sign
  const privKeyBytes = base64urlDecode(matchedItem.privateKey);
  const privKey = await importPrivateKey(privKeyBytes);
  const newCounter = matchedItem.counter + 1;

  const rpIdHash = await hashRpId(rpId);
  const authData = createAuthenticatorData(rpIdHash, newCounter);
  const clientDataJSON = buildClientDataJSON('webauthn.get', challenge, origin);
  const clientDataHash = new Uint8Array(
    await crypto.subtle.digest('SHA-256', clientDataJSON.buffer as ArrayBuffer)
  );
  const signatureRaw = await signChallenge(privKey, authData, clientDataHash);
  const signature = p1363ToDer(signatureRaw);

  // Persist the updated sign counter before returning the assertion. A local-only
  // increment can regress after a service-worker restart and look like a cloned key.
  const token = await getSessionToken();
  if (!token) return { fallback: true };

  const now = new Date().toISOString();
  const updatedItem = {
    ...matchedItem,
    counter: newCounter,
    updatedAt: now,
    revisionDate: now,
  };
  const encryptedData = await encryptVaultItem(
    updatedItem as unknown as VaultItem,
    updatedItem.id,
    now
  );
  if (!encryptedData) return { fallback: true };

  await api.vault.updateItem(
    updatedItem.id,
    {
      encryptedData,
      tags: updatedItem.tags ?? [],
      favorite: updatedItem.favorite ?? false,
      revisionDate: now,
      expectedRevisionDate: matchedItem.revisionDate,
    },
    token
  );
  vaultItems.set(updatedItem.id, updatedItem as unknown as VaultItem);

  return {
    credential: {
      id: credentialId,
      rawId: credentialId,
      type: 'public-key',
      authenticatorAttachment: 'platform',
      response: {
        clientDataJSON: base64urlEncode(clientDataJSON),
        authenticatorData: base64urlEncode(authData),
        signature: base64urlEncode(signature),
        userHandle: matchedItem.userId,
      },
    },
  };
}

async function handleMessage(message: Message, senderUrl?: string): Promise<unknown> {
  switch (message.type) {
    case 'unlock': {
      const { email, password } = message;
      try {
        pendingTwoFactorToken = null;
        pendingTwoFactorEmail = null;
        // 1. Get KDF params
        const kdfRes = (await api.auth.kdfParams(email)) as { kdfConfig: KdfConfig; salt: string };
        const salt = fromBase64(kdfRes.salt);

        // 2. Derive master key
        masterKey = await deriveKey(password, salt, kdfRes.kdfConfig);

        // 3. Make auth hash
        const authHash = await makeAuthHash(masterKey, password);

        // 4. Login
        const loginRes = await api.auth.login({ email, authHash });

        if ('requires2FA' in loginRes) {
          pendingTwoFactorToken = loginRes.tempToken;
          pendingTwoFactorEmail = email;
          return { success: false, requires2FA: true };
        }

        await completeLogin(loginRes, email);

        return { success: true };
      } catch (err) {
        masterKey = null;
        userKey = null;
        return { success: false, error: err instanceof Error ? err.message : 'Login failed' };
      }
    }

    case 'validate-login-2fa': {
      if (!pendingTwoFactorToken || !pendingTwoFactorEmail || !masterKey) {
        lock();
        return {
          success: false,
          error: 'Login expired. Enter your master password again.',
        };
      }

      try {
        const loginRes = await api.twoFactor.validate({
          tempToken: pendingTwoFactorToken,
          code: message.code,
        });
        await completeLogin(loginRes, pendingTwoFactorEmail);
        return { success: true };
      } catch (err) {
        return {
          success: false,
          requires2FA: true,
          error: err instanceof Error ? err.message : 'Two-factor verification failed',
        };
      }
    }

    case 'cancel-login-2fa': {
      lock();
      await clearSession();
      return { success: true };
    }

    case 'lock': {
      lock();
      await clearSession();
      return { success: true };
    }

    case 'get-matches': {
      if (!userKey) return { items: [] };
      const matches = getMatchingItems(message.url);
      return { items: matches };
    }

    case 'get-vault': {
      if (!userKey) return { items: [], locked: true };
      return { items: Array.from(vaultItems.values()), folders, locked: false };
    }

    case 'get-totp': {
      try {
        const { secret } = parseOtpAuthUri(message.secret);
        const code = await generateTOTP(secret);
        return { code };
      } catch {
        return { code: null, error: 'Invalid TOTP secret' };
      }
    }

    case 'generate-password': {
      const password = generatePassword(message.opts);
      return { password };
    }

    case 'generate-passphrase': {
      const passphrase = generatePassphrase(message.opts);
      return { passphrase };
    }

    case 'activity': {
      // Reset auto-lock timer
      chrome.alarms.clear(LOCK_ALARM);
      await scheduleAutoLock();
      return { success: true };
    }

    case 'is-unlocked': {
      return { unlocked: userKey !== null };
    }

    case 'open-popup': {
      // chrome.action.openPopup() is available in Chrome 127+ and Firefox.
      // In older browsers it may not exist, so we gracefully ignore.
      try {
        if (chrome.action?.openPopup) {
          await chrome.action.openPopup();
        }
      } catch {
        // Not supported or user gesture not present — silently ignore
      }
      return { success: true };
    }

    case 'get-lock-timeout': {
      const currentTimeout = await getLockTimeout();
      return { minutes: currentTimeout };
    }

    case 'set-lock-timeout': {
      const minutes = Math.max(0, Math.round(message.minutes));
      await chrome.storage.local.set({ [LOCK_TIMEOUT_KEY]: minutes });
      // Reschedule with new timeout immediately
      chrome.alarms.clear(LOCK_ALARM);
      if (userKey) await scheduleAutoLock();
      return { success: true, minutes };
    }

    // ─── Vault item CRUD ───────────────────────────────────────────────────

    case 'create-item': {
      if (!userKey) return { success: false, error: 'Vault is locked' };
      const token = await getSessionToken();
      if (!token) return { success: false, error: 'Not authenticated' };
      try {
        const now = new Date().toISOString();
        const itemId = crypto.randomUUID();
        const itemType = message.itemType as VaultItem['type'];
        const vaultItem: VaultItem = {
          ...(message.itemData as VaultItem),
          id: itemId,
          type: itemType,
          createdAt: now,
          updatedAt: now,
          revisionDate: now,
        };
        const encryptedData = await encryptVaultItem(vaultItem, itemId, now);
        if (!encryptedData) return { success: false, error: 'Encryption failed' };
        await api.vault.createItem(
          {
            id: itemId,
            type: itemType,
            encryptedData,
            folderId: vaultItem.folderId,
            tags: vaultItem.tags ?? [],
            favorite: vaultItem.favorite ?? false,
            revisionDate: now,
          },
          token
        );
        vaultItems.set(itemId, vaultItem);
        return { success: true, item: vaultItem };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to create item',
        };
      }
    }

    case 'update-item': {
      if (!userKey) return { success: false, error: 'Vault is locked' };
      const token = await getSessionToken();
      if (!token) return { success: false, error: 'Not authenticated' };
      try {
        const existing = vaultItems.get(message.id);
        if (!existing) return { success: false, error: 'Item not found' };
        const now = new Date().toISOString();
        const vaultItem: VaultItem = {
          ...(message.itemData as VaultItem),
          id: message.id,
          type: existing.type,
          createdAt: existing.createdAt,
          updatedAt: now,
          revisionDate: now,
        };
        const encryptedData = await encryptVaultItem(vaultItem, message.id, now);
        if (!encryptedData) return { success: false, error: 'Encryption failed' };
        await api.vault.updateItem(
          message.id,
          {
            encryptedData,
            folderId: vaultItem.folderId,
            tags: vaultItem.tags ?? [],
            favorite: vaultItem.favorite ?? false,
            revisionDate: now,
            expectedRevisionDate: existing.revisionDate,
          },
          token
        );
        vaultItems.set(message.id, vaultItem);
        return { success: true, item: vaultItem };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to update item',
        };
      }
    }

    case 'delete-item': {
      if (!userKey) return { success: false, error: 'Vault is locked' };
      const token = await getSessionToken();
      if (!token) return { success: false, error: 'Not authenticated' };
      try {
        await api.vault.deleteItem(message.id, token);
        vaultItems.delete(message.id);
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to delete item',
        };
      }
    }

    // ─── Folder CRUD ──────────────────────────────────────────────────────

    case 'get-folders': {
      return { folders };
    }

    case 'create-folder': {
      if (!userKey) return { success: false, error: 'Vault is locked' };
      const token = await getSessionToken();
      if (!token) return { success: false, error: 'Not authenticated' };
      try {
        const res = (await api.vault.createFolder({ name: message.name }, token)) as {
          folder: Folder;
        };
        folders.push(res.folder);
        return { success: true, folder: res.folder };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to create folder',
        };
      }
    }

    case 'update-folder': {
      if (!userKey) return { success: false, error: 'Vault is locked' };
      const token = await getSessionToken();
      if (!token) return { success: false, error: 'Not authenticated' };
      try {
        await api.vault.updateFolder(message.id, { name: message.name }, token);
        const idx = folders.findIndex((f) => f.id === message.id);
        if (idx >= 0) folders[idx] = { ...folders[idx], name: message.name };
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to update folder',
        };
      }
    }

    case 'delete-folder': {
      if (!userKey) return { success: false, error: 'Vault is locked' };
      const token = await getSessionToken();
      if (!token) return { success: false, error: 'Not authenticated' };
      try {
        for (const item of vaultItems.values()) {
          if (item.folderId !== message.id) continue;
          const now = new Date().toISOString();
          const movedItem = {
            ...item,
            folderId: undefined,
            updatedAt: now,
            revisionDate: now,
          } as VaultItem;
          const encryptedData = await encryptVaultItem(movedItem, movedItem.id, now);
          if (!encryptedData) throw new Error(`Failed to encrypt item ${movedItem.id}`);
          await api.vault.updateItem(
            movedItem.id,
            {
              encryptedData,
              folderId: null,
              tags: movedItem.tags ?? [],
              favorite: movedItem.favorite ?? false,
              revisionDate: now,
              expectedRevisionDate: item.revisionDate,
            },
            token
          );
          vaultItems.set(movedItem.id, movedItem);
        }
        await api.vault.deleteFolder(message.id, token);
        folders = folders.filter((f) => f.id !== message.id);
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to delete folder',
        };
      }
    }

    case 'run-health-analysis': {
      if (!userKey) return { success: false, error: 'Vault is locked' };
      try {
        const items = Array.from(vaultItems.values());
        const logins = items.filter(
          (i) => i.type === 'login'
        ) as import('@lockbox/types').LoginItem[];
        const summary = await analyzeVaultHealth(logins);
        const reports = await Promise.all(logins.map((login) => analyzeItem(login, logins)));
        return { success: true, summary, reports };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Health analysis failed',
        };
      }
    }

    case 'run-breach-check': {
      try {
        const result = await runBreachCheck();
        return { success: true, ...result };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Breach check failed',
        };
      }
    }

    case 'get-breach-status': {
      return { success: true, ...cachedBreachStatus };
    }

    case 'search-vault': {
      if (!userKey) return { results: [] };
      try {
        if (!searchEngine) {
          const provider = new KeywordEmbeddingProvider();
          await provider.initialize();
          searchEngine = new SemanticSearch(provider);
          await searchEngine.index(Array.from(vaultItems.values()));
        }
        const results = await searchEngine.search(message.query, { limit: 10 });
        return {
          results: results.map((r) => ({ item: r.item, score: r.score, matchType: r.matchType })),
        };
      } catch {
        return { results: [] };
      }
    }

    case 'get-phishing-status': {
      try {
        const data = await chrome.storage.session.get(`phishing_${message.tabId}`);
        const status = data[`phishing_${message.tabId}`] ?? null;
        return status;
      } catch {
        return null;
      }
    }

    case 'check-url-security': {
      if (!userKey) return { alerts: [] };
      try {
        const engine = new SecurityAlertEngine();
        const logins = Array.from(vaultItems.values()).filter(
          (i): i is LoginItem => i.type === 'login'
        );
        const alerts = engine.checkUrl(message.url, logins);
        return { alerts };
      } catch {
        return { alerts: [] };
      }
    }

    // ─── Teams & Sharing ──────────────────────────────────────────────────

    case 'get-teams': {
      return { teams };
    }

    case 'get-shared-items': {
      const allItems: VaultItem[] = [];
      for (const items of sharedItems.values()) {
        allItems.push(...items);
      }
      return { items: allItems };
    }

    case 'get-shared-folders': {
      return { sharedFolders: sharedFoldersList };
    }

    case 'has-keypair': {
      return { hasKeyPair: hasKeyPairFlag };
    }

    // ─── Credential save/update detection ──────────────────────────────

    case 'check-credentials': {
      if (!userKey) return { result: 'new' as const };
      const { url, username, password } = message;
      try {
        new URL(url);
        for (const item of vaultItems.values()) {
          if (item.type !== 'login') continue;
          const login = item as LoginItem;
          for (const uri of login.uris ?? []) {
            if (urlMatchesUri(url, uri)) {
              if (login.username === username && login.password === password) {
                return { result: 'match' as const };
              }
              if (login.username === username && login.password !== password) {
                return { result: 'update' as const, itemId: login.id };
              }
            }
          }
        }
        // Also check shared items
        for (const folderItems of sharedItems.values()) {
          for (const item of folderItems) {
            if (item.type !== 'login') continue;
            const login = item as LoginItem;
            for (const uri of login.uris ?? []) {
              if (urlMatchesUri(url, uri)) {
                if (login.username === username && login.password === password) {
                  return { result: 'match' as const };
                }
                if (login.username === username && login.password !== password) {
                  return { result: 'update' as const, itemId: login.id };
                }
              }
            }
          }
        }
        return { result: 'new' as const };
      } catch {
        return { result: 'new' as const };
      }
    }

    case 'save-credentials': {
      if (!userKey) return { success: false, error: 'Vault is locked' };
      const token = await getSessionToken();
      if (!token) return { success: false, error: 'Not authenticated' };
      try {
        const now = new Date().toISOString();
        const itemId = crypto.randomUUID();
        let hostname = '';
        try {
          hostname = new URL(message.url).hostname.replace(/^www\./, '');
        } catch {
          hostname = message.url;
        }
        const vaultItem: LoginItem = {
          id: itemId,
          type: 'login',
          name: hostname,
          username: message.username,
          password: message.password,
          uris: [message.url],
          tags: [],
          favorite: false,
          createdAt: now,
          updatedAt: now,
          revisionDate: now,
        };
        const encryptedData = await encryptVaultItem(vaultItem, itemId, now);
        if (!encryptedData) return { success: false, error: 'Encryption failed' };
        await api.vault.createItem(
          {
            id: itemId,
            type: 'login' as const,
            encryptedData,
            tags: [],
            favorite: false,
            revisionDate: now,
          },
          token
        );
        vaultItems.set(itemId, vaultItem);
        return { success: true, item: vaultItem };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to save credentials',
        };
      }
    }

    case 'update-credentials': {
      if (!userKey) return { success: false, error: 'Vault is locked' };
      const token = await getSessionToken();
      if (!token) return { success: false, error: 'Not authenticated' };
      try {
        const existing = vaultItems.get(message.itemId);
        if (!existing || existing.type !== 'login') {
          return { success: false, error: 'Item not found' };
        }
        const now = new Date().toISOString();
        const updatedItem: LoginItem = {
          ...(existing as LoginItem),
          password: message.password,
          updatedAt: now,
          revisionDate: now,
        };
        const encryptedData = await encryptVaultItem(updatedItem, message.itemId, now);
        if (!encryptedData) return { success: false, error: 'Encryption failed' };
        await api.vault.updateItem(
          message.itemId,
          {
            encryptedData,
            folderId: updatedItem.folderId,
            tags: updatedItem.tags ?? [],
            favorite: updatedItem.favorite ?? false,
            revisionDate: now,
            expectedRevisionDate: existing.revisionDate,
          },
          token
        );
        vaultItems.set(message.itemId, updatedItem);
        return { success: true, item: updatedItem };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to update credentials',
        };
      }
    }

    // ─── Attachments ──────────────────────────────────────────────────

    case 'get-attachments': {
      if (!userKey) return { success: false, error: 'Vault is locked' };
      const token = await getSessionToken();
      if (!token) return { success: false, error: 'Not authenticated' };
      try {
        const res = await api.attachments.list(message.itemId, token);
        const attachments = await Promise.all(
          res.attachments.map(async (attachment) => {
            const aad = toUtf8(`${message.itemId}:${attachment.id}`);
            const [fileName, mimeType] = await Promise.all([
              decryptString(attachment.encryptedName, userKey!.slice(0, 32), aad),
              decryptString(attachment.encryptedMimeType, userKey!.slice(0, 32), aad),
            ]);
            return {
              id: attachment.id,
              fileName,
              fileSize: attachment.size,
              mimeType,
              createdAt: attachment.createdAt,
            };
          })
        );
        return { success: true, attachments };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to get attachments',
        };
      }
    }

    case 'download-attachment': {
      if (!userKey) return { success: false, error: 'Vault is locked' };
      const token = await getSessionToken();
      if (!token) return { success: false, error: 'Not authenticated' };
      try {
        const encryptedData = await api.attachments.download(
          message.itemId,
          message.attachmentId,
          token
        );
        const dotIndex = encryptedData.indexOf('.');
        if (dotIndex === -1) throw new Error('Invalid encrypted attachment format');
        const plaintext = await decrypt(
          fromBase64(encryptedData.slice(dotIndex + 1)),
          userKey.slice(0, 32),
          fromBase64(encryptedData.slice(0, dotIndex)),
          toUtf8(`${message.itemId}:${message.attachmentId}`)
        );
        return { success: true, encryptedData: toBase64(plaintext) };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to download attachment',
        };
      }
    }

    // ─── 2FA Check ───────────────────────────────────────────────────

    case 'check-2fa': {
      try {
        const result = await checkTwoFaSite(message.domain);
        return { success: true, ...result };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : '2FA check failed' };
      }
    }

    // ─── Email Alias ─────────────────────────────────────────────────

    case 'get-alias-config': {
      if (!userKey) return { success: false, error: 'Vault is locked' };
      const token = await getSessionToken();
      if (!token) return { success: false, error: 'Not authenticated' };
      try {
        const config = await api.aliases.getConfig(token);
        return {
          success: true,
          configured: true,
          provider: config.provider,
        };
      } catch (err) {
        if ((err as { status?: number }).status === 404) {
          return { success: true, configured: false };
        }
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to load alias configuration',
        };
      }
    }

    case 'save-alias-config': {
      if (!userKey) return { success: false, error: 'Vault is locked' };
      const token = await getSessionToken();
      if (!token) return { success: false, error: 'Not authenticated' };
      try {
        let provider: string;
        let apiKey: string;
        let baseUrl: string | undefined;
        const enteredKey = message.apiKey?.trim();

        if (enteredKey) {
          provider = message.provider ?? '';
          apiKey = enteredKey;
          try {
            const existingConfig = await api.aliases.getConfig(token);
            if (existingConfig.provider === provider) {
              baseUrl = existingConfig.baseUrl ?? undefined;
            }
          } catch (err) {
            if ((err as { status?: number }).status !== 404) throw err;
          }
        } else {
          const config = await api.aliases.getConfig(token);
          provider = config.provider;
          apiKey = await decryptAliasApiKey(config.encryptedApiKey, userKey);
          baseUrl = config.baseUrl ?? undefined;
        }

        const result = await api.aliases.list(provider, apiKey, token, baseUrl);
        if (enteredKey) {
          const encryptedApiKey = await encryptString(
            apiKey,
            userKey.slice(0, 32),
            ALIAS_API_KEY_AAD,
          );
          await api.aliases.saveConfig({ provider, encryptedApiKey, baseUrl }, token);
        }
        return { success: true, configured: true, provider, aliasCount: result.aliases.length };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to save alias configuration',
        };
      }
    }

    case 'delete-alias-config': {
      if (!userKey) return { success: false, error: 'Vault is locked' };
      const token = await getSessionToken();
      if (!token) return { success: false, error: 'Not authenticated' };
      try {
        await api.aliases.deleteConfig(token);
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to remove alias configuration',
        };
      }
    }

    case 'generate-alias': {
      if (!userKey) return { success: false, error: 'Vault is locked' };
      const token = await getSessionToken();
      if (!token) return { success: false, error: 'Not authenticated' };
      try {
        const config = await api.aliases.getConfig(token);
        const apiKey = await decryptAliasApiKey(config.encryptedApiKey, userKey);
        const res = await api.aliases.generate(
          {
            provider: config.provider,
            apiKey,
            baseUrl: config.baseUrl ?? undefined,
          },
          token,
        );
        return { success: true, alias: res.alias.email };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to generate alias',
        };
      }
    }

    // ─── WebAuthn passkey operations ───────────────────────────────────────

    case 'WEBAUTHN_CREATE': {
      if (!userKey) return { fallback: true };
      const token = await getSessionToken();
      if (!token) return { fallback: true };
      try {
        const { options: createOpts } = message;
        const caller = resolveWebAuthnCaller(senderUrl, message.origin, createOpts.rp.id);
        if (!caller) return { fallback: true };
        const { origin, rpId } = caller;
        if (
          !isValidBase64url(createOpts.challenge, 16, 1024) ||
          !isValidBase64url(createOpts.user.id, 1, 64) ||
          !createOpts.pubKeyCredParams.some((param) => param.type === 'public-key' && param.alg === -7) ||
          createOpts.authenticatorSelection?.userVerification === 'required' ||
          createOpts.authenticatorSelection?.authenticatorAttachment === 'cross-platform'
        ) {
          return { fallback: true };
        }

        const excludedIds = new Set(
          (createOpts.excludeCredentials ?? [])
            .filter(
              (credential) =>
                credential.type === 'public-key' &&
                isValidBase64url(credential.id, 1, 1024)
            )
            .map((credential) => credential.id)
        );
        const alreadyRegistered = Array.from(vaultItems.values()).some(
          (item) => {
            if (item.type !== 'passkey') return false;
            const passkey = item as PasskeyItem;
            return passkey.rpId === rpId && excludedIds.has(passkey.credentialId);
          }
        );
        if (alreadyRegistered) {
          return {
            error: 'A passkey is already registered for this account.',
            errorName: 'InvalidStateError',
          };
        }

        // Generate ECDSA P-256 key pair
        const { publicKeySPKI, privateKeyPKCS8, publicKeyCOSE } = await generatePasskeyKeyPair();

        // Generate credential ID
        const credId = generateCredentialId();
        const credIdB64 = base64urlEncode(credId);

        // Build authenticator data with attested credential data
        const rpIdHash = await hashRpId(rpId);
        const counter = 0;
        const authData = createAuthenticatorData(rpIdHash, counter, credId, publicKeyCOSE);

        // Build attestation object (fmt="none")
        const attestationObject = buildAttestationObject(authData);

        // Build clientDataJSON
        const clientDataJSON = buildClientDataJSON('webauthn.create', createOpts.challenge, origin);

        // Store passkey as a vault item
        const now = new Date().toISOString();
        const itemId = crypto.randomUUID();
        const passkeyItem: PasskeyItem = {
          id: itemId,
          type: 'passkey',
          name: `${createOpts.rp.name} (${createOpts.user.name})`,
          rpId,
          rpName: createOpts.rp.name,
          userId: createOpts.user.id,
          userName: createOpts.user.name,
          credentialId: credIdB64,
          publicKey: base64urlEncode(publicKeySPKI),
          counter,
          transports: ['internal'],
          tags: ['passkey'],
          favorite: false,
          createdAt: now,
          updatedAt: now,
          revisionDate: now,
        };

        // The encrypted data includes the private key alongside the passkey metadata
        const itemWithPrivateKey = {
          ...passkeyItem,
          privateKey: base64urlEncode(privateKeyPKCS8),
        };

        const encryptedData = await encryptVaultItem(
          itemWithPrivateKey as unknown as VaultItem,
          itemId,
          now
        );
        if (!encryptedData) return { fallback: true };

        await api.vault.createItem(
          {
            id: itemId,
            type: 'passkey' as const,
            encryptedData,
            tags: ['passkey'],
            favorite: false,
            revisionDate: now,
          },
          token
        );

        vaultItems.set(itemId, itemWithPrivateKey as unknown as VaultItem);

        // Build the credential response
        const credential: SerializedCredential = {
          id: credIdB64,
          rawId: credIdB64,
          type: 'public-key',
          authenticatorAttachment: 'platform',
          response: {
            clientDataJSON: base64urlEncode(clientDataJSON),
            attestationObject: base64urlEncode(attestationObject),
            authenticatorData: base64urlEncode(authData),
            publicKey: base64urlEncode(publicKeySPKI),
            publicKeyAlgorithm: -7,
            transports: ['internal'],
          },
        };

        return { credential };
      } catch (err) {
        console.error('[Lockbox] WebAuthn create failed:', err);
        return { fallback: true };
      }
    }

    case 'WEBAUTHN_GET': {
      if (!userKey) return { fallback: true };
      try {
        const { options: getOpts } = message;
        const caller = resolveWebAuthnCaller(senderUrl, message.origin, getOpts.rpId);
        if (!caller) return { fallback: true };
        const { origin, rpId } = caller;
        if (
          !isValidBase64url(getOpts.challenge, 16, 1024) ||
          getOpts.userVerification === 'required' ||
          (getOpts.allowCredentials ?? []).some(
            (credential) =>
              credential.type !== 'public-key' ||
              !isValidBase64url(credential.id, 1, 1024)
          )
        ) {
          return { fallback: true };
        }

        // Find matching passkeys in the vault
        const allPasskeys: StoredPasskey[] = [];
        for (const item of vaultItems.values()) {
          if (item.type !== 'passkey') continue;
          const pk = item as PasskeyItem & { privateKey?: string };
          allPasskeys.push({
            credentialId: pk.credentialId,
            rpId: pk.rpId,
            rpName: pk.rpName,
            userName: pk.userName,
            userDisplayName: pk.userName,
            userId: pk.userId,
            publicKeyAlgorithm: -7,
            publicKeySPKI: pk.publicKey,
            counter: pk.counter,
            createdAt: pk.createdAt,
          });
        }

        const matches = findMatchingPasskeys(allPasskeys, rpId, getOpts.allowCredentials);

        if (matches.length === 0) return { fallback: true };

        // If multiple matches and no specific allowCredentials, ask content script to pick
        if (
          matches.length > 1 &&
          (!getOpts.allowCredentials || getOpts.allowCredentials.length === 0)
        ) {
          return {
            selectPasskey: true,
            matches: matches.map((m) => ({
              credentialId: m.credentialId,
              userName: m.userName,
              userDisplayName: m.userDisplayName,
              rpName: m.rpName,
            })),
            // Pass through context needed for signing after selection
            _context: { rpId, origin, challenge: getOpts.challenge },
          };
        }

        const match = matches[0];
        return {
          needsConsent: true,
          consentData: {
            rpName: match.rpName,
            rpId,
            userName: match.userName,
            userDisplayName: match.userDisplayName,
            credentialId: match.credentialId,
          },
          _context: { rpId, origin, challenge: getOpts.challenge },
        };
      } catch (err) {
        console.error('[Lockbox] WebAuthn get failed:', err);
        return { fallback: true };
      }
    }

    case 'WEBAUTHN_GET_SELECTED': {
      if (!userKey) return { fallback: true };
      try {
        const caller = resolveWebAuthnCaller(senderUrl, message.origin, message.rpId);
        if (
          !caller ||
          !isValidBase64url(message.credentialId, 1, 1024) ||
          !isValidBase64url(message.challenge, 16, 1024)
        ) {
          return { fallback: true };
        }
        return signPasskeyAssertion(
          message.credentialId,
          caller.rpId,
          message.challenge,
          caller.origin
        );
      } catch (err) {
        console.error('[Lockbox] WebAuthn get-selected failed:', err);
        return { fallback: true };
      }
    }

    // ─── Trash ──────────────────────────────────────────────────────────

    case 'get-trash': {
      if (!userKey) return { success: false, error: 'Vault is locked' };
      const token = await getSessionToken();
      if (!token) return { success: false, error: 'Not authenticated' };
      try {
        const res = await api.trash.list(token);
        const decryptedItems: Array<VaultItem & { deletedAt: string }> = [];
        for (const item of res.items) {
          const decrypted = await decryptVaultItem(item.encryptedData, item.id, item.revisionDate);
          if (decrypted) {
            decryptedItems.push({ ...decrypted, deletedAt: item.deletedAt });
          }
        }
        return { success: true, items: decryptedItems };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to get trash',
        };
      }
    }

    case 'restore-item': {
      if (!userKey) return { success: false, error: 'Vault is locked' };
      const token = await getSessionToken();
      if (!token) return { success: false, error: 'Not authenticated' };
      try {
        await api.trash.restore(message.id, token);
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to restore item',
        };
      }
    }

    case 'permanent-delete': {
      if (!userKey) return { success: false, error: 'Vault is locked' };
      const token = await getSessionToken();
      if (!token) return { success: false, error: 'Not authenticated' };
      try {
        await api.trash.permanentDelete(message.id, token);
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to permanently delete item',
        };
      }
    }

    // ─── Travel Mode ─────────────────────────────────────────────────────

    case 'get-travel-mode': {
      if (!userKey) return { success: false, error: 'Vault is locked' };
      const token = await getSessionToken();
      if (!token) return { success: false, error: 'Not authenticated' };
      try {
        const res = await api.travelMode.get(token);
        return { success: true, enabled: res.enabled };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to load travel mode',
        };
      }
    }

    case 'set-travel-mode': {
      if (!userKey) return { success: false, error: 'Vault is locked' };
      const token = await getSessionToken();
      if (!token) return { success: false, error: 'Not authenticated' };
      try {
        const res = await api.travelMode.set({ enabled: message.enabled }, token);
        return { success: true, enabled: res.enabled };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to set travel mode',
        };
      }
    }

    // ─── Version History ─────────────────────────────────────────────────

    case 'get-versions': {
      if (!userKey) return { success: false, error: 'Vault is locked' };
      const token = await getSessionToken();
      if (!token) return { success: false, error: 'Not authenticated' };
      try {
        const res = await api.versions.list(message.itemId, token);
        const decryptedVersions: Array<{
          id: string;
          revisionDate: string;
          createdAt: string;
          data: VaultItem | null;
        }> = [];
        for (const v of res.versions) {
          const decrypted = await decryptVaultItem(v.encryptedData, message.itemId, v.revisionDate);
          decryptedVersions.push({
            id: v.id,
            revisionDate: v.revisionDate,
            createdAt: v.createdAt,
            data: decrypted,
          });
        }
        return { success: true, versions: decryptedVersions };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to get versions',
        };
      }
    }

    case 'restore-version': {
      if (!userKey) return { success: false, error: 'Vault is locked' };
      const token = await getSessionToken();
      if (!token) return { success: false, error: 'Not authenticated' };
      try {
        await api.versions.restore(message.itemId, message.versionId, token);
        await loadVault(token);
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to restore version',
        };
      }
    }

    // ─── 2FA Setup ───────────────────────────────────────────────────────

    case 'get-2fa-status': {
      if (!userKey) return { success: false, error: 'Vault is locked' };
      const token = await getSessionToken();
      if (!token) return { success: false, error: 'Not authenticated' };
      try {
        const res = await api.twoFactor.status(token);
        return { success: true, enabled: res.enabled };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to load 2FA status',
        };
      }
    }

    case 'setup-2fa': {
      if (!userKey) return { success: false, error: 'Vault is locked' };
      const token = await getSessionToken();
      if (!token) return { success: false, error: 'Not authenticated' };
      try {
        const res = await api.twoFactor.setup(token);
        return {
          success: true,
          secret: res.secret,
          otpauthUri: res.otpauthUri,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to setup 2FA',
        };
      }
    }

    case 'verify-2fa': {
      if (!userKey) return { success: false, error: 'Vault is locked' };
      const token = await getSessionToken();
      if (!token) return { success: false, error: 'Not authenticated' };
      try {
        const res = await api.twoFactor.verify({ code: message.code }, token);
        return { success: true, backupCodes: res.backupCodes };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to verify 2FA',
        };
      }
    }

    case 'disable-2fa': {
      if (!userKey) return { success: false, error: 'Vault is locked' };
      const token = await getSessionToken();
      if (!token) return { success: false, error: 'Not authenticated' };
      try {
        await api.twoFactor.disable({ code: message.code }, token);
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to disable 2FA',
        };
      }
    }

    default:
      return { error: 'Unknown message type' };
  }
}

// ─── WXT background export ────────────────────────────────────────────────────

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message as Message, sender.url)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true; // Keep message channel open for async response
  });

  // WebNavigation phishing check
  chrome.webNavigation.onCompleted.addListener(async (details) => {
    if (details.frameId !== 0) return;
    const result = phishingDetector.analyzeUrl(details.url);
    if (!result.safe) {
      await chrome.storage.session.set({
        [`phishing_${details.tabId}`]: { url: details.url, result },
      });
      chrome.tabs
        .sendMessage(details.tabId, {
          type: 'phishing-warning',
          url: details.url,
          score: result.score,
          reasons: result.reasons,
        })
        .catch(() => {});
    }
  });

  // Alarm listener
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === LOCK_ALARM) {
      lock();
      await clearSession();
    } else if (alarm.name === SYNC_ALARM) {
      const token = await getSessionToken();
      if (token && userKey) {
        await loadVault(token);
      }
    } else if (alarm.name === COPILOT_ALARM) {
      if (userKey) {
        try {
          const logins = Array.from(vaultItems.values()).filter(
            (i): i is LoginItem => i.type === 'login'
          );
          const copilot = new SecurityCopilot();
          const posture = await copilot.evaluate(logins, {});
          await chrome.storage.local.set({ 'copilot-posture': posture });

          if (posture.score < 50 || posture.actions.some((a) => a.priority === 'critical')) {
            chrome.action.setBadgeText({ text: '!' });
            chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
          } else {
            chrome.action.setBadgeText({ text: '' });
          }
        } catch (err) {
          console.error('[Lockbox] Copilot evaluation failed:', err);
        }
      }
    }
  });
  // On startup: check if we have a stored session
  chrome.runtime.onStartup.addListener(async () => {
    // Session token is in chrome.storage.session which is cleared on browser close
    // So on startup, we're always locked
    lock();
  });
});
