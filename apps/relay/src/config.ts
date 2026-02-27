import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import type { RelayConfig } from '@lockbox/types';

export const DEFAULT_CONFIG: RelayConfig = {
  localUrl: 'https://localhost:8787',
  publicUrl: '',
  preferLocal: true,
  healthCheckIntervalMs: 30000,
};

export function validateConfig(config: Partial<RelayConfig>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config.localUrl !== undefined && config.localUrl !== '') {
    if (!isValidUrl(config.localUrl)) {
      errors.push('localUrl must be a valid URL');
    }
  }

  if (config.publicUrl !== undefined && config.publicUrl !== '') {
    if (!isValidUrl(config.publicUrl)) {
      errors.push('publicUrl must be a valid URL');
    }
  }

  if (!config.localUrl && !config.publicUrl) {
    errors.push('At least one of localUrl or publicUrl must be provided');
  }

  if (config.healthCheckIntervalMs !== undefined) {
    if (typeof config.healthCheckIntervalMs !== 'number' || config.healthCheckIntervalMs < 1000) {
      errors.push('healthCheckIntervalMs must be a number >= 1000');
    }
  }

  if (config.tunnelId !== undefined && typeof config.tunnelId !== 'string') {
    errors.push('tunnelId must be a string');
  }

  if (config.tunnelName !== undefined && typeof config.tunnelName !== 'string') {
    errors.push('tunnelName must be a string');
  }

  return { valid: errors.length === 0, errors };
}

export function mergeConfig(base: RelayConfig, overrides: Partial<RelayConfig>): RelayConfig {
  const merged: RelayConfig = { ...base };

  if (overrides.localUrl !== undefined) merged.localUrl = overrides.localUrl;
  if (overrides.publicUrl !== undefined) merged.publicUrl = overrides.publicUrl;
  if (overrides.tunnelId !== undefined) merged.tunnelId = overrides.tunnelId;
  if (overrides.tunnelName !== undefined) merged.tunnelName = overrides.tunnelName;
  if (overrides.preferLocal !== undefined) merged.preferLocal = overrides.preferLocal;
  if (overrides.healthCheckIntervalMs !== undefined)
    merged.healthCheckIntervalMs = overrides.healthCheckIntervalMs;

  return merged;
}

export function loadConfigFromFile(path: string): RelayConfig | null {
  if (!existsSync(path)) {
    return null;
  }

  const raw = readFileSync(path, 'utf-8');
  const parsed: unknown = JSON.parse(raw);

  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }

  return parsed as RelayConfig;
}

export function saveConfigToFile(config: RelayConfig, path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

export function getConfigPath(): string {
  return join(homedir(), '.lockbox', 'relay.json');
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
