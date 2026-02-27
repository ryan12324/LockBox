import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  DEFAULT_CONFIG,
  validateConfig,
  mergeConfig,
  loadConfigFromFile,
  saveConfigToFile,
  getConfigPath,
} from '../config.js';

describe('DEFAULT_CONFIG', () => {
  it('has correct default values', () => {
    expect(DEFAULT_CONFIG.localUrl).toBe('https://localhost:8787');
    expect(DEFAULT_CONFIG.publicUrl).toBe('');
    expect(DEFAULT_CONFIG.preferLocal).toBe(true);
    expect(DEFAULT_CONFIG.healthCheckIntervalMs).toBe(30000);
  });

  it('does not include optional tunnel fields', () => {
    expect(DEFAULT_CONFIG.tunnelId).toBeUndefined();
    expect(DEFAULT_CONFIG.tunnelName).toBeUndefined();
  });
});

describe('validateConfig', () => {
  it('accepts a valid config with both URLs', () => {
    const result = validateConfig({
      localUrl: 'https://localhost:8787',
      publicUrl: 'https://lockbox-api.example.workers.dev',
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('accepts a config with only localUrl', () => {
    const result = validateConfig({ localUrl: 'https://localhost:8787' });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('accepts a config with only publicUrl', () => {
    const result = validateConfig({ publicUrl: 'https://lockbox-api.example.workers.dev' });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects a config with no URLs', () => {
    const result = validateConfig({});
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('At least one of localUrl or publicUrl must be provided');
  });

  it('rejects an invalid localUrl', () => {
    const result = validateConfig({ localUrl: 'not-a-url' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('localUrl must be a valid URL');
  });

  it('rejects an invalid publicUrl', () => {
    const result = validateConfig({ publicUrl: 'ftp://bad-protocol.com' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('publicUrl must be a valid URL');
  });

  it('rejects healthCheckIntervalMs below 1000', () => {
    const result = validateConfig({
      localUrl: 'https://localhost:8787',
      healthCheckIntervalMs: 500,
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('healthCheckIntervalMs must be a number >= 1000');
  });

  it('accepts valid healthCheckIntervalMs', () => {
    const result = validateConfig({
      localUrl: 'https://localhost:8787',
      healthCheckIntervalMs: 5000,
    });
    expect(result.valid).toBe(true);
  });

  it('accepts empty string localUrl with valid publicUrl', () => {
    const result = validateConfig({
      localUrl: '',
      publicUrl: 'https://api.example.com',
    });
    expect(result.valid).toBe(true);
  });

  it('collects multiple errors', () => {
    const result = validateConfig({
      localUrl: 'bad',
      publicUrl: 'also-bad',
      healthCheckIntervalMs: -1,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe('mergeConfig', () => {
  it('overrides specified fields', () => {
    const merged = mergeConfig(DEFAULT_CONFIG, {
      publicUrl: 'https://api.example.com',
      preferLocal: false,
    });
    expect(merged.publicUrl).toBe('https://api.example.com');
    expect(merged.preferLocal).toBe(false);
    expect(merged.localUrl).toBe(DEFAULT_CONFIG.localUrl);
  });

  it('preserves base values when no override', () => {
    const merged = mergeConfig(DEFAULT_CONFIG, {});
    expect(merged).toEqual(DEFAULT_CONFIG);
  });

  it('adds optional tunnel fields', () => {
    const merged = mergeConfig(DEFAULT_CONFIG, {
      tunnelId: 'abc-123',
      tunnelName: 'my-tunnel',
    });
    expect(merged.tunnelId).toBe('abc-123');
    expect(merged.tunnelName).toBe('my-tunnel');
  });
});

describe('loadConfigFromFile / saveConfigToFile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `lockbox-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns null for non-existent file', () => {
    const result = loadConfigFromFile(join(tmpDir, 'nonexistent.json'));
    expect(result).toBeNull();
  });

  it('round-trips config through save and load', () => {
    const configPath = join(tmpDir, 'relay.json');
    const config = { ...DEFAULT_CONFIG, publicUrl: 'https://api.example.com' };
    saveConfigToFile(config, configPath);
    const loaded = loadConfigFromFile(configPath);
    expect(loaded).toEqual(config);
  });

  it('creates parent directories when saving', () => {
    const configPath = join(tmpDir, 'nested', 'deep', 'relay.json');
    saveConfigToFile(DEFAULT_CONFIG, configPath);
    expect(existsSync(configPath)).toBe(true);
  });
});

describe('getConfigPath', () => {
  it('returns a path under home directory', () => {
    const path = getConfigPath();
    expect(path).toContain('.lockbox');
    expect(path).toContain('relay.json');
  });
});
