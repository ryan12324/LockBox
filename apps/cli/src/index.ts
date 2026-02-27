#!/usr/bin/env node
import { Command } from 'commander';
import { loginCommand } from './commands/login.js';
import { unlockCommand } from './commands/unlock.js';
import { listCommand } from './commands/list.js';
import { getCommand } from './commands/get.js';
import { createCommand } from './commands/create.js';
import { generateCommand } from './commands/generate.js';
import { syncCommand } from './commands/sync.js';
import { exportCommand } from './commands/export.js';

const program = new Command();

program
  .name('lockbox')
  .description('Lockbox CLI — manage your vault from the terminal')
  .version('0.0.1')
  .option('--api-url <url>', 'API server URL', process.env['LOCKBOX_API_URL'])
  .option('--json', 'Output in JSON format');

program.addCommand(loginCommand);
program.addCommand(unlockCommand);
program.addCommand(listCommand);
program.addCommand(getCommand);
program.addCommand(createCommand);
program.addCommand(generateCommand);
program.addCommand(syncCommand);
program.addCommand(exportCommand);

program.parse();
