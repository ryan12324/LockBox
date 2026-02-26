/**
 * AI feature flag management.
 * All flags default to false — features are opt-in.
 */
import type { AIFeatureFlags } from '@lockbox/types';
/** Default flags — all AI features disabled */
export declare const DEFAULT_AI_FLAGS: AIFeatureFlags;
/** Load feature flags from storage, falling back to defaults */
export declare function loadFeatureFlags(): AIFeatureFlags;
/** Save feature flags to storage */
export declare function saveFeatureFlags(flags: AIFeatureFlags): void;
/** Check if a specific feature is enabled */
export declare function isFeatureEnabled(flags: AIFeatureFlags, feature: keyof AIFeatureFlags): boolean;
//# sourceMappingURL=feature-flags.d.ts.map