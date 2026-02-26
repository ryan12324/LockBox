/**
 * BYOK key management.
 * API keys are encrypted with the user's master key before storage.
 * Keys are decrypted client-side only when making LLM calls.
 */
import type { AIProvider, AIProviderConfig } from '@lockbox/types';
/** Get the currently active provider config (decrypted, in-memory only) */
export declare function getProviderConfig(provider: AIProvider): AIProviderConfig | undefined;
/** Get all configured providers */
export declare function getAllProviderConfigs(): AIProviderConfig[];
/** Get the first enabled provider config */
export declare function getActiveProvider(): AIProviderConfig | undefined;
/**
 * Set a provider config in the active (decrypted) store.
 * Call this after decrypting a stored config with the master key.
 */
export declare function setProviderConfig(config: AIProviderConfig): void;
/** Remove a provider config from the active store */
export declare function removeProviderConfig(provider: AIProvider): void;
/** Clear all active configs (e.g., on lock/logout) */
export declare function clearProviderConfigs(): void;
/**
 * Serialize provider configs for encrypted storage.
 * Strips in-memory-only fields and returns a JSON string
 * that should be encrypted before persisting.
 */
export declare function serializeForStorage(): string;
/**
 * Deserialize provider configs from decrypted storage.
 * Call with the decrypted JSON string from vault storage.
 */
export declare function deserializeFromStorage(json: string): void;
/**
 * Test if a provider connection works by making a minimal API call.
 * Returns true if the provider responds successfully.
 */
export declare function testProviderConnection(config: AIProviderConfig): Promise<{
    success: boolean;
    error?: string;
    latencyMs?: number;
}>;
//# sourceMappingURL=settings.d.ts.map