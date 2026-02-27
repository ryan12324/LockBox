/**
 * `lockbox create` — Create a new vault item.
 * Interactive prompts for required fields based on type.
 */

import { Command } from 'commander';
import * as readline from 'node:readline';
import type { VaultItemType } from '@lockbox/types';
import { encryptString, toUtf8, toBase64 } from '@lockbox/crypto';
import { getSession, getApiUrl } from '../lib/session.js';
import { createApi } from '../lib/api.js';
import { getUserKey } from './unlock.js';

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
  const password = await ask('Password: ');
  const uri = await ask('URI (optional): ');
  return {
    username,
    password,
    uris: uri ? [uri] : [],
  };
}

async function promptForNoteFields(): Promise<Record<string, unknown>> {
  const content = await ask('Note content: ');
  return { content };
}

async function promptForCardFields(): Promise<Record<string, unknown>> {
  const cardholderName = await ask('Cardholder name: ');
  const number = await ask('Card number: ');
  const expMonth = await ask('Expiration month (MM): ');
  const expYear = await ask('Expiration year (YYYY): ');
  const cvv = await ask('CVV: ');
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

      const validTypes: VaultItemType[] = ['login', 'note', 'card', 'identity', 'passkey'];
      if (!validTypes.includes(opts.type)) {
        console.error(
          `Error: Invalid type "${opts.type}". Must be one of: ${validTypes.join(', ')}`
        );
        process.exitCode = 1;
        return;
      }

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

      // Extract IV from encrypted data (format: base64(iv).base64(ciphertext))
      const dotIndex = encryptedData.indexOf('.');
      const iv = encryptedData.slice(0, dotIndex);

      const apiUrl = getApiUrl(parentOpts.apiUrl);
      const api = createApi(apiUrl);
      const result = await api.vault.createItem(
        {
          id,
          type: opts.type,
          encryptedData,
          iv,
          revisionDate: now,
          tags: [],
          favorite: false,
        },
        session.token
      );

      if (parentOpts.json) {
        console.log(JSON.stringify({ success: true, id: result.id ?? id }));
      } else {
        console.log(`Created ${opts.type} item: ${result.id ?? id}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create item';
      console.error(`Error: ${message}`);
      process.exitCode = 1;
    }
  });
