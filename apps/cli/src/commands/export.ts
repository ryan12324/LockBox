/**
 * `lockbox export` — Export decrypted vault to stdout.
 * DANGEROUS — requires explicit confirmation.
 */

import { Command } from 'commander';
import * as readline from 'node:readline';
import { getSession, getApiUrl } from '../lib/session.js';
import { createApi } from '../lib/api.js';
import { decryptVaultItem } from '../lib/crypto.js';
import { getUserKey } from './unlock.js';

function askConfirmation(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
      terminal: process.stdin.isTTY ?? false,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

export const exportCommand = new Command('export')
  .description('Export decrypted vault (DANGEROUS)')
  .option('--format <format>', 'Export format', 'json')
  .option('--yes', 'Skip confirmation prompt')
  .action(async (_options, cmd: Command) => {
    try {
      const opts = cmd.opts<{ format: string; yes: boolean }>();
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

      if (opts.format !== 'json') {
        console.error(`Error: Unsupported format "${opts.format}". Only "json" is supported.`);
        process.exitCode = 1;
        return;
      }

      // Require explicit confirmation unless --yes is passed
      if (!opts.yes) {
        console.error('WARNING: This will output your ENTIRE decrypted vault to stdout.');
        console.error('Anyone with access to this output will have ALL your passwords.');
        const answer = await askConfirmation('Type CONFIRM to proceed: ');
        if (answer !== 'CONFIRM') {
          console.error('Export cancelled.');
          process.exitCode = 1;
          return;
        }
      }

      const apiUrl = getApiUrl(parentOpts.apiUrl);
      const api = createApi(apiUrl);
      const { items, folders } = await api.vault.list(session.token);

      const decryptedItems: Array<Record<string, unknown>> = [];
      let failed = 0;

      for (const item of items) {
        try {
          const decrypted = await decryptVaultItem(
            item.encryptedData,
            userKey,
            item.id,
            item.revisionDate
          );
          decryptedItems.push({
            id: item.id,
            type: item.type,
            folderId: item.folderId,
            favorite: item.favorite,
            tags: item.tags,
            ...decrypted,
          });
        } catch {
          failed++;
        }
      }

      const output = {
        exportedAt: new Date().toISOString(),
        itemCount: decryptedItems.length,
        failedCount: failed,
        folders,
        items: decryptedItems,
      };

      console.log(JSON.stringify(output, null, 2));

      if (failed > 0) {
        console.error(`Warning: ${failed} item(s) could not be decrypted.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Export failed';
      console.error(`Error: ${message}`);
      process.exitCode = 1;
    }
  });
