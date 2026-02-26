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
export {
  DEFAULT_AI_FLAGS,
  loadFeatureFlags,
  saveFeatureFlags,
  isFeatureEnabled,
} from './config/feature-flags.js';

export {
  getProviderConfig,
  getAllProviderConfigs,
  getActiveProvider,
  setProviderConfig,
  removeProviderConfig,
  clearProviderConfigs,
  serializeForStorage,
  deserializeFromStorage,
  testProviderConnection,
} from './config/settings.js';

// Provider types
export type {
  LLMProvider,
  Message,
  ChatOptions,
  ChatResponse,
  ChatChunk,
  ToolCallRequest,
  ToolDefinition,
} from './providers/types.js';

// Provider implementations
export { OpenRouterProvider } from './providers/openrouter.js';
export { OllamaProvider } from './providers/ollama.js';
export { WorkersAIProvider } from './providers/workers-ai.js';
export type { AiBinding } from './providers/workers-ai.js';

// Breach monitoring
export { BreachMonitor } from './health/breach.js';
export { BreachScheduler, createScheduler } from './health/monitor.js';

// Health analysis
export { analyzeVaultHealth, analyzeItem } from './health/analyzer.js';
export type { HealthAnalysisOptions } from './health/analyzer.js';

// Autofill classification
export { classifyField, classifyForm } from './autofill/classifier.js';
export { analyzeFormForAutofill } from './autofill/detector.js';
export type {
  FormMetadata,
  FieldMetadata,
  FieldClassification,
  FormClassification,
  ClassificationResult,
} from './autofill/classifier.js';
export type { AutofillDecision } from './autofill/detector.js';

// Security
export { PhishingDetector } from './security/phishing.js';
export type { PhishingResult, PhishingCheck } from './security/phishing.js';
export { SecurityAlertEngine } from './security/alerts.js';
export type { SecurityAlert, AlertSeverity, AlertType } from './security/alerts.js';

// Search
export { KeywordEmbeddingProvider, cosineSimilarity } from './search/embeddings.js';
export type { EmbeddingProvider, ProgressCallback } from './search/embeddings.js';
export { SemanticSearch } from './search/semantic.js';
export type { SearchResult, SearchOptions } from './search/semantic.js';

 // Categorization
export { suggestTags, suggestFolder, detectDuplicates } from './categorize/categorizer.js';
export type { DuplicateGroup } from './categorize/categorizer.js';

// Contextual alerts
export { ContextualAlertEngine } from './security/contextual.js';
export type { BreachData } from './security/contextual.js';

// Credential Lifecycle
export { LifecycleTracker, DEFAULT_ROTATION_INTERVALS } from './lifecycle/tracker.js';
export type { ItemCategory, LifecycleOptions } from './lifecycle/tracker.js';

// Security Copilot
export { SecurityCopilot } from './copilot/engine.js';
export type { CopilotOptions, ScoreHistory } from './copilot/engine.js';
export { CopilotScheduler } from './copilot/scheduler.js';
export type { SchedulerOptions } from './copilot/scheduler.js';

// Agent
export { AGENT_TOOLS, getToolDefinitions } from './agent/tools.js';
export type { AgentTool } from './agent/tools.js';
export { ToolExecutor } from './agent/executor.js';
export type { AgentContext } from './agent/executor.js';
export { SafetyGate } from './agent/safety.js';
export type { SafetyConfig, SafetyCheckResult, ValidationResult, AuditEntry } from './agent/safety.js';
export { VaultAgent } from './agent/vault-agent.js';
export type { VaultAgentOptions } from './agent/vault-agent.js';
export { SYSTEM_PROMPT } from './prompts/system.js';
