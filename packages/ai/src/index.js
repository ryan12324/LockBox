/**
 * @lockbox/ai — AI features for the lockbox password manager.
 *
 * Privacy model:
 * - Vault data (passwords, cards, TOTP) never leaves the device
 * - BYOK providers: user's own API keys, user's own provider
 * - On-device ML for form classification and semantic search
 * - HIBP breach checking uses k-anonymity (only 5-char hash prefix sent)
 */
// Config
export { DEFAULT_AI_FLAGS, loadFeatureFlags, saveFeatureFlags, isFeatureEnabled, } from './config/feature-flags.js';
export { getProviderConfig, getAllProviderConfigs, getActiveProvider, setProviderConfig, removeProviderConfig, clearProviderConfigs, serializeForStorage, deserializeFromStorage, testProviderConnection, } from './config/settings.js';
// Provider implementations
export { OpenRouterProvider } from './providers/openrouter.js';
export { OllamaProvider } from './providers/ollama.js';
export { WorkersAIProvider } from './providers/workers-ai.js';
// Breach monitoring
export { BreachMonitor } from './health/breach.js';
export { BreachScheduler, createScheduler } from './health/monitor.js';
// Health analysis
export { analyzeVaultHealth, analyzeItem } from './health/analyzer.js';
// Autofill classification
export { classifyField, classifyForm } from './autofill/classifier.js';
export { analyzeFormForAutofill } from './autofill/detector.js';
// Security
export { PhishingDetector } from './security/phishing.js';
export { SecurityAlertEngine } from './security/alerts.js';
// Search
export { KeywordEmbeddingProvider, cosineSimilarity } from './search/embeddings.js';
export { SemanticSearch } from './search/semantic.js';
// Categorization
export { suggestTags, suggestFolder, detectDuplicates } from './categorize/categorizer.js';
// Contextual alerts
export { ContextualAlertEngine } from './security/contextual.js';
//# sourceMappingURL=index.js.map