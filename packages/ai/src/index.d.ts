/**
 * @lockbox/ai — AI features for the lockbox password manager.
 *
 * Privacy model:
 * - Vault data (passwords, cards, TOTP) never leaves the device
 * - BYOK providers: user's own API keys, user's own provider
 * - On-device ML for form classification and semantic search
 * - HIBP breach checking uses k-anonymity (only 5-char hash prefix sent)
 */
export { DEFAULT_AI_FLAGS, loadFeatureFlags, saveFeatureFlags, isFeatureEnabled, } from './config/feature-flags.js';
export { getProviderConfig, getAllProviderConfigs, getActiveProvider, setProviderConfig, removeProviderConfig, clearProviderConfigs, serializeForStorage, deserializeFromStorage, testProviderConnection, } from './config/settings.js';
export type { LLMProvider, Message, ChatOptions, ChatResponse, ChatChunk, ToolCallRequest, ToolDefinition, } from './providers/types.js';
export { OpenRouterProvider } from './providers/openrouter.js';
export { OllamaProvider } from './providers/ollama.js';
export { WorkersAIProvider } from './providers/workers-ai.js';
export type { AiBinding } from './providers/workers-ai.js';
export { BreachMonitor } from './health/breach.js';
export { BreachScheduler, createScheduler } from './health/monitor.js';
export { analyzeVaultHealth, analyzeItem } from './health/analyzer.js';
export type { HealthAnalysisOptions } from './health/analyzer.js';
export { classifyField, classifyForm } from './autofill/classifier.js';
export { analyzeFormForAutofill } from './autofill/detector.js';
export type { FormMetadata, FieldMetadata, FieldClassification, FormClassification, ClassificationResult, } from './autofill/classifier.js';
export type { AutofillDecision } from './autofill/detector.js';
export { PhishingDetector } from './security/phishing.js';
export type { PhishingResult, PhishingCheck } from './security/phishing.js';
export { SecurityAlertEngine } from './security/alerts.js';
export type { SecurityAlert, AlertSeverity, AlertType } from './security/alerts.js';
export { KeywordEmbeddingProvider, cosineSimilarity } from './search/embeddings.js';
export type { EmbeddingProvider, ProgressCallback } from './search/embeddings.js';
export { SemanticSearch } from './search/semantic.js';
export type { SearchResult, SearchOptions } from './search/semantic.js';
export { suggestTags, suggestFolder, detectDuplicates } from './categorize/categorizer.js';
export type { DuplicateGroup } from './categorize/categorizer.js';
export { ContextualAlertEngine } from './security/contextual.js';
export type { BreachData } from './security/contextual.js';
//# sourceMappingURL=index.d.ts.map