/**
 * `lockbox list` — List vault items.
 * Fetches items from the API and displays names/types.
 */

import { Command } from 'commander';
import type { VaultItemType, EncryptedVaultItem } from '@lockbox/types';
import { getSession, getApiUrl } from '../lib/session.js';
import { createApi } from '../lib/api.js';
import { decryptVaultItem } from '../lib/crypto.js';
import { getUserKey } from './unlock.js';

export const listCommand = new Command('list')
  .description('List vault items')
  .option('--type <type>', 'Filter by type (login, note, card, identity, passkey)')
  .option('--folder <name>', 'Filter by folder name')
  .action(async (_options, cmd: Command) => {
    try {
      const opts = cmd.opts<{ type?: VaultItemType; folder?: string }>();
      const parentOpts = cmd.parent?.opts<{ apiUrl?: string; json?: boolean }>() ?? {};
      const session = getSession();
      if (!session) {
        console.error('Error: Not logged in. Run `lockbox login` first.');
        process.exitCode = 1;
        return;
      }

      const apiUrl = getApiUrl(parentOpts.apiUrl);
      const api = createApi(apiUrl);
      const params: Record<string, string> = {};
      if (opts.type) params['type'] = opts.type;

      const { items, folders } = await api.vault.list(session.token, params);

      // Filter by folder name if specified
      let filteredItems: EncryptedVaultItem[] = items;
      if (opts.folder) {
        const folder = folders.find((f) => f.name.toLowerCase() === opts.folder?.toLowerCase());
        if (folder) {
          filteredItems = items.filter((item) => item.folderId === folder.id);
        } else {
          filteredItems = [];
        }
      }

      const userKey = getUserKey();

      // Try to decrypt names if user key is available
      const displayItems: Array<{
        id: string;
        type: string;
        name: string;
        favorite: boolean;
      }> = [];

      for (const item of filteredItems) {
        let name = '(encrypted)';
        if (userKey) {
          try {
            const decrypted = await decryptVaultItem(
              item.encryptedData,
              userKey,
              item.id,
              item.revisionDate
            );
            name = (decrypted['name'] as string) ?? '(unnamed)';
          } catch {
            name = '(decryption failed)';
          }
        }
        displayItems.push({
          id: item.id,
          type: item.type,
          name,
          favorite: item.favorite,
        });
      }

      if (parentOpts.json) {
        console.log(JSON.stringify(displayItems, null, 2));
      } else {
        if (displayItems.length === 0) {
          console.log('No items found.');
          return;
        }

        // Format as table
        console.log(`${'ID'.padEnd(38)} ${'TYPE'.padEnd(10)} ${'NAME'.padEnd(30)} FAV`);
        console.log('-'.repeat(82));
        for (const item of displayItems) {
          const fav = item.favorite ? '*' : ' ';
          console.log(
            `${item.id.padEnd(38)} ${item.type.padEnd(10)} ${item.name.slice(0, 30).padEnd(30)} ${fav}`
          );
        }
        console.log(`\n${displayItems.length} item(s)`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list items';
      console.error(`Error: ${message}`);
      process.exitCode = 1;
    }
  });
