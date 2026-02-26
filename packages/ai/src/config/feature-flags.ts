/**
 * AI feature flag management.
 * All flags default to false — features are opt-in.
 */

import type { AIFeatureFlags } from '@lockbox/types';

/** Default flags — all AI features disabled */
export const DEFAULT_AI_FLAGS: AIFeatureFlags = {
  passwordHealth: false,
  breachMonitoring: false,
  smartAutofill: false,
  semanticSearch: false,
  phishingDetection: false,
  autoCategorization: false,
  chatAssistant: false,
  securityCopilot: false,
};

const STORAGE_KEY = 'lockbox:ai:feature-flags';

/** Load feature flags from storage, falling back to defaults */
export function loadFeatureFlags(): AIFeatureFlags {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<AIFeatureFlags>;
      return { ...DEFAULT_AI_FLAGS, ...parsed };
    }
  } catch {
    // Storage unavailable or corrupt — use defaults
  }
  return { ...DEFAULT_AI_FLAGS };
}

/** Save feature flags to storage */
export function saveFeatureFlags(flags: AIFeatureFlags): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(flags));
  } catch {
    // Storage unavailable — flags will be in-memory only
  }
}

/** Check if a specific feature is enabled */
export function isFeatureEnabled(flags: AIFeatureFlags, feature: keyof AIFeatureFlags): boolean {
  return flags[feature] === true;
}
