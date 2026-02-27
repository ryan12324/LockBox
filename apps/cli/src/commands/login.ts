/**
 * `lockbox login` — Authenticate with the Lockbox API.
 * Derives keys using Argon2id, authenticates, saves session token.
 * NEVER stores master password or encryption keys to disk.
 */

import { Command } from 'commander';
import * as readline from 'node:readline';
import { getApiUrl, saveSession } from '../lib/session.js';
import { createApi } from '../lib/api.js';
import { deriveKeysFromPassword } from '../lib/crypto.js';

/** Prompt for input from stdin. Optionally hide input for passwords. */
function prompt(question: string, hidden = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
      terminal: process.stdin.isTTY ?? false,
    });

    if (hidden && process.stdin.isTTY) {
      // Mute output for password entry
      process.stderr.write(question);
      const stdin = process.stdin;
      const wasRaw = stdin.isRaw;
      stdin.setRawMode(true);
      let input = '';
      const onData = (ch: Buffer) => {
        const c = ch.toString('utf8');
        if (c === '\n' || c === '\r') {
          stdin.removeListener('data', onData);
          stdin.setRawMode(wasRaw ?? false);
          process.stderr.write('\n');
          rl.close();
          resolve(input);
        } else if (c === '\u0003') {
          // Ctrl+C
          stdin.removeListener('data', onData);
          stdin.setRawMode(wasRaw ?? false);
          rl.close();
          reject(new Error('User cancelled'));
        } else if (c === '\u007f' || c === '\b') {
          // Backspace
          input = input.slice(0, -1);
        } else {
          input += c;
        }
      };
      stdin.on('data', onData);
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    }
  });
}

export { prompt };

export const loginCommand = new Command('login')
  .description('Authenticate with the Lockbox API')
  .option('--email <email>', 'Email address')
  .action(async (_options, cmd: Command) => {
    try {
      const opts = cmd.opts<{ email?: string }>();
      const parentOpts = cmd.parent?.opts<{ apiUrl?: string; json?: boolean }>() ?? {};
      const apiUrl = getApiUrl(parentOpts.apiUrl);

      const email = opts.email ?? (await prompt('Email: '));
      if (!email) {
        console.error('Error: Email is required.');
        process.exitCode = 1;
        return;
      }

      const password = await prompt('Master password: ', true);
      if (!password) {
        console.error('Error: Master password is required.');
        process.exitCode = 1;
        return;
      }

      // Derive keys from password (Argon2id)
      const { authHash } = await deriveKeysFromPassword(password, email, apiUrl);

      // Authenticate with server
      const api = createApi(apiUrl);
      const response = await api.auth.login({ email, authHash });

      // Save session (token only — NEVER keys)
      saveSession({
        token: response.token,
        userId: response.user.id,
        email: response.user.email,
        apiUrl,
      });

      if (parentOpts.json) {
        console.log(
          JSON.stringify({
            success: true,
            email: response.user.email,
            userId: response.user.id,
          })
        );
      } else {
        console.log(`Logged in as ${response.user.email}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed';
      console.error(`Error: ${message}`);
      process.exitCode = 1;
    }
  });
