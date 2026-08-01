/** `lockbox totp <id>` — generate the current authenticator code for a login. */

import { Command } from 'commander';
import { generateTotp } from '@lockbox/totp';
import { getApiUrl } from '../lib/session.js';
import { createApi } from '../lib/api.js';
import { decryptVaultItem } from '../lib/crypto.js';
import { unlockForCommand } from './unlock.js';

export async function generateItemTotp(item: Record<string, unknown>, time = Date.now()) {
  if (item['type'] !== 'login') throw new Error('This vault item is not a login.');
  const secret = item['totp'];
  if (typeof secret !== 'string' || !secret.trim()) {
    throw new Error('This login does not have an authenticator key.');
  }
  const generated = await generateTotp(secret, time);
  return {
    name: typeof item['name'] === 'string' ? item['name'] : undefined,
    code: generated.code,
    remaining: generated.remaining,
    period: generated.period,
    digits: generated.digits,
    algorithm: generated.algorithm,
  };
}

export const totpCommand = new Command('totp')
  .description('Generate the current authenticator code for a login')
  .argument('<id>', 'Vault item ID')
  .action(async (id: string, _options, cmd: Command) => {
    try {
      const parentOpts = cmd.parent?.opts<{ apiUrl?: string; json?: boolean }>() ?? {};
      const apiUrl = getApiUrl(parentOpts.apiUrl);
      const { session, userKey } = await unlockForCommand(parentOpts.apiUrl);
      const encryptedItem = await createApi(apiUrl).vault.getItem(id, session.token);
      const item = await decryptVaultItem(
        encryptedItem.encryptedData,
        userKey,
        encryptedItem.id,
        encryptedItem.revisionDate,
      );
      const result = await generateItemTotp(item);

      if (parentOpts.json) {
        console.log(JSON.stringify({ id, ...result }, null, 2));
      } else {
        // Code-only stdout makes `lockbox totp <id> | pbcopy` safe and useful.
        console.log(result.code);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate code';
      console.error(`Error: ${message}`);
      process.exitCode = 1;
    }
  });
