/**
 * BYOK key management.
 * API keys are encrypted with the user's master key before storage.
 * Keys are decrypted client-side only when making LLM calls.
 */

import type { AIProvider, AIProviderConfig } from '@lockbox/types';

const SETTINGS_STORAGE_KEY = 'lockbox:ai:providers';

/**
 * In-memory store for decrypted provider configs.
 * Never persisted to disk in plaintext.
 */
let activeConfigs: Map<AIProvider, AIProviderConfig> = new Map();

/** Get the currently active provider config (decrypted, in-memory only) */
export function getProviderConfig(provider: AIProvider): AIProviderConfig | undefined {
  return activeConfigs.get(provider);
}

/** Get all configured providers */
export function getAllProviderConfigs(): AIProviderConfig[] {
  return Array.from(activeConfigs.values());
}

/** Get the first enabled provider config */
export function getActiveProvider(): AIProviderConfig | undefined {
  return getAllProviderConfigs().find((c) => c.enabled);
}

/**
 * Set a provider config in the active (decrypted) store.
 * Call this after decrypting a stored config with the master key.
 */
export function setProviderConfig(config: AIProviderConfig): void {
  activeConfigs.set(config.provider, config);
}

/** Remove a provider config from the active store */
export function removeProviderConfig(provider: AIProvider): void {
  activeConfigs.delete(provider);
}

/** Clear all active configs (e.g., on lock/logout) */
export function clearProviderConfigs(): void {
  activeConfigs = new Map();
}

/**
 * Serialize provider configs for encrypted storage.
 * Strips in-memory-only fields and returns a JSON string
 * that should be encrypted before persisting.
 */
export function serializeForStorage(): string {
  const configs = getAllProviderConfigs();
  return JSON.stringify(configs);
}

/**
 * Deserialize provider configs from decrypted storage.
 * Call with the decrypted JSON string from vault storage.
 */
export function deserializeFromStorage(json: string): void {
  try {
    const configs = JSON.parse(json) as AIProviderConfig[];
    activeConfigs = new Map();
    for (const config of configs) {
      activeConfigs.set(config.provider, config);
    }
  } catch {
    activeConfigs = new Map();
  }
}

/**
 * Test if a provider connection works by making a minimal API call.
 * Returns true if the provider responds successfully.
 */
export async function testProviderConnection(config: AIProviderConfig): Promise<{
  success: boolean;
  error?: string;
  latencyMs?: number;
}> {
  const start = performance.now();

  try {
    // Ollama: check /api/tags endpoint
    if (config.provider === 'ollama') {
      const baseUrl = config.baseUrl ?? 'http://localhost:11434';
      const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { success: true, latencyMs: Math.round(performance.now() - start) };
    }

    // Workers AI: no connection test (binding-based)
    if (config.provider === 'workers-ai') {
      return { success: true, latencyMs: 0 };
    }

    // API-key-based providers: test with a minimal request
    if (!config.apiKey) {
      return { success: false, error: 'API key is required' };
    }

    const endpoints: Record<string, string> = {
      openrouter: 'https://openrouter.ai/api/v1/models',
      openai: 'https://api.openai.com/v1/models',
      anthropic: 'https://api.anthropic.com/v1/messages',
      google: 'https://generativelanguage.googleapis.com/v1beta/models',
      vercel: 'https://api.vercel.ai/v1/models',
    };

    const url = config.baseUrl ?? endpoints[config.provider];
    if (!url) {
      return { success: false, error: `Unknown provider: ${config.provider}` };
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.apiKey}`,
    };

    // Anthropic uses a different auth header
    if (config.provider === 'anthropic') {
      delete headers['Authorization'];
      headers['x-api-key'] = config.apiKey;
      headers['anthropic-version'] = '2023-06-01';
    }

    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { success: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }

    return { success: true, latencyMs: Math.round(performance.now() - start) };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Connection failed';
    return { success: false, error: message };
  }
}
