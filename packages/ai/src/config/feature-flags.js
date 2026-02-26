/**
 * AI feature flag management.
 * All flags default to false — features are opt-in.
 */
/** Default flags — all AI features disabled */
export const DEFAULT_AI_FLAGS = {
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
export function loadFeatureFlags() {
    try {
        const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            return { ...DEFAULT_AI_FLAGS, ...parsed };
        }
    }
    catch {
        // Storage unavailable or corrupt — use defaults
    }
    return { ...DEFAULT_AI_FLAGS };
}
/** Save feature flags to storage */
export function saveFeatureFlags(flags) {
    try {
        globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(flags));
    }
    catch {
        // Storage unavailable — flags will be in-memory only
    }
}
/** Check if a specific feature is enabled */
export function isFeatureEnabled(flags, feature) {
    return flags[feature] === true;
}
//# sourceMappingURL=feature-flags.js.map