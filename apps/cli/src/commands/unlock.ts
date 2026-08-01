/**
 * Vault unlock helper. Keys live only for the duration of the current command.
 */

import { Command } from 'commander';
import { getSession, getApiUrl, saveSession, type Session } from '../lib/session.js';
import { deriveKeysFromPassword, decryptUserKeyFromMaster } from '../lib/crypto.js';
import { createApi } from '../lib/api.js';
import { completeTwoFactorLogin, prompt } from './login.js';

export interface UnlockedVault {
  session: Session;
  userKey: Uint8Array;
}

/**
 * Prompt, authenticate, and decrypt the user key for one CLI command.
 * The key is returned to the caller and is never written to disk.
 */
export async function unlockForCommand(apiUrlFlag?: string): Promise<UnlockedVault> {
  const session = getSession();
  if (!session) {
    throw new Error('Not logged in. Run `lockbox login` first.');
  }

  const apiUrl = getApiUrl(apiUrlFlag);
  const password = await prompt('Master password: ', true);
  if (!password) {
    throw new Error('Master password is required.');
  }

  const { masterKey, authHash } = await deriveKeysFromPassword(password, session.email, apiUrl);
  const api = createApi(apiUrl);
  const response = await completeTwoFactorLogin(
    await api.auth.login({ email: session.email, authHash }),
    api,
  );
  const userKey = await decryptUserKeyFromMaster(response.user.encryptedUserKey, masterKey);
  const refreshedSession: Session = {
    token: response.token,
    userId: response.user.id,
    email: response.user.email,
    apiUrl,
  };
  saveSession(refreshedSession);
  return { session: refreshedSession, userKey };
}

export const unlockCommand = new Command('unlock')
  .description('Verify that your master password can unlock this vault')
  .action(async (_options, cmd: Command) => {
    try {
      const parentOpts = cmd.parent?.opts<{ apiUrl?: string; json?: boolean }>() ?? {};
      await unlockForCommand(parentOpts.apiUrl);

      if (parentOpts.json) {
        console.log(JSON.stringify({ success: true, message: 'Vault access verified' }));
      } else {
        console.log('Vault access verified. Keys were cleared when this command finished.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unlock failed';
      console.error(`Error: ${message}`);
      process.exitCode = 1;
    }
  });
