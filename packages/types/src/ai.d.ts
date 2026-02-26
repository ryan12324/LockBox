/**
 * AI-related types for lockbox.
 * Covers: LLM provider configuration, health reports, agent tool calls, breach checks.
 */
import type { VaultItem } from './vault';
/** Supported LLM provider identifiers */
export type AIProvider = 'openrouter' | 'vercel' | 'openai' | 'anthropic' | 'google' | 'ollama' | 'workers-ai';
/**
 * BYOK provider configuration.
 * API key is encrypted with the user's master key before storage.
 * Absent for providers that don't require keys (workers-ai, ollama).
 */
export interface AIProviderConfig {
    provider: AIProvider;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    enabled: boolean;
}
/** AI feature flags — all default to false until explicitly enabled */
export interface AIFeatureFlags {
    passwordHealth: boolean;
    breachMonitoring: boolean;
    smartAutofill: boolean;
    semanticSearch: boolean;
    phishingDetection: boolean;
    autoCategorization: boolean;
    chatAssistant: boolean;
    securityCopilot: boolean;
}
/** Password issue discriminated union */
export type PasswordIssue = {
    type: 'weak';
    score: number;
} | {
    type: 'reused';
    sharedWith: string[];
} | {
    type: 'old';
    daysSinceChange: number;
} | {
    type: 'breached';
    breachDate?: string;
};
/** Password health report for a single vault item */
export interface PasswordHealthReport {
    itemId: string;
    score: number;
    issues: PasswordIssue[];
    lastChecked: string;
}
/** Aggregate vault health summary */
export interface VaultHealthSummary {
    totalItems: number;
    weak: number;
    reused: number;
    old: number;
    breached: number;
    strong: number;
    overallScore: number;
}
/** Result of a single HIBP k-anonymity breach check */
export interface BreachCheckResult {
    hashPrefix: string;
    found: boolean;
    count: number;
    checkedAt: string;
}
/** A tool call produced by the LLM */
export interface AgentToolCall {
    name: string;
    arguments: Record<string, unknown>;
}
/** Result of executing a tool locally */
export interface AgentToolResult {
    name: string;
    result: unknown;
    error?: string;
}
/** Events streamed from the vault agent */
export type AgentEvent = {
    type: 'text';
    content: string;
} | {
    type: 'tool_call';
    call: AgentToolCall;
} | {
    type: 'tool_result';
    result: AgentToolResult;
} | {
    type: 'confirmation_needed';
    call: AgentToolCall;
} | {
    type: 'error';
    error: string;
} | {
    type: 'done';
};
/** Overall security posture of the vault */
export interface SecurityPosture {
    score: number;
    trend: 'improving' | 'stable' | 'declining';
    actions: SecurityAction[];
}
/** A prioritized security action the user should take */
export interface SecurityAction {
    priority: 'critical' | 'high' | 'medium' | 'low';
    type: 'rotate' | 'strengthen' | 'deduplicate' | 'enable-2fa';
    affectedItems: string[];
    message: string;
}
/** Result of phishing analysis on a URL */
export interface PhishingResult {
    safe: boolean;
    score: number;
    reasons: string[];
}
/** A security alert surfaced to the user */
export interface SecurityAlert {
    id: string;
    severity: 'critical' | 'warning' | 'info';
    alertType: 'phishing' | 'breach-site' | 'http-only' | 'cert-warning' | 'breach-recent' | 'password-weak' | 'password-reused' | 'password-old';
    message: string;
    affectedItemId?: string;
    dismissedAt?: string;
}
/** Semantic search result */
export interface SearchResult {
    item: VaultItem;
    score: number;
    matchType: 'semantic' | 'keyword';
}
/** A group of duplicate credentials */
export interface DuplicateGroup {
    items: VaultItem[];
    reason: 'same-uri' | 'same-credentials' | 'similar';
}
/** Metadata extracted from a form element for classification */
export interface FormMetadata {
    action?: string;
    method?: string;
    fields: FieldMetadata[];
}
/** Metadata extracted from a single form field */
export interface FieldMetadata {
    type: string;
    name?: string;
    id?: string;
    autocomplete?: string;
    placeholder?: string;
    label?: string;
    ariaLabel?: string;
}
/** Classification result for a single form field */
export interface FieldClassification {
    field: FieldMetadata;
    classification: 'username' | 'email' | 'password' | 'new-password' | 'cc-number' | 'cc-cvv' | 'cc-expiry' | 'address' | 'unknown';
    confidence: number;
}
/** Classification result for an entire form */
export interface FormClassification {
    formType: 'login' | 'signup' | 'card' | 'address' | 'unknown';
    confidence: number;
    fields: FieldClassification[];
}
/** Password rules detected from a form's DOM constraints */
export interface PasswordRules {
    minLength?: number;
    maxLength?: number;
    requireUppercase?: boolean;
    requireLowercase?: boolean;
    requireDigit?: boolean;
    requireSpecial?: boolean;
    allowedSpecialChars?: string;
    forbiddenChars?: string;
}
/** Rotation schedule for a single credential */
export interface RotationSchedule {
    itemId: string;
    lastRotated: string;
    nextRotation: string;
    urgency: 'overdue' | 'due-soon' | 'ok';
}
//# sourceMappingURL=ai.d.ts.map