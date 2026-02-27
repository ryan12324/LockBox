/**
 * `lockbox sync` — Pull latest changes from the server.
 */

import { Command } from 'commander';
import { getSession, getApiUrl } from '../lib/session.js';
import { createApi } from '../lib/api.js';

export const syncCommand = new Command('sync')
  .description('Sync vault with the server')
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
      const api = createApi(apiUrl);
      const result = await api.sync.pull(session.token);

      const totalItems = result.added.length + result.modified.length;
      const deletedCount = result.deleted.length;
      const folderCount = result.folders.length;

      if (parentOpts.json) {
        console.log(
          JSON.stringify({
            added: result.added.length,
            modified: result.modified.length,
            deleted: deletedCount,
            folders: folderCount,
            serverTimestamp: result.serverTimestamp,
          })
        );
      } else {
        console.log(
          `Synced: ${totalItems} item(s) (${result.added.length} added, ${result.modified.length} modified), ${deletedCount} deleted, ${folderCount} folder(s)`
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync failed';
      console.error(`Error: ${message}`);
      process.exitCode = 1;
    }
  });
