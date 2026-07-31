/**
 * `lockbox get <id>` — Get and decrypt a single vault item.
 */

import { Command } from 'commander';
import { getApiUrl } from '../lib/session.js';
import { createApi } from '../lib/api.js';
import { decryptVaultItem } from '../lib/crypto.js';
import { unlockForCommand } from './unlock.js';

const DEFAULT_VISIBLE_FIELDS = new Set([
  'name',
  'username',
  'uris',
  'rpId',
  'rpName',
  'userName',
  'brand',
  'expMonth',
  'expYear',
  'favorite',
  'tags',
  'createdAt',
  'updatedAt',
]);

function redactSecrets(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      key === 'type' || DEFAULT_VISIBLE_FIELDS.has(key) ? value : '[hidden]',
    ])
  );
}

export const getCommand = new Command('get')
  .description('Get a vault item (secret fields are hidden by default)')
  .argument('<id>', 'Vault item ID')
  .option('--show-secrets', 'Print every decrypted field to stdout')
  .option('--field <field>', 'Print one decrypted field to stdout')
  .action(async (id: string, _options, cmd: Command) => {
    try {
      const opts = cmd.opts<{ showSecrets?: boolean; field?: string }>();
      const parentOpts = cmd.parent?.opts<{ apiUrl?: string; json?: boolean }>() ?? {};
      const apiUrl = getApiUrl(parentOpts.apiUrl);
      const { session, userKey } = await unlockForCommand(parentOpts.apiUrl);
      const api = createApi(apiUrl);
      const item = await api.vault.getItem(id, session.token);

      const decrypted = await decryptVaultItem(
        item.encryptedData,
        userKey,
        item.id,
        item.revisionDate
      );

      if (opts.field) {
        if (!(opts.field in decrypted)) {
          throw new Error(`Field "${opts.field}" does not exist on this item.`);
        }
        const value = decrypted[opts.field];
        console.log(typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value));
        return;
      }

      const visibleData = opts.showSecrets ? decrypted : redactSecrets(decrypted);
      if (parentOpts.json) {
        console.log(JSON.stringify({ id: item.id, type: item.type, ...visibleData }, null, 2));
      } else {
        console.log(`ID:   ${item.id}`);
        console.log(`Type: ${item.type}`);
        console.log('---');
        for (const [key, value] of Object.entries(visibleData)) {
          if (key === 'type') continue;
          const display = typeof value === 'object' ? JSON.stringify(value) : String(value);
          console.log(`${key}: ${display}`);
        }
        if (!opts.showSecrets) {
          console.error('\nSecret fields hidden. Use --field <name> or --show-secrets to reveal them.');
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get item';
      console.error(`Error: ${message}`);
      process.exitCode = 1;
    }
  });
