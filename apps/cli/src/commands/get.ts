/**
 * `lockbox get <id>` — Get and decrypt a single vault item.
 */

import { Command } from 'commander';
import { getSession, getApiUrl } from '../lib/session.js';
import { createApi } from '../lib/api.js';
import { decryptVaultItem } from '../lib/crypto.js';
import { getUserKey } from './unlock.js';

export const getCommand = new Command('get')
  .description('Get and decrypt a vault item')
  .argument('<id>', 'Vault item ID')
  .action(async (id: string, _options, cmd: Command) => {
    try {
      const parentOpts = cmd.parent?.opts<{ apiUrl?: string; json?: boolean }>() ?? {};
      const session = getSession();
      if (!session) {
        console.error('Error: Not logged in. Run `lockbox login` first.');
        process.exitCode = 1;
        return;
      }

      const userKey = getUserKey();
      if (!userKey) {
        console.error('Error: Vault is locked. Run `lockbox unlock` first.');
        process.exitCode = 1;
        return;
      }

      const apiUrl = getApiUrl(parentOpts.apiUrl);
      const api = createApi(apiUrl);
      const item = await api.vault.getItem(id, session.token);

      const decrypted = await decryptVaultItem(
        item.encryptedData,
        userKey,
        item.id,
        item.revisionDate
      );

      if (parentOpts.json) {
        console.log(JSON.stringify({ id: item.id, type: item.type, ...decrypted }, null, 2));
      } else {
        console.log(`ID:   ${item.id}`);
        console.log(`Type: ${item.type}`);
        console.log('---');
        for (const [key, value] of Object.entries(decrypted)) {
          if (key === 'type') continue;
          const display = typeof value === 'object' ? JSON.stringify(value) : String(value);
          console.log(`${key}: ${display}`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get item';
      console.error(`Error: ${message}`);
      process.exitCode = 1;
    }
  });
