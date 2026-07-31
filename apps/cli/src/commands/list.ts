/**
 * `lockbox list` — List vault items.
 * Fetches items from the API and displays names/types.
 */

import { Command } from 'commander';
import type { VaultItemType, EncryptedVaultItem } from '@lockbox/types';
import { getApiUrl } from '../lib/session.js';
import { createApi } from '../lib/api.js';
import { decryptVaultItem } from '../lib/crypto.js';
import { unlockForCommand } from './unlock.js';

function truncate(value: string, width: number): string {
  if (value.length <= width) return value;
  if (width <= 1) return value.slice(0, width);
  return `${value.slice(0, width - 1)}…`;
}

export const listCommand = new Command('list')
  .description('List vault items')
  .option('--type <type>', 'Filter by type (login, note, card, identity, passkey)')
  .option('--folder <name>', 'Filter by folder name')
  .action(async (_options, cmd: Command) => {
    try {
      const opts = cmd.opts<{ type?: VaultItemType; folder?: string }>();
      const parentOpts = cmd.parent?.opts<{ apiUrl?: string; json?: boolean }>() ?? {};
      const apiUrl = getApiUrl(parentOpts.apiUrl);
      const { session, userKey } = await unlockForCommand(parentOpts.apiUrl);
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

      const displayItems: Array<{
        id: string;
        type: string;
        name: string;
        favorite: boolean;
      }> = [];

      for (const item of filteredItems) {
        let name = '(decryption failed)';
        try {
          const decrypted = await decryptVaultItem(
            item.encryptedData,
            userKey,
            item.id,
            item.revisionDate
          );
          name = (decrypted['name'] as string) ?? '(unnamed)';
        } catch {
          // Preserve the row so one corrupt item does not hide the rest of the vault.
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

        const terminalWidth = process.stdout.columns ?? 100;
        if (terminalWidth < 72) {
          for (const [index, item] of displayItems.entries()) {
            if (index > 0) console.log('');
            console.log(`${item.name}${item.favorite ? '  *' : ''}`);
            console.log(`  ${item.type}  ${item.id}`);
          }
        } else {
          const idWidth = 36;
          const typeWidth = 10;
          const nameWidth = Math.max(12, terminalWidth - idWidth - typeWidth - 8);
          const header = `${'ID'.padEnd(idWidth)}  ${'TYPE'.padEnd(typeWidth)}  ${'NAME'.padEnd(nameWidth)}  FAV`;
          console.log(header);
          console.log('-'.repeat(Math.min(terminalWidth, header.length)));
          for (const item of displayItems) {
            const fav = item.favorite ? '*' : '';
            console.log(
              `${truncate(item.id, idWidth).padEnd(idWidth)}  ${truncate(item.type, typeWidth).padEnd(typeWidth)}  ${truncate(item.name, nameWidth).padEnd(nameWidth)}  ${fav}`
            );
          }
        }
        console.log(`\n${displayItems.length} item(s)`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list items';
      console.error(`Error: ${message}`);
      process.exitCode = 1;
    }
  });
