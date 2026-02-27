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

import { deriveKey, decryptUserKey, makeAuthHash, fromBase64 } from '@lockbox/crypto';
import { totp as generateTOTP, parseOtpAuthUri } from '@lockbox/totp';
import { checkBatch } from '@lockbox/crypto';
import { analyzeVaultHealth, analyzeItem } from '@lockbox/ai';
import { generatePassword, generatePassphrase } from '@lockbox/generator';
import { PhishingDetector, SecurityAlertEngine, SemanticSearch, KeywordEmbeddingProvider, SecurityCopilot } from '@lockbox/ai';
import type { SearchResult, SecurityAlert } from '@lockbox/ai';
import type { VaultItem, LoginItem, KdfConfig, Folder } from '@lockbox/types';
import { api } from '../lib/api.js';
import { checkSite as checkTwoFaSite } from '../lib/twofa-directory.js';
import {
  getSessionToken,
  setSessionToken,
  clearSession,
  setStoredEmail,
} from '../lib/storage.js';

// ─── In-memory state (cleared on lock) ────────────────────────────────────────

let masterKey: Uint8Array | null = null;
let userKey: Uint8Array | null = null;
let vaultItems: Map<string, VaultItem> = new Map();
let lastSyncTimestamp: string | null = null;
let folders: Folder[] = [];
let userId: string | null = null;
let privateKey: CryptoKey | null = null;
let sharedFolderKeys: Map<string, Uint8Array> = new Map();
let sharedItems: Map<string, VaultItem[]> = new Map();
let teams: Array<{ id: string; name: string; role: string; createdAt: string }> = [];
let sharedFoldersList: Array<{ folderId: string; teamId: string; ownerUserId: string; permissionLevel: string; folderName: string }> = [];
let hasKeyPairFlag = false;
let cachedBreachStatus: { breachedCount: number; results: Map<string, any> } = { breachedCount: 0, results: new Map() };
const phishingDetector = new PhishingDetector();
let searchEngine: SemanticSearch | null = null;
// ─── Crypto helpers ───────────────────────────────────────────────────────────

async function decryptVaultItem(
  encryptedData: string,
  itemId: string,
  revisionDate: string,
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
  revisionDate: string,
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
  try {
    const res = await api.vault.list(token) as {
      items: Array<{
        id: string;
        type: string;
        encryptedData: string;
        revisionDate: string;
        deletedAt: string | null;
      }>;
      folders: Folder[];
    };

    vaultItems.clear();
    folders = res.folders ?? [];
    for (const item of res.items) {
      if (item.deletedAt) continue;
      const decrypted = await decryptVaultItem(item.encryptedData, item.id, item.revisionDate);
      if (decrypted) {
        vaultItems.set(item.id, decrypted);
      }
    }
    lastSyncTimestamp = new Date().toISOString();
    searchEngine = null; // Reset search index when vault is reloaded
  } catch (err) {
    console.error('[Lockbox] Failed to load vault:', err);
  }
}

// ─── URL matching ─────────────────────────────────────────────────────────────

function getMatchingItems(url: string): VaultItem[] {
  try {
    const pageHost = new URL(url).hostname.replace(/^www\./, '');
    const matches: VaultItem[] = [];

    // Search personal vault items
    for (const item of vaultItems.values()) {
      if (item.type !== 'login') continue;
      const login = item as LoginItem;
      for (const uri of login.uris ?? []) {
        try {
          const itemHost = new URL(uri).hostname.replace(/^www\./, '');
          if (pageHost === itemHost || pageHost.endsWith(`.${itemHost}`) || itemHost.endsWith(`.${pageHost}`)) {
            matches.push(item);
            break;
          }
        } catch {
          // Not a valid URL, skip
        }
      }
    }

    // Search shared items from team folders
    for (const folderItems of sharedItems.values()) {
      for (const item of folderItems) {
        if (item.type !== 'login') continue;
        const login = item as LoginItem;
        for (const uri of login.uris ?? []) {
          try {
            const itemHost = new URL(uri).hostname.replace(/^www\./, '');
            if (pageHost === itemHost || pageHost.endsWith(`.${itemHost}`) || itemHost.endsWith(`.${pageHost}`)) {
              matches.push(item);
              break;
            }
          } catch {
            // Not a valid URL, skip
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
const BREACH_ALARM = 'lockbox-breach-check';
const COPILOT_ALARM = 'lockbox-copilot';
let lastActivity = Date.now();

function scheduleAutoLock(timeoutMinutes: number) {
  chrome.alarms.create(LOCK_ALARM, { delayInMinutes: timeoutMinutes });
}

function schedulePeriodSync() {
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 5 });
  chrome.alarms.create(BREACH_ALARM, { periodInMinutes: 24 * 60 });
  chrome.alarms.create(COPILOT_ALARM, { periodInMinutes: 24 * 60 });
}
async function runBreachCheck(): Promise<{ breachedCount: number; results: Map<string, any> }> {
  if (!userKey) return { breachedCount: 0, results: new Map() };
  const loginItems: Array<{id: string, password: string}> = [];
  for (const item of vaultItems.values()) {
    if (item.type === 'login') {
      const login = item as LoginItem;
      if (login.password) {
        loginItems.push({ id: login.id, password: login.password });
      }
    }
  }
  if (loginItems.length === 0) return { breachedCount: 0, results: new Map() };
  const results = await checkBatch(loginItems);
  let breachedCount = 0;
  for (const [, result] of results) {
    if (result.found) breachedCount++;
  }
  cachedBreachStatus = { breachedCount, results };
  return cachedBreachStatus;
}
function lock() {
  masterKey = null;
  userKey = null;
  vaultItems.clear();
  folders = [];
  lastSyncTimestamp = null;
  cachedBreachStatus = { breachedCount: 0, results: new Map() };
  searchEngine = null;
  userId = null;
  privateKey = null;
  sharedFolderKeys.clear();
  sharedItems.clear();
  teams = [];
  sharedFoldersList = [];
  hasKeyPairFlag = false;
  chrome.alarms.clear(LOCK_ALARM);
  chrome.alarms.clear(BREACH_ALARM);
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
        const myKey = keysRes.keys.find(k => k.userId === userId);
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
  | { type: 'generate-alias'; provider?: string; apiKey?: string };
async function handleMessage(
  message: Message,
): Promise<unknown> {
  switch (message.type) {
    case 'unlock': {
      const { email, password } = message;
      try {
        // 1. Get KDF params
        const kdfRes = await api.auth.kdfParams(email) as { kdfConfig: KdfConfig; salt: string };
        const salt = fromBase64(kdfRes.salt);

        // 2. Derive master key
        masterKey = await deriveKey(password, salt, kdfRes.kdfConfig);

        // 3. Make auth hash
        const authHash = await makeAuthHash(masterKey, password);

        // 4. Login
        const loginRes = await api.auth.login({ email, authHash }) as {
          token: string;
          user: { id: string; email: string; kdfConfig: KdfConfig; salt: string; encryptedUserKey: string };
        };

        // 5. Decrypt user key
        userKey = await decryptUserKey(loginRes.user.encryptedUserKey, masterKey);

        // 6. Store session token
        await setSessionToken(loginRes.token);
        await setStoredEmail(email);

        userId = loginRes.user.id;
        // 7. Load vault
        await loadVault(loginRes.token);

        // 8. Schedule auto-lock (15 min default)
        scheduleAutoLock(15);
        schedulePeriodSync();

        // 9. Load team data (non-blocking on unlock)
        loadTeamData(loginRes.token).catch(err =>
          console.error('[Lockbox] Failed to load team data:', err));

        return { success: true };
      } catch (err) {
        masterKey = null;
        userKey = null;
        return { success: false, error: err instanceof Error ? err.message : 'Login failed' };
      }
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
      lastActivity = Date.now();
      // Reset auto-lock timer
      chrome.alarms.clear(LOCK_ALARM);
      scheduleAutoLock(15);
      return { success: true };
    }

    case 'is-unlocked': {
      return { unlocked: userKey !== null };
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
        await api.vault.createItem({
          id: itemId,
          type: itemType,
          encryptedData,
          folderId: vaultItem.folderId,
          tags: vaultItem.tags ?? [],
          favorite: vaultItem.favorite ?? false,
          revisionDate: now,
        }, token);
        vaultItems.set(itemId, vaultItem);
        return { success: true, item: vaultItem };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Failed to create item' };
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
        await api.vault.updateItem(message.id, {
          encryptedData,
          folderId: vaultItem.folderId,
          tags: vaultItem.tags ?? [],
          favorite: vaultItem.favorite ?? false,
          revisionDate: now,
        }, token);
        vaultItems.set(message.id, vaultItem);
        return { success: true, item: vaultItem };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Failed to update item' };
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
        return { success: false, error: err instanceof Error ? err.message : 'Failed to delete item' };
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
        const res = await api.vault.createFolder({ name: message.name }, token) as { folder: Folder };
        folders.push(res.folder);
        return { success: true, folder: res.folder };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Failed to create folder' };
      }
    }

    case 'update-folder': {
      if (!userKey) return { success: false, error: 'Vault is locked' };
      const token = await getSessionToken();
      if (!token) return { success: false, error: 'Not authenticated' };
      try {
        await api.vault.updateFolder(message.id, { name: message.name }, token);
        const idx = folders.findIndex(f => f.id === message.id);
        if (idx >= 0) folders[idx] = { ...folders[idx], name: message.name };
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Failed to update folder' };
      }
    }

    case 'delete-folder': {
      if (!userKey) return { success: false, error: 'Vault is locked' };
      const token = await getSessionToken();
      if (!token) return { success: false, error: 'Not authenticated' };
      try {
        await api.vault.deleteFolder(message.id, token);
        folders = folders.filter(f => f.id !== message.id);
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Failed to delete folder' };
      }
    }

    case 'run-health-analysis': {
      if (!userKey) return { success: false, error: 'Vault is locked' };
      try {
        const items = Array.from(vaultItems.values());
        const logins = items.filter(i => i.type === 'login') as import('@lockbox/types').LoginItem[];
        const summary = await analyzeVaultHealth(logins);
        const reports = await Promise.all(logins.map(login => analyzeItem(login, logins)));
        return { success: true, summary, reports };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Health analysis failed' };
      }
    }

    case 'run-breach-check': {
      try {
        const result = await runBreachCheck();
        return { success: true, ...result };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Breach check failed' };
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
        return { results: results.map(r => ({ item: r.item, score: r.score, matchType: r.matchType })) };
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
        const logins = Array.from(vaultItems.values()).filter((i): i is LoginItem => i.type === 'login');
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
        const pageHost = new URL(url).hostname.replace(/^www\./, '');
        for (const item of vaultItems.values()) {
          if (item.type !== 'login') continue;
          const login = item as LoginItem;
          for (const uri of login.uris ?? []) {
            try {
              const itemHost = new URL(uri).hostname.replace(/^www\./, '');
              if (pageHost === itemHost || pageHost.endsWith(`.${itemHost}`) || itemHost.endsWith(`.${pageHost}`)) {
                // Found a matching URI
                if (login.username === username && login.password === password) {
                  return { result: 'match' as const };
                }
                if (login.username === username && login.password !== password) {
                  return { result: 'update' as const, itemId: login.id };
                }
              }
            } catch {
              // Invalid URI, skip
            }
          }
        }
        // Also check shared items
        for (const folderItems of sharedItems.values()) {
          for (const item of folderItems) {
            if (item.type !== 'login') continue;
            const login = item as LoginItem;
            for (const uri of login.uris ?? []) {
              try {
                const itemHost = new URL(uri).hostname.replace(/^www\./, '');
                if (pageHost === itemHost || pageHost.endsWith(`.${itemHost}`) || itemHost.endsWith(`.${pageHost}`)) {
                  if (login.username === username && login.password === password) {
                    return { result: 'match' as const };
                  }
                  if (login.username === username && login.password !== password) {
                    return { result: 'update' as const, itemId: login.id };
                  }
                }
              } catch {
                // Invalid URI, skip
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
        await api.vault.createItem({
          id: itemId,
          type: 'login' as const,
          encryptedData,
          tags: [],
          favorite: false,
          revisionDate: now,
        }, token);
        vaultItems.set(itemId, vaultItem);
        return { success: true, item: vaultItem };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Failed to save credentials' };
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
        await api.vault.updateItem(message.itemId, {
          encryptedData,
          folderId: updatedItem.folderId,
          tags: updatedItem.tags ?? [],
          favorite: updatedItem.favorite ?? false,
          revisionDate: now,
        }, token);
        vaultItems.set(message.itemId, updatedItem);
        return { success: true, item: updatedItem };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Failed to update credentials' };
      }
    }


    // ─── Attachments ──────────────────────────────────────────────────

    case 'get-attachments': {
      if (!userKey) return { success: false, error: 'Vault is locked' };
      const token = await getSessionToken();
      if (!token) return { success: false, error: 'Not authenticated' };
      try {
        const res = await api.attachments.list(message.itemId, token);
        return { success: true, attachments: res.attachments };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Failed to get attachments' };
      }
    }

    case 'download-attachment': {
      if (!userKey) return { success: false, error: 'Vault is locked' };
      const token = await getSessionToken();
      if (!token) return { success: false, error: 'Not authenticated' };
      try {
        const res = await api.attachments.download(message.itemId, message.attachmentId, token);
        return { success: true, encryptedData: res.encryptedData };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Failed to download attachment' };
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

    case 'generate-alias': {
      if (!userKey) return { success: false, error: 'Vault is locked' };
      const token = await getSessionToken();
      if (!token) return { success: false, error: 'Not authenticated' };
      try {
        const res = await api.aliases.generate(
          { provider: message.provider, apiKey: message.apiKey },
          token,
        );
        return { success: true, alias: res.alias };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Failed to generate alias' };
      }
    }

    default:
      return { error: 'Unknown message type' };
  }
}

// ─── WXT background export ────────────────────────────────────────────────────

export default defineBackground(() => {
  // Message listener
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    handleMessage(message as Message)
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
      chrome.tabs.sendMessage(details.tabId, {
        type: 'phishing-warning',
        url: details.url,
        score: result.score,
        reasons: result.reasons,
      }).catch(() => {});
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
    } else if (alarm.name === BREACH_ALARM) {
      await runBreachCheck();
    } else if (alarm.name === COPILOT_ALARM) {
      if (userKey) {
        try {
          const logins = Array.from(vaultItems.values()).filter((i): i is LoginItem => i.type === 'login');
          const copilot = new SecurityCopilot();
          const posture = await copilot.evaluate(logins, {});
          await chrome.storage.local.set({ 'copilot-posture': posture });
          
          if (posture.score < 50 || posture.actions.some(a => a.priority === 'critical')) {
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
