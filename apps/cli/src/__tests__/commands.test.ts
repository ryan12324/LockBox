import { describe, it, expect } from 'vitest';
import { Command } from 'commander';

describe('CLI command parsing', () => {
  function createTestProgram(): Command {
    const program = new Command();
    program
      .name('lockbox')
      .option('--api-url <url>', 'API server URL')
      .option('--json', 'Output in JSON format');
    return program;
  }

  describe('program options', () => {
    it('parses --api-url flag', () => {
      const program = createTestProgram();
      program.parse(['node', 'lockbox', '--api-url', 'https://api.test']);
      expect(program.opts().apiUrl).toBe('https://api.test');
    });

    it('parses --json flag', () => {
      const program = createTestProgram();
      program.parse(['node', 'lockbox', '--json']);
      expect(program.opts().json).toBe(true);
    });

    it('defaults --json to undefined when not provided', () => {
      const program = createTestProgram();
      program.parse(['node', 'lockbox']);
      expect(program.opts().json).toBeUndefined();
    });
  });

  describe('generate command', () => {
    it('parses --length option', () => {
      const generate = new Command('generate');
      generate
        .option('-l, --length <number>', 'Password length', '20')
        .option('--no-symbols', 'Exclude symbols')
        .option('--passphrase', 'Generate passphrase')
        .option('-w, --words <number>', 'Word count', '5')
        .option('--separator <char>', 'Separator', '-');

      generate.parse(['-l', '32'], { from: 'user' });
      expect(generate.opts().length).toBe('32');
    });

    it('has default length of 20', () => {
      const generate = new Command('generate');
      generate.option('-l, --length <number>', 'Password length', '20');

      generate.parse([], { from: 'user' });
      expect(generate.opts().length).toBe('20');
    });

    it('parses --passphrase flag', () => {
      const generate = new Command('generate');
      generate
        .option('--passphrase', 'Generate passphrase')
        .option('-w, --words <number>', 'Word count', '5');

      generate.parse(['--passphrase', '-w', '6'], { from: 'user' });
      expect(generate.opts().passphrase).toBe(true);
      expect(generate.opts().words).toBe('6');
    });

    it('parses --no-symbols to set symbols=false', () => {
      const generate = new Command('generate');
      generate.option('--no-symbols', 'Exclude symbols');

      generate.parse(['--no-symbols'], { from: 'user' });
      expect(generate.opts().symbols).toBe(false);
    });

    it('defaults symbols to true', () => {
      const generate = new Command('generate');
      generate.option('--no-symbols', 'Exclude symbols');

      generate.parse([], { from: 'user' });
      expect(generate.opts().symbols).toBe(true);
    });
  });

  describe('list command', () => {
    it('parses --type option', () => {
      const list = new Command('list');
      list.option('--type <type>', 'Filter by type').option('--folder <name>', 'Filter by folder');

      list.parse(['--type', 'login'], { from: 'user' });
      expect(list.opts().type).toBe('login');
    });

    it('parses --folder option', () => {
      const list = new Command('list');
      list.option('--type <type>', 'Filter by type').option('--folder <name>', 'Filter by folder');

      list.parse(['--folder', 'Work'], { from: 'user' });
      expect(list.opts().folder).toBe('Work');
    });
  });

  describe('create command', () => {
    it('parses --type and --name as required options', () => {
      const create = new Command('create');
      create
        .requiredOption('--type <type>', 'Item type')
        .requiredOption('--name <name>', 'Item name');

      create.parse(['--type', 'login', '--name', 'GitHub'], { from: 'user' });
      expect(create.opts().type).toBe('login');
      expect(create.opts().name).toBe('GitHub');
    });

    it('throws when --type is missing', () => {
      const create = new Command('create');
      create
        .requiredOption('--type <type>', 'Item type')
        .requiredOption('--name <name>', 'Item name')
        .exitOverride();

      expect(() => create.parse(['--name', 'Test'], { from: 'user' })).toThrow();
    });

    it('throws when --name is missing', () => {
      const create = new Command('create');
      create
        .requiredOption('--type <type>', 'Item type')
        .requiredOption('--name <name>', 'Item name')
        .exitOverride();

      expect(() => create.parse(['--type', 'login'], { from: 'user' })).toThrow();
    });
  });

  describe('export command', () => {
    it('parses --format option with default json', () => {
      const exportCmd = new Command('export');
      exportCmd
        .option('--format <format>', 'Export format', 'json')
        .option('--yes', 'Skip confirmation');

      exportCmd.parse([], { from: 'user' });
      expect(exportCmd.opts().format).toBe('json');
    });

    it('parses --yes flag', () => {
      const exportCmd = new Command('export');
      exportCmd
        .option('--format <format>', 'Export format', 'json')
        .option('--yes', 'Skip confirmation');

      exportCmd.parse(['--yes'], { from: 'user' });
      expect(exportCmd.opts().yes).toBe(true);
    });
  });

  describe('login command', () => {
    it('parses --email option', () => {
      const login = new Command('login');
      login.option('--email <email>', 'Email address');

      login.parse(['--email', 'test@example.com'], { from: 'user' });
      expect(login.opts().email).toBe('test@example.com');
    });
  });

  describe('get command', () => {
    it('parses item ID argument', () => {
      const get = new Command('get');
      get.argument('<id>', 'Vault item ID');

      get.parse(['abc-123'], { from: 'user' });
      expect(get.args[0]).toBe('abc-123');
    });

    it('throws when ID is missing', () => {
      const get = new Command('get');
      get.argument('<id>', 'Vault item ID').exitOverride();

      expect(() => get.parse([], { from: 'user' })).toThrow();
    });
  });
});
