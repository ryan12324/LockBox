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
import { generatePassword, generatePassphrase } from '@lockbox/generator';
import type { VaultItem, LoginItem, KdfConfig } from '@lockbox/types';
import { api } from '../lib/api.js';
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
    };

    vaultItems.clear();
    for (const item of res.items) {
      if (item.deletedAt) continue;
      const decrypted = await decryptVaultItem(item.encryptedData, item.id, item.revisionDate);
      if (decrypted) {
        vaultItems.set(item.id, decrypted);
      }
    }
    lastSyncTimestamp = new Date().toISOString();
  } catch (err) {
    console.error('[Lockbox] Failed to load vault:', err);
  }
}

// ─── URL matching ─────────────────────────────────────────────────────────────

function getMatchingItems(url: string): VaultItem[] {
  try {
    const pageHost = new URL(url).hostname.replace(/^www\./, '');
    const matches: VaultItem[] = [];

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
    return matches;
  } catch {
    return [];
  }
}

// ─── Auto-lock ────────────────────────────────────────────────────────────────

const LOCK_ALARM = 'lockbox-auto-lock';
const SYNC_ALARM = 'lockbox-sync';
let lastActivity = Date.now();

function scheduleAutoLock(timeoutMinutes: number) {
  chrome.alarms.create(LOCK_ALARM, { delayInMinutes: timeoutMinutes });
}

function schedulePeriodSync() {
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 5 });
}

function lock() {
  masterKey = null;
  userKey = null;
  vaultItems.clear();
  lastSyncTimestamp = null;
  chrome.alarms.clear(LOCK_ALARM);
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
  | { type: 'is-unlocked' };

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

        // 7. Load vault
        await loadVault(loginRes.token);

        // 8. Schedule auto-lock (15 min default)
        scheduleAutoLock(15);
        schedulePeriodSync();

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
      return { items: Array.from(vaultItems.values()), locked: false };
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
    }
  });

  // On startup: check if we have a stored session
  chrome.runtime.onStartup.addListener(async () => {
    // Session token is in chrome.storage.session which is cleared on browser close
    // So on startup, we're always locked
    lock();
  });
});
