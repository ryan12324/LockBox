/**
 * `lockbox generate` — Generate a password or passphrase.
 * Uses @lockbox/generator package.
 */

import { Command } from 'commander';
import { generatePassword, generatePassphrase, evaluateStrength } from '@lockbox/generator';

export const generateCommand = new Command('generate')
  .description('Generate a password or passphrase')
  .option('-l, --length <number>', 'Password length', '20')
  .option('--no-symbols', 'Exclude symbols')
  .option('--no-uppercase', 'Exclude uppercase letters')
  .option('--no-digits', 'Exclude digits')
  .option('--passphrase', 'Generate a passphrase instead')
  .option('-w, --words <number>', 'Number of words (passphrase mode)', '5')
  .option('--separator <char>', 'Word separator (passphrase mode)', '-')
  .option('--strength', 'Show password strength')
  .action((_options, cmd: Command) => {
    try {
      const opts = cmd.opts<{
        length: string;
        symbols: boolean;
        uppercase: boolean;
        digits: boolean;
        passphrase: boolean;
        words: string;
        separator: string;
        strength: boolean;
      }>();
      const parentOpts = cmd.parent?.opts<{ json?: boolean }>() ?? {};

      let result: string;

      if (opts.passphrase) {
        result = generatePassphrase({
          wordCount: parseInt(opts.words, 10),
          separator: opts.separator,
          capitalize: true,
        });
      } else {
        result = generatePassword({
          length: parseInt(opts.length, 10),
          uppercase: opts.uppercase,
          lowercase: true,
          digits: opts.digits,
          symbols: opts.symbols,
        });
      }

      if (parentOpts.json) {
        const output: Record<string, unknown> = { password: result };
        if (opts.strength) {
          const strength = evaluateStrength(result);
          output['strength'] = strength;
        }
        console.log(JSON.stringify(output, null, 2));
      } else {
        console.log(result);
        if (opts.strength) {
          const strength = evaluateStrength(result);
          const scoreLabels = ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];
          console.error(`Strength: ${scoreLabels[strength.score] ?? 'Unknown'} (score: ${strength.score}/4)`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate password';
      console.error(`Error: ${message}`);
      process.exitCode = 1;
    }
  });
