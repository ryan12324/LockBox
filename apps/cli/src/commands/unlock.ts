/**
 * `lockbox unlock` — Re-derive encryption keys for the current session.
 * Since keys are never stored to disk, this re-prompts for the master password
 * and re-derives keys for the current process.
 */

import { Command } from 'commander';
import { getSession, getApiUrl } from '../lib/session.js';
import { deriveKeysFromPassword, decryptUserKeyFromMaster } from '../lib/crypto.js';
import { createApi } from '../lib/api.js';
import { prompt } from './login.js';

/**
 * In-memory key storage for the current process.
 * These keys are NEVER written to disk.
 */
let currentUserKey: Uint8Array | null = null;

export function getUserKey(): Uint8Array | null {
  return currentUserKey;
}

export function setUserKey(key: Uint8Array): void {
  currentUserKey = key;
}

export function clearUserKey(): void {
  currentUserKey = null;
}

export const unlockCommand = new Command('unlock')
  .description('Unlock vault by re-deriving encryption keys')
  .action(async (_options, cmd: Command) => {
    try {
      const parentOpts = cmd.parent?.opts<{ apiUrl?: string; json?: boolean }>() ?? {};
      const session = getSession();
      if (!session) {
        console.error('Error: Not logged in. Run `lockbox login` first.');
        process.exitCode = 1;
        return;
      }

      const apiUrl = getApiUrl(parentOpts.apiUrl);
      const password = await prompt('Master password: ', true);
      if (!password) {
        console.error('Error: Master password is required.');
        process.exitCode = 1;
        return;
      }

      // Re-derive master key
      const { masterKey } = await deriveKeysFromPassword(password, session.email, apiUrl);

      // Fetch encrypted user key from server and decrypt
      const api = createApi(apiUrl);
      const loginResponse = await api.auth.login({
        email: session.email,
        authHash: (await deriveKeysFromPassword(password, session.email, apiUrl)).authHash,
      });

      const userKey = await decryptUserKeyFromMaster(
        loginResponse.user.encryptedUserKey,
        masterKey
      );
      setUserKey(userKey);

      if (parentOpts.json) {
        console.log(JSON.stringify({ success: true, message: 'Vault unlocked' }));
      } else {
        console.log('Vault unlocked successfully.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unlock failed';
      console.error(`Error: ${message}`);
      process.exitCode = 1;
    }
  });
