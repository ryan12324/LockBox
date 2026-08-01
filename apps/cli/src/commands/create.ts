/**
 * `lockbox create` — Create a new vault item.
 * Interactive prompts for required fields based on type.
 */

import { Command } from 'commander';
import * as readline from 'node:readline';
import type { VaultItemType } from '@lockbox/types';
import { encryptString, toUtf8 } from '@lockbox/crypto';
import { parseTotpSecret } from '@lockbox/totp';
import { createApi } from '../lib/api.js';
import { unlockForCommand } from './unlock.js';
import { prompt } from './login.js';

function ask(question: string): Promise<string> {
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

async function promptForLoginFields(): Promise<Record<string, unknown>> {
  const username = await ask('Username: ');
  const password = await prompt('Password: ', true);
  const uri = await ask('URI (optional): ');
  const totp = (await prompt('Authenticator key (optional): ', true)).trim();
  if (totp) parseTotpSecret(totp);
  return {
    username,
    password,
    uris: uri ? [uri] : [],
    totp: totp || undefined,
  };
}

async function promptForNoteFields(): Promise<Record<string, unknown>> {
  const content = await ask('Note content: ');
  return { content };
}

async function promptForCardFields(): Promise<Record<string, unknown>> {
  const cardholderName = await ask('Cardholder name: ');
  const number = await prompt('Card number: ', true);
  const expMonth = await ask('Expiration month (MM): ');
  const expYear = await ask('Expiration year (YYYY): ');
  const cvv = await prompt('CVV: ', true);
  const brand = await ask('Brand (optional): ');
  return { cardholderName, number, expMonth, expYear, cvv, brand: brand || undefined };
}

async function promptForIdentityFields(): Promise<Record<string, unknown>> {
  const firstName = await ask('First name: ');
  const lastName = await ask('Last name: ');
  const email = await ask('Email (optional): ');
  const phone = await ask('Phone (optional): ');
  return {
    firstName,
    lastName,
    email: email || undefined,
    phone: phone || undefined,
  };
}

export const createCommand = new Command('create')
  .description('Create a new vault item')
  .requiredOption('--type <type>', 'Item type (login, note, card, identity)')
  .requiredOption('--name <name>', 'Item name')
  .action(async (_options, cmd: Command) => {
    try {
      const opts = cmd.opts<{ type: VaultItemType; name: string }>();
      const parentOpts = cmd.parent?.opts<{ apiUrl?: string; json?: boolean }>() ?? {};
      const validTypes: VaultItemType[] = ['login', 'note', 'card', 'identity'];
      if (!validTypes.includes(opts.type)) {
        if (opts.type === 'passkey') {
          console.error(
            'Error: Passkeys must be captured through the web vault or browser extension so the WebAuthn ceremony can run safely.'
          );
          process.exitCode = 1;
          return;
        }
        console.error(
          `Error: Invalid type "${opts.type}". Must be one of: ${validTypes.join(', ')}`
        );
        process.exitCode = 1;
        return;
      }

      const { session, userKey } = await unlockForCommand(parentOpts.apiUrl);

      // Prompt for type-specific fields
      let fields: Record<string, unknown> = {};
      switch (opts.type) {
        case 'login':
          fields = await promptForLoginFields();
          break;
        case 'note':
          fields = await promptForNoteFields();
          break;
        case 'card':
          fields = await promptForCardFields();
          break;
        case 'identity':
          fields = await promptForIdentityFields();
          break;
      }

      // Build the vault item data
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const itemData = {
        name: opts.name,
        type: opts.type,
        ...fields,
        tags: [],
        favorite: false,
        createdAt: now,
        updatedAt: now,
      };

      // Encrypt the item data
      const aad = toUtf8(`${id}:${now}`);
      const aesKey = userKey.slice(0, 32);
      const encryptedData = await encryptString(JSON.stringify(itemData), aesKey, aad);

      const api = createApi(session.apiUrl);
      const result = await api.vault.createItem(
        {
          id,
          type: opts.type,
          encryptedData,
          revisionDate: now,
          tags: [],
          favorite: false,
        },
        session.token
      );

      if (parentOpts.json) {
        console.log(JSON.stringify({ success: true, id: result.id }));
      } else {
        console.log(`Created ${opts.type} item: ${result.id}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create item';
      console.error(`Error: ${message}`);
      process.exitCode = 1;
    }
  });
