# Lockbox AI — Implementation Plan

> **Status**: Draft — Awaiting Approval
> **Created**: 2026-02-26
> **Scope**: 14 features across 3 phases, all surfaces (web, extension, mobile)
> **Timeline**: ~10 weeks

---

## Table of Contents

1. [Design Decisions (Locked In)](#design-decisions)
2. [Architecture Overview](#architecture-overview)
3. [Privacy Architecture](#privacy-architecture)
4. [Phase 1 — Foundation + Quick Wins (Weeks 1–3)](#phase-1)
5. [Phase 2 — Intelligence Layer (Weeks 4–6)](#phase-2)
6. [Phase 3 — Autonomous Agent (Weeks 7–10)](#phase-3)
7. [Cross-Cutting Concerns](#cross-cutting-concerns)
8. [Risk Register](#risk-register)
9. [Testing Strategy](#testing-strategy)
10. [Excluded (Intentionally)](#excluded)

---

## Codebase Notes

> **Important**: This plan references exact file paths verified against the real codebase as of 2026-02-26.
>
> **Extension architecture (WXT)**: The extension uses WXT framework. Entrypoints live in `apps/extension/entrypoints/`, shared libraries in `apps/extension/lib/`. The popup UI is a single-file SPA at `entrypoints/popup/App.tsx` — there are no `src/components/` or `src/pages/` directories.
>
> **Web store**: Zustand store is singular `src/store/` (not `stores/`). Currently contains only `auth.ts`.
>
> **Web routing**: All routes defined in `apps/web/src/App.tsx` — new pages require both a page file AND a route entry in App.tsx.
>
> **EncryptedVaultItem inconsistency**: AGENTS.md specifies `encryptedData = base64(iv).base64(ciphertext+tag)` with no separate `iv` field, but the actual `EncryptedVaultItem` type has both `encryptedData` AND `iv` as separate fields. This is a pre-existing issue unrelated to AI features, but any new vault item types should follow whichever pattern is resolved as canonical.

---

## Design Decisions

These are locked in and should not be revisited without explicit team agreement.

| Decision                 | Choice                                                                          | Rationale                                                                 |
| ------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Vision**               | All three pillars: Security Copilot + Chat-First Vault + Smart Automation       | Phased delivery, full AI-first experience                                 |
| **Privacy model**        | Mixed: CF Workers AI (non-sensitive) + on-device (vault data) + BYOK (full LLM) | Preserves zero-knowledge while enabling powerful features                 |
| **Surfaces**             | All simultaneously via shared packages                                          | Feature parity rule — no single-app features                              |
| **First milestone**      | Foundation + quick wins (2–3 weeks)                                             | Ship value fast, iterate                                                  |
| **Cost model**           | Free core (on-device/local) + optional BYOK                                     | Stays true to free-forever promise                                        |
| **BYOK providers**       | OpenRouter, Vercel AI Gateway, OpenAI, Anthropic, Google, Ollama                | OpenRouter/Vercel as gateway layer, direct providers for users who prefer |
| **Chat assistant**       | Autonomous agent with full CRUD                                                 | Can create/edit/delete items, rotate passwords, organize vault            |
| **Breach monitoring**    | Background with notifications                                                   | Periodic scanning, not just on-demand                                     |
| **Package architecture** | New `@lockbox/ai` core + extend existing packages                               | Clean separation of AI infra from domain features                         |

---

## Architecture Overview

### Package Structure

```
packages/
├── ai/                          ← NEW: @lockbox/ai
│   ├── src/
│   │   ├── index.ts             ← Public API barrel export
│   │   ├── providers/
│   │   │   ├── types.ts         ← LLMProvider interface, Message types, Tool schemas
│   │   │   ├── openrouter.ts    ← OpenRouter adapter
│   │   │   ├── vercel.ts        ← Vercel AI Gateway adapter
│   │   │   ├── openai.ts        ← Direct OpenAI adapter
│   │   │   ├── anthropic.ts     ← Direct Anthropic adapter
│   │   │   ├── google.ts        ← Direct Google adapter
│   │   │   ├── ollama.ts        ← Local Ollama adapter
│   │   │   └── workers-ai.ts    ← Cloudflare Workers AI adapter
│   │   ├── inference/
│   │   │   ├── router.ts        ← Routes requests to appropriate provider based on data sensitivity
│   │   │   ├── on-device.ts     ← Transformers.js / ML Kit wrapper
│   │   │   └── workers.ts       ← CF Workers AI binding helpers
│   │   ├── agent/
│   │   │   ├── vault-agent.ts   ← Autonomous vault agent (tool-use loop)
│   │   │   ├── tools.ts         ← Tool definitions (search_vault, create_item, etc.)
│   │   │   ├── executor.ts      ← Client-side tool executor (runs locally)
│   │   │   └── safety.ts        ← Confirmation gates, rate limiting, action validation
│   │   ├── health/
│   │   │   ├── analyzer.ts      ← Password health scoring engine
│   │   │   ├── breach.ts        ← HIBP k-anonymity integration
│   │   │   └── monitor.ts       ← Background breach monitoring scheduler
│   │   ├── search/
│   │   │   ├── semantic.ts      ← Natural language vault search (local embeddings)
│   │   │   └── embeddings.ts    ← On-device embedding generation
│   │   ├── autofill/
│   │   │   ├── classifier.ts    ← ML-based form field classification
│   │   │   └── detector.ts      ← Login vs signup vs CC form detection
│   │   ├── security/
│   │   │   ├── phishing.ts      ← URL reputation + visual similarity
│   │   │   └── alerts.ts        ← Contextual security alert engine
│   │   └── config/
│   │       ├── feature-flags.ts ← AI feature toggle system
│   │       └── settings.ts      ← BYOK key management, provider config
│   ├── __tests__/               ← Vitest tests mirroring src/ structure
│   ├── package.json
│   ├── tsconfig.json
│   └── vitest.config.ts
├── types/src/
│   ├── ai.ts                    ← NEW: AI-related types (provider configs, agent actions, health reports)
│   └── ... (existing: api.ts, crypto.ts, guards.ts, vault.ts, index.ts)
├── crypto/src/
│   ├── breach.ts                ← NEW: HIBP k-anonymity checking
│   └── ... (existing: encryption.ts, hkdf.ts, index.ts, kdf.ts, keys.ts, utils.ts)
└── generator/src/
    ├── smart.ts                 ← NEW: Context-aware generation (site rules)
    └── ... (existing: index.ts, passphrase.ts, random.ts, strength.ts, wordlist.ts)
```

### Dependency Graph

```
@lockbox/types ← @lockbox/ai ← apps/web, apps/extension, apps/mobile
                 @lockbox/crypto (breach.ts)
                 @lockbox/generator (smart.ts)
                 apps/api (Workers AI bindings)
```

### New Dependencies

| Package                | Version | Purpose                                                   | Size Impact |
| ---------------------- | ------- | --------------------------------------------------------- | ----------- |
| `@xenova/transformers` | ^3.x    | On-device embeddings + classification (browser/extension) | ~2MB (WASM) |
| `ai` (Vercel AI SDK)   | ^4.x    | Unified provider abstraction, streaming, tool-use         | ~50KB       |
| —                      | —       | ML Kit (Android native, no npm)                           | Native      |

---

## Privacy Architecture

### Data Classification

| Data Type                                            | Sensitivity  | Allowed Destinations                              |
| ---------------------------------------------------- | ------------ | ------------------------------------------------- |
| Vault item contents (passwords, notes, card numbers) | **CRITICAL** | Client-side ONLY — never leaves device            |
| Vault metadata (item names, URIs, tags, folders)     | **HIGH**     | Client-side preferred, BYOK LLM with user consent |
| URL being visited                                    | **MEDIUM**   | CF Workers AI (URL reputation), on-device         |
| Password hash prefixes (5 chars)                     | **LOW**      | HIBP API (k-anonymity — safe by design)           |
| Aggregate stats ("12 weak passwords, 3 reused")      | **LOW**      | BYOK LLM for summarization                        |
| Page DOM structure (form fields, input types)        | **LOW**      | On-device ML only                                 |

### Agent Privacy Model

The vault agent operates via **tool-use pattern**:

1. User sends natural language request → client prepends system prompt
2. System prompt + user message sent to BYOK LLM (user's API key, user's chosen provider)
3. LLM returns **tool calls** (e.g., `search_vault({query: "banking"})`) — NOT raw answers
4. Client executes tool calls **locally** against decrypted vault
5. Tool results (sanitized) returned to LLM for next step
6. LLM never receives raw vault contents — only tool schemas and sanitized results

**Sanitization rules**:

- Passwords → NEVER sent to LLM (replaced with `[REDACTED]`)
- Card numbers → NEVER sent (replaced with `****1234`)
- TOTP secrets → NEVER sent
- Usernames, item names, URLs → sent to BYOK LLM only (user's own provider)

### BYOK Key Storage

- API key encrypted with user's master key (same AES-256-GCM as vault items)
- Stored as a special vault item type (`type: 'ai_config'`) or in client-side encrypted settings
- Never transmitted to Lockbox servers
- Decrypted client-side only when making LLM calls

---

## Phase 1

### Phase 1 — Foundation + Quick Wins (Weeks 1–3)

**Goal**: Ship the AI infrastructure + 3 high-value features that don't require LLM integration.

---

### Task 1.1: AI Types (`@lockbox/types`)

**Priority**: P0 (blocks everything else)
**Depends on**: Nothing
**Effort**: 0.5 days

**What**: Add AI-related type definitions to the shared types package.

**Create**: `packages/types/src/ai.ts`

```typescript
// Types to define:

/** LLM provider identifier */
type AIProvider =
  | 'openrouter'
  | 'vercel'
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'ollama'
  | 'workers-ai';

/** BYOK provider configuration (stored encrypted) */
interface AIProviderConfig {
  provider: AIProvider;
  apiKey?: string; // Encrypted — absent for workers-ai and ollama
  baseUrl?: string; // Custom endpoint (ollama localhost, self-hosted)
  model?: string; // Model override
  enabled: boolean;
}

/** AI feature flags */
interface AIFeatureFlags {
  passwordHealth: boolean;
  breachMonitoring: boolean;
  smartAutofill: boolean;
  semanticSearch: boolean;
  phishingDetection: boolean;
  autoCategorization: boolean;
  chatAssistant: boolean;
  securityCopilot: boolean;
}

/** Password health report for a single item */
interface PasswordHealthReport {
  itemId: string;
  score: number; // 0-4 (zxcvbn scale)
  issues: PasswordIssue[];
  lastChecked: string; // ISO 8601
}

type PasswordIssue =
  | { type: 'weak'; score: number }
  | { type: 'reused'; sharedWith: string[] } // item IDs
  | { type: 'old'; daysSinceChange: number }
  | { type: 'breached'; breachDate?: string };

/** Aggregate vault health */
interface VaultHealthSummary {
  totalItems: number;
  weak: number;
  reused: number;
  old: number;
  breached: number;
  strong: number;
  overallScore: number; // 0-100
}

/** Agent tool call types */
interface AgentToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

interface AgentToolResult {
  name: string;
  result: unknown;
  error?: string;
}

/** Breach check result */
interface BreachCheckResult {
  hashPrefix: string;
  found: boolean;
  count: number; // Number of times seen in breaches
  checkedAt: string; // ISO 8601
}
```

**Modify**: `packages/types/src/index.ts` — add `export * from './ai.js';`

**Acceptance criteria**:

- [ ] All types exported from `@lockbox/types`
- [ ] No `any` types
- [ ] Types build cleanly (`bun run typecheck`)
- [ ] Existing tests still pass

---

### Task 1.2: `@lockbox/ai` Package Scaffold

**Priority**: P0 (blocks all AI features)
**Depends on**: Task 1.1
**Effort**: 1 day

**What**: Create the new `@lockbox/ai` package with provider abstraction layer.

**Create**:

- `packages/ai/package.json` — name `@lockbox/ai`, deps on `@lockbox/types`, `ai` (Vercel AI SDK)
- `packages/ai/tsconfig.json` — extends `../../tsconfig.base.json`
- `packages/ai/vitest.config.ts` — matches existing package patterns
- `packages/ai/src/index.ts` — barrel export
- `packages/ai/src/providers/types.ts` — `LLMProvider` interface:
  ```typescript
  interface LLMProvider {
    id: AIProvider;
    chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
    chatStream(messages: Message[], options?: ChatOptions): AsyncIterable<ChatChunk>;
    embed?(text: string): Promise<number[]>;
    supportsToolUse: boolean;
  }
  ```
- `packages/ai/src/providers/openrouter.ts` — implements `LLMProvider` via Vercel AI SDK
- `packages/ai/src/providers/ollama.ts` — implements `LLMProvider` for localhost
- `packages/ai/src/providers/workers-ai.ts` — thin wrapper for CF Workers AI bindings
- `packages/ai/src/config/feature-flags.ts` — runtime feature flag checks
- `packages/ai/src/config/settings.ts` — BYOK key management (encrypt/decrypt with master key)

**Modify**:

- `package.json` (root) — workspaces already include `packages/*`, so no change needed (verify)
- `turbo.json` — no change needed (tasks use `^build` pattern which auto-includes new packages)

**Acceptance criteria**:

- [ ] `bun install` resolves the new package
- [ ] `import { ... } from '@lockbox/ai'` works from all apps
- [ ] Provider interface is tested with mock implementations
- [ ] Feature flags default to `false` for all AI features
- [ ] Settings encrypt/decrypt API key roundtrip works
- [ ] `bun run typecheck` passes
- [ ] `bun run test` passes (new + existing)

---

### Task 1.3: Password Health Dashboard

**Priority**: P0 (highest user value, no external deps)
**Depends on**: Task 1.1
**Effort**: 3 days

**What**: Analyze all vault items for weak, reused, and old passwords. Show aggregate score + per-item issues.

**Create**:

- `packages/ai/src/health/analyzer.ts`:
  - `analyzeVaultHealth(items: LoginItem[]): VaultHealthSummary`
  - `analyzeItem(item: LoginItem, allItems: LoginItem[]): PasswordHealthReport`
  - Uses existing `zxcvbn` from `@lockbox/generator` for strength scoring
  - Reuse detection: SHA-256 hash comparison of all passwords (client-side)
  - Age detection: compare `updatedAt` against configurable threshold (default 90 days)
- `packages/ai/src/health/__tests__/analyzer.test.ts`

**Modify** (all surfaces):

**Web** (`apps/web`):

- Create `src/pages/Health.tsx` — full-page health dashboard
  - Circular progress showing overall score (0–100)
  - Cards: "X weak", "X reused", "X old", "X breached" with counts
  - Expandable list of affected items with one-click navigation
  - Tailwind v4, indigo-600 primary, full dark mode
- Create `src/components/HealthScore.tsx` — reusable score ring component
- Create `src/components/IssueList.tsx` — filterable issue list
- Create `src/store/health.ts` — Zustand store for health state
- Modify `src/App.tsx` — add `/health` route with `<ProtectedRoute>` wrapper (follows existing pattern in App.tsx lines 46–81)
- Modify sidebar/navigation in `src/pages/Vault.tsx` — add "Security" or "Health" nav item with shield icon

**Extension** (`apps/extension`):

- Modify `entrypoints/popup/App.tsx` — add compact health badge/section to the existing popup UI (this is a single-file SPA; all popup UI lives here)
- Note: WXT popup is a single `App.tsx` file. New UI sections are added directly to it, not as separate page files.

**Mobile** (`apps/mobile`):

- Create health screen component in `src/` (Capacitor-compatible)
- Integrate into mobile navigation

**Acceptance criteria**:

- [ ] Score correctly identifies weak (zxcvbn < 3), reused, old (> 90d) passwords
- [ ] Score of 100 when all passwords are strong, unique, and recent
- [ ] Dashboard loads in < 200ms for 500 items
- [ ] All analysis runs client-side (no network calls)
- [ ] Dark mode fully supported
- [ ] Tests cover edge cases: empty vault, all-weak, all-strong, mixed

---

### Task 1.4: HIBP Breach Checking

**Priority**: P0
**Depends on**: Task 1.1, Task 1.3 (integrates into health dashboard)
**Effort**: 3 days

**What**: Check passwords against Have I Been Pwned using k-anonymity API. Background periodic scanning with notifications.

**Create**:

- `packages/crypto/src/breach.ts`:
  - `checkPassword(password: string): Promise<BreachCheckResult>` — SHA-1 hash, send 5-char prefix to `api.pwnedpasswords.com/range/{prefix}`, match locally
  - `checkBatch(passwords: Array<{id: string, password: string}>): Promise<Map<string, BreachCheckResult>>` — rate-limited batch checking (100ms between calls per HIBP API guidelines)
- `packages/crypto/src/__tests__/breach.test.ts`

- `packages/ai/src/health/breach.ts`:
  - `BreachMonitor` class:
    - `startMonitoring(interval: number)` — default 24 hours
    - `stopMonitoring()`
    - `checkAll(items: LoginItem[]): Promise<BreachCheckResult[]>`
    - `onBreachFound(callback: (results: BreachCheckResult[]) => void)`
  - Stores last-check timestamps in client storage (localStorage/extension storage/SharedPreferences)
- `packages/ai/src/health/monitor.ts`:
  - Scheduler that runs breach checks in background
  - Extension: uses `chrome.alarms` API (permission already exists in `apps/extension/wxt.config.ts` line 10)
  - Web: uses `setInterval` with visibility check
  - Mobile: uses Capacitor Background Task API
- `packages/ai/src/health/__tests__/breach.test.ts`

**Modify**:

- `packages/crypto/src/index.ts` — export breach checking functions
- `packages/ai/src/health/analyzer.ts` — integrate breach results into `PasswordHealthReport`
- Health dashboard (all surfaces) — show breach count, breach details per item
- `apps/extension/entrypoints/popup/App.tsx` — add breach notification badge to popup UI
- `apps/extension/entrypoints/background.ts` — register `chrome.alarms` listener for periodic breach scanning

**Acceptance criteria**:

- [ ] Only 5-character SHA-1 prefix sent to HIBP (k-anonymity verified)
- [ ] Rate limiting: max 1 request per 100ms to HIBP API
- [ ] Background monitoring runs every 24h (configurable)
- [ ] Results cached locally to avoid redundant checks
- [ ] User notification when new breach detected
- [ ] Graceful degradation when offline (skip check, use cached results)
- [ ] Tests mock HIBP API responses

---

### Task 1.5: AI Settings Panel

**Priority**: P1
**Depends on**: Task 1.2
**Effort**: 2 days

**What**: Settings UI for BYOK key management, provider selection, privacy controls, and feature toggles.

**Create / Modify** (all surfaces):

**Web** (`apps/web`):

- Create `src/pages/AISettings.tsx`:
  - Provider configuration section: dropdown (OpenRouter/Vercel/OpenAI/Anthropic/Google/Ollama), API key input (masked), model selector, test connection button
  - Feature toggles: checkboxes for each AI feature (health, breach, autofill, search, phishing, chat, copilot)
  - Privacy section: explain what data goes where, link to privacy architecture
  - "Clear AI Data" button: wipe cached embeddings, breach results, etc.
- Modify `src/pages/Settings.tsx` — add "AI & Intelligence" section with link to `/settings/ai`
- Modify `src/App.tsx` — add `/settings/ai` route with `<ProtectedRoute>` wrapper (following the existing `/settings/import-export` nested route pattern at line 74–81)

**Extension** (`apps/extension`):

- Modify `entrypoints/popup/App.tsx` — add AI settings section to the popup's settings area (inline within the single-file SPA, or as a toggled panel)

**Mobile** (`apps/mobile`):

- Create AI settings screen in mobile settings flow

**Acceptance criteria**:

- [ ] API key stored encrypted (using master key via `@lockbox/crypto`)
- [ ] API key never displayed in plaintext after initial entry (masked with dots)
- [ ] Test connection button validates the key works
- [ ] Feature toggles persist across sessions
- [ ] Settings sync across surfaces (stored as encrypted vault item or extension sync storage)
- [ ] Dark mode supported

---

### Task 1.6: Smart Autofill Improvements

**Priority**: P1
**Depends on**: Task 1.2
**Effort**: 3 days

**What**: ML-based form field classification in the extension to better detect login vs signup vs credit card forms.

**Create**:

- `packages/ai/src/autofill/classifier.ts`:
  - `classifyForm(formElement: FormMetadata): FormClassification` — analyzes input types, labels, names, autocomplete attributes, surrounding text
  - `classifyField(fieldElement: FieldMetadata): FieldClassification` — identify username, email, password, new-password, CC number, CVV, expiry, address fields
  - Uses heuristic-first approach (attribute analysis) with ML fallback (Transformers.js tiny classifier)
  - Returns confidence score (0–1) for each classification
- `packages/ai/src/autofill/detector.ts`:
  - `detectFormType(fields: FieldClassification[]): 'login' | 'signup' | 'card' | 'address' | 'unknown'`
  - Confidence thresholds: > 0.8 auto-fill, 0.5–0.8 suggest, < 0.5 don't fill
- `packages/ai/src/autofill/__tests__/classifier.test.ts` — test with HTML snapshots of common sites

**Modify**:

- `apps/extension/lib/autofill.ts` — integrate new classifier into existing `fillForm`, `createSuggestionDropdown` functions
- `apps/extension/lib/form-detector.ts` — replace simple heuristics in `detectForms` and `urlMatchesUri` with calls to `classifyForm` from `@lockbox/ai`
- `apps/extension/entrypoints/content.ts` — update content script to use new detection pipeline (currently imports from `../lib/form-detector.js` and `../lib/autofill.js`)

**Acceptance criteria**:

- [ ] Correctly classifies login, signup, and CC forms on top 50 websites
- [ ] Confidence scoring prevents wrong autofills (no false positives above 0.8)
- [ ] Classifier runs in < 50ms per form
- [ ] Falls back to existing heuristics if ML model fails to load
- [ ] Extension bundle size increase < 500KB
- [ ] Tests include HTML fixtures for common form patterns

---

## Phase 2

### Phase 2 — Intelligence Layer (Weeks 4–6)

**Goal**: Add features that make the vault actively intelligent — search, detection, categorization.

---

### Task 2.1: Natural Language Vault Search

**Priority**: P0
**Depends on**: Task 1.2
**Effort**: 4 days

**What**: Search vault with natural language queries like "show me banking passwords" or "which logins use my work email".

**Create**:

- `packages/ai/src/search/embeddings.ts`:
  - `EmbeddingEngine` class:
    - Uses `@xenova/transformers` with `all-MiniLM-L6-v2` model (~23MB)
    - `embed(text: string): Promise<Float32Array>` — generate embedding for text
    - `embedBatch(texts: string[]): Promise<Float32Array[]>` — batch embedding
    - Lazy model loading — only download when search feature first used
    - Cache embeddings in IndexedDB (web/extension) / SQLite (mobile)
  - Model loading progress callback for UI
- `packages/ai/src/search/semantic.ts`:
  - `SemanticSearch` class:
    - `index(items: VaultItem[]): Promise<void>` — compute + cache embeddings for all items
    - `search(query: string, limit?: number): Promise<SearchResult[]>` — embed query → cosine similarity → rank
    - `reindex(changedItems: VaultItem[]): Promise<void>` — incremental updates
    - Hybrid: semantic search + keyword fallback for exact matches
  - `SearchResult`: `{ item: VaultItem, score: number, matchType: 'semantic' | 'keyword' }`
- `packages/ai/src/search/__tests__/semantic.test.ts`

**Modify** (all surfaces):

- `apps/web/src/pages/Vault.tsx` — add "AI Search" toggle or unified smart search to existing vault search bar
- `apps/extension/entrypoints/popup/App.tsx` — integrate semantic search into popup's search functionality
- Mobile search — integrate semantic search
- All search UIs: show loading state during initial model download

**Acceptance criteria**:

- [ ] "banking passwords" finds items with bank URIs/names even without "bank" keyword
- [ ] "work email accounts" finds items associated with work email
- [ ] First search triggers model download (~23MB) with progress indicator
- [ ] Subsequent searches complete in < 100ms for 1000 items
- [ ] Embeddings cached — no recomputation on app restart
- [ ] Incremental reindex when items added/modified
- [ ] Falls back to keyword search if model download fails
- [ ] All processing client-side

---

### Task 2.2: Phishing Detection

**Priority**: P0
**Depends on**: Task 1.2
**Effort**: 4 days

**What**: Real-time phishing detection in the extension. Warn users before they enter credentials on suspicious sites.

**Create**:

- `packages/ai/src/security/phishing.ts`:
  - `PhishingDetector` class:
    - `analyzeUrl(url: string): PhishingResult` — check against known patterns
    - URL similarity scoring (Levenshtein distance to legitimate domains)
    - Homoglyph detection (cyrillic lookalikes: аpple.com vs apple.com)
    - Certificate validation (self-signed, recently issued, mismatch)
    - Domain age check (newly registered domains = suspicious)
  - `PhishingResult`: `{ safe: boolean, score: number, reasons: string[] }`
- `packages/ai/src/security/alerts.ts`:
  - `SecurityAlertEngine`:
    - `checkUrl(url: string, vaultItems: LoginItem[]): SecurityAlert[]`
    - Alert types: phishing, breach-site, http-only, cert-warning
    - Integrates with breach database (if site URL matches known breached domain)

**Modify**:

- `apps/extension/entrypoints/background.ts` — add `webNavigation.onCompleted` listener for phishing checks on page navigation
- `apps/extension/entrypoints/popup/App.tsx` — show phishing warnings before autofill in popup UI
- `apps/extension/entrypoints/content.ts` — inject warning banner on suspicious pages

**Extension permissions**: Phase 2 requires adding `webNavigation` permission to `apps/extension/wxt.config.ts` line 10 (add to existing permissions array: `['storage', 'activeTab', 'alarms', 'scripting', 'webNavigation']`)

**API** (`apps/api`):

- Optional: Add Workers AI endpoint for URL reputation checks against larger databases
- Create `apps/api/src/routes/ai.ts` — `POST /api/ai/url-check` endpoint; receives URL hash, returns reputation score from CF Workers AI
- Modify `apps/api/src/index.ts` — mount the new `ai` route
- Server never sees the actual URL if using hash-based lookup

**Acceptance criteria**:

- [ ] Detects common phishing patterns (typosquatting, homoglyphs, IP-based URLs)
- [ ] Warning shown BEFORE autofill triggers on suspicious sites
- [ ] False positive rate < 1% on top 1000 Alexa sites
- [ ] Check completes in < 100ms (no autofill delay)
- [ ] Works offline (local checks only, skip server reputation check)
- [ ] User can dismiss/whitelist false positives

---

### Task 2.3: Auto-Categorization

**Priority**: P1
**Depends on**: Task 2.1 (uses embedding infrastructure)
**Effort**: 2 days

**What**: Automatically suggest tags, folders, and detect duplicate credentials.

**Create**:

- `packages/ai/src/categorize/categorizer.ts`:
  - `suggestTags(item: VaultItem): string[]` — analyze item name + URIs to suggest tags (e.g., "banking", "social", "shopping", "work")
  - `suggestFolder(item: VaultItem, folders: Folder[]): string | null` — suggest best existing folder
  - `detectDuplicates(items: VaultItem[]): DuplicateGroup[]` — same URI + similar credentials
  - Uses embedding similarity for semantic grouping
- `packages/ai/src/categorize/__tests__/categorizer.test.ts`

**Modify** (all surfaces):

- `apps/web/src/components/ItemPanel.tsx` — show tag/folder suggestions inline when creating/editing items
- `apps/web/src/pages/Vault.tsx` — add "Organize" button that batch-applies suggestions
- `apps/extension/entrypoints/popup/App.tsx` — show tag suggestions in popup when saving new items
- Mobile item views — show tag/folder suggestions
- AI settings (all surfaces) — auto-categorization toggle

**Acceptance criteria**:

- [ ] Correct category for 90%+ of common sites (banks, social media, email, shopping)
- [ ] Duplicate detection with > 95% precision
- [ ] Suggestions shown as chips that can be accepted/dismissed
- [ ] No destructive actions without user confirmation
- [ ] All processing client-side

---

### Task 2.4: Contextual Security Alerts

**Priority**: P1
**Depends on**: Task 1.4 (breach data), Task 2.2 (phishing)
**Effort**: 2 days

**What**: Proactive alerts like "This site was breached 3 days ago — rotate this password now".

**Create**:

- `packages/ai/src/security/contextual.ts`:
  - `ContextualAlertEngine`:
    - Takes current URL + vault items → produces relevant alerts
    - Alert types:
      - `breach-recent`: Site in vault was recently breached
      - `password-weak`: Current site has a weak password
      - `password-reused`: Current site's password is reused elsewhere
      - `password-old`: Current site's password hasn't been changed in > 90 days
    - Each alert has: severity (critical/warning/info), message, action (one-click password change)
- `packages/ai/src/security/__tests__/contextual.test.ts`

**Modify**:

- `apps/extension/entrypoints/popup/App.tsx` — show contextual alerts when on a relevant site
- `apps/extension/entrypoints/content.ts` — optional banner alerts on page
- `apps/web/src/components/ItemPanel.tsx` — show alerts per item in vault item detail view
- Mobile item detail — show alerts per item

**Acceptance criteria**:

- [ ] Alert appears within 1s of navigating to a relevant site
- [ ] "Rotate Now" action opens password generator pre-configured for the site
- [ ] Alerts dismissible per-item (don't re-show for same issue)
- [ ] Severity correctly prioritized (breach > reused > weak > old)

---

### Task 2.5: Smart Password Generation

**Priority**: P1
**Depends on**: Task 1.2
**Effort**: 2 days

**What**: Detect site password requirements from DOM and generate compliant passwords.

**Create**:

- `packages/generator/src/smart.ts`:
  - `detectPasswordRules(formMetadata: FormMetadata): PasswordRules` — parse `minlength`, `maxlength`, `pattern`, `title`, aria attributes, visible requirement text
  - `generateCompliant(rules: PasswordRules): string` — generate password meeting detected requirements
  - `PasswordRules`: `{ minLength, maxLength, requireUppercase, requireLowercase, requireDigit, requireSpecial, allowedSpecialChars, forbiddenChars }`
- `packages/generator/src/__tests__/smart.test.ts`

**Modify**:

- `apps/extension/lib/autofill.ts` — auto-detect rules when filling signup forms and pass to generator
- `apps/extension/entrypoints/popup/App.tsx` — show detected rules in popup generator, pre-configure generator settings
- `packages/generator/src/index.ts` — export smart generation functions

**Acceptance criteria**:

- [ ] Correctly detects rules on top 20 sites with strict requirements (banks, gov)
- [ ] Generated passwords always satisfy detected rules
- [ ] Falls back to default generation if no rules detected
- [ ] Rules shown to user before generation ("Detected: 8-16 chars, must include digit")
- [ ] Extension-only for DOM detection; shared package for rule-based generation

---

## Phase 3

### Phase 3 — Autonomous Agent (Weeks 7–10)

**Goal**: Ship the chat-first vault experience and proactive security copilot.

---

### Task 3.1: Agent Tool System

**Priority**: P0 (blocks 3.2, 3.3, 3.4)
**Depends on**: Task 1.2
**Effort**: 3 days

**What**: Define and implement the tool-use interface that the vault agent operates through.

**Create**:

- `packages/ai/src/agent/tools.ts`:
  - Tool definitions (JSON Schema for LLM function calling):
    - `search_vault` — search items by query (keyword or semantic)
    - `get_item` — get specific item by ID (returns sanitized — no passwords)
    - `create_item` — create new vault item
    - `update_item` — update existing item
    - `delete_item` — delete item
    - `generate_password` — generate password with options
    - `check_breach` — check password against HIBP
    - `get_health_report` — get vault health summary
    - `list_folders` — list folders
    - `organize_item` — move item to folder, add tags
  - Each tool has: name, description, parameters (JSON Schema), confirmation_required (boolean)
- `packages/ai/src/agent/executor.ts`:
  - `ToolExecutor` class:
    - Takes tool call from LLM → validates → executes locally → returns result
    - `execute(call: AgentToolCall, context: AgentContext): Promise<AgentToolResult>`
    - `AgentContext`: contains decrypted vault, crypto keys, store dispatch functions
    - Sanitizes all results before returning to LLM (strips passwords, card numbers)
- `packages/ai/src/agent/safety.ts`:
  - `SafetyGate`:
    - Tools marked `confirmation_required` pause execution and ask user
    - Rate limiting: max 10 tool calls per conversation turn
    - Action validation: prevent destructive patterns (e.g., "delete all items")
    - Audit log: every agent action logged locally
- `packages/ai/src/agent/__tests__/tools.test.ts`
- `packages/ai/src/agent/__tests__/executor.test.ts`
- `packages/ai/src/agent/__tests__/safety.test.ts`

**Acceptance criteria**:

- [ ] All tools execute client-side only
- [ ] Password/card/TOTP data never appears in tool results sent to LLM
- [ ] Destructive tools (delete, update) require user confirmation
- [ ] Rate limiting prevents runaway tool loops
- [ ] Tool schemas valid for OpenAI/Anthropic function calling format
- [ ] 100% test coverage on safety gates

---

### Task 3.2: Vault Chat Assistant

**Priority**: P0
**Depends on**: Task 3.1, Task 1.5 (BYOK configured)
**Effort**: 5 days

**What**: Natural language chat interface for interacting with the vault.

**Create**:

- `packages/ai/src/agent/vault-agent.ts`:
  - `VaultAgent` class:
    - `chat(message: string, history: Message[]): AsyncIterable<AgentEvent>`
    - Implements agentic loop: send → receive tool calls → execute → send results → repeat
    - System prompt defines agent personality, capabilities, safety rules
    - Streaming responses via AsyncIterable
  - `AgentEvent`:
    - `{ type: 'text', content: string }` — streamed text
    - `{ type: 'tool_call', call: AgentToolCall }` — tool invocation
    - `{ type: 'tool_result', result: AgentToolResult }` — tool result
    - `{ type: 'confirmation_needed', call: AgentToolCall }` — needs user approval
    - `{ type: 'error', error: string }` — error
    - `{ type: 'done' }` — conversation complete
- `packages/ai/src/prompts/system.ts`:
  - System prompt template for vault agent
  - Includes: capabilities, safety rules, response formatting, tool usage guidelines

**Modify** (all surfaces):

**Web** (`apps/web`):

- Create `src/pages/Chat.tsx` — full chat interface
  - Message list with user/assistant messages
  - Streaming text display
  - Tool call visualization (show what agent is doing)
  - Confirmation dialogs for destructive actions
  - Input bar with send button
- Create `src/store/chat.ts` — Zustand store for conversation history, agent state
- Modify `src/App.tsx` — add `/chat` route with `<ProtectedRoute>` wrapper
- Modify navigation (sidebar in `src/pages/Vault.tsx` or layout) — add "Chat" / "Assistant" nav item with sparkle icon

**Extension** (`apps/extension`):

- Modify `entrypoints/popup/App.tsx` — add chat panel or chat toggle within the popup UI (compact chat optimized for extension dimensions)

**Mobile** (`apps/mobile`):

- Create chat screen in mobile navigation
- Full-screen chat interface

**Acceptance criteria**:

- [ ] "Generate a strong password for my bank and save it" → creates item with generated password
- [ ] "What passwords have I reused?" → runs health check, lists affected items
- [ ] "Move all social media accounts to the Social folder" → organizes items (with confirmation)
- [ ] Streaming responses feel responsive (first token < 2s)
- [ ] Confirmation dialog appears before any create/update/delete
- [ ] Conversation history persists within session
- [ ] Works with OpenRouter, Vercel, OpenAI, Anthropic, Google, Ollama
- [ ] Graceful error handling when API key invalid or provider unavailable
- [ ] No vault data visible in browser network tab (BYOK = user's own API calls)

---

### Task 3.3: Proactive Security Copilot

**Priority**: P1
**Depends on**: Task 1.3, Task 1.4, Task 2.4, Task 3.1
**Effort**: 3 days

**What**: Background agent that monitors security posture and nudges users to improve.

**Create**:

- `packages/ai/src/copilot/engine.ts`:
  - `SecurityCopilot` class:
    - `evaluate(vault: LoginItem[]): SecurityPosture`
    - Runs all analyzers: health, breach, age, reuse, strength distribution
    - Generates prioritized action items
    - Tracks improvement over time (score history in local storage)
  - `SecurityPosture`:
    - `score: number` (0–100)
    - `trend: 'improving' | 'stable' | 'declining'`
    - `actions: SecurityAction[]` (prioritized list)
  - `SecurityAction`:
    - `priority: 'critical' | 'high' | 'medium' | 'low'`
    - `type: 'rotate' | 'strengthen' | 'deduplicate' | 'enable-2fa'`
    - `affectedItems: string[]`
    - `message: string` (human-readable)
- `packages/ai/src/copilot/scheduler.ts`:
  - Runs posture evaluation daily (or on vault change)
  - Surfaces top actions as notifications
- `packages/ai/src/copilot/__tests__/engine.test.ts`

**Modify** (all surfaces):

- `apps/web/src/pages/Vault.tsx` or `src/pages/Health.tsx` — security posture widget (score + trend + top 3 actions)
- `apps/extension/entrypoints/popup/App.tsx` — badge/notification for critical security actions
- `apps/extension/entrypoints/background.ts` — schedule copilot evaluation via `chrome.alarms`
- Mobile — push notifications for critical actions

**Acceptance criteria**:

- [ ] Score accurately reflects vault security (verified against known-bad test vaults)
- [ ] Actions prioritized correctly (breached > reused > weak > old)
- [ ] Trend tracks improvement over time
- [ ] Notifications not spammy (max 1/day, only for critical changes)
- [ ] All analysis client-side

---

### Task 3.4: Credential Lifecycle Management

**Priority**: P2
**Depends on**: Task 3.3
**Effort**: 2 days

**What**: Track password age, suggest rotation schedules, detect shared passwords.

**Create**:

- `packages/ai/src/lifecycle/tracker.ts`:
  - `LifecycleTracker`:
    - `getRotationSchedule(items: LoginItem[]): RotationSchedule[]`
    - Suggests rotation based on: item importance (banking > social), age, breach status
    - Configurable rotation intervals per category
  - `RotationSchedule`: `{ itemId, lastRotated, nextRotation, urgency }`
- `packages/ai/src/lifecycle/__tests__/tracker.test.ts`

**Modify** (all surfaces):

- `apps/web/src/components/ItemPanel.tsx` — show "last changed X days ago" and rotation suggestion in item detail view
- `apps/web/src/pages/Health.tsx` — "Due for rotation" section on health dashboard
- `apps/extension/entrypoints/popup/App.tsx` — rotation indicators in popup
- Security copilot — rotation reminders in action items

**Acceptance criteria**:

- [ ] Banking/financial items flagged at 60 days
- [ ] Other items flagged at 90 days
- [ ] Configurable per-item rotation intervals
- [ ] "Rotate now" action opens password generator for that item

---

## Cross-Cutting Concerns

### Turbo/Build Configuration

- The root `package.json` workspaces pattern `["apps/*", "packages/*"]` already includes new packages — no change needed
- `turbo.json` uses `^build` dependency pattern which auto-discovers new packages — no change needed
- Update CI workflow to include new package tests (`cd packages/ai && npx vitest run`)

### Extension Permissions

Current permissions in `apps/extension/wxt.config.ts` (line 10): `['storage', 'activeTab', 'alarms', 'scripting']`

- `alarms` — **Already present**. Used for background monitoring scheduling.
- `webNavigation` — **Needs to be added in Phase 2** (Task 2.2 phishing detection). Add to the existing permissions array.

### Mobile Native Plugins

If using ML Kit for on-device inference on Android:

- Create Capacitor plugin in `apps/mobile/src/plugins/mlkit.ts` (TypeScript bridge, following existing pattern in `apps/mobile/src/plugins/autofill.ts`, `biometric.ts`)
- Create native Kotlin implementation at `apps/mobile/android/app/src/main/java/.../MLKitPlugin.kt`
- Bridge to TypeScript via Capacitor plugin API (same pattern as existing plugins in `apps/mobile/src/plugins/`)

### Migration / Rollout

- All AI features behind feature flags (default OFF)
- Phase 1 features enabled by default after testing
- Phase 2-3 features opt-in until stable
- No DB migrations required (all AI state is client-side)
- No breaking changes to existing API endpoints

### Performance Budgets

| Metric                         | Budget                        |
| ------------------------------ | ----------------------------- |
| Health analysis (500 items)    | < 200ms                       |
| Breach check (single)          | < 500ms (network included)    |
| Semantic search (1000 items)   | < 100ms (after initial index) |
| Embedding model download       | ~23MB one-time                |
| Form classification            | < 50ms                        |
| Phishing URL check             | < 100ms                       |
| Chat first-token latency       | < 2s (depends on provider)    |
| Extension bundle size increase | < 2MB                         |

---

## Risk Register

| Risk                                              | Likelihood | Impact   | Mitigation                                                                                            |
| ------------------------------------------------- | ---------- | -------- | ----------------------------------------------------------------------------------------------------- |
| **Transformers.js model too large for extension** | Medium     | High     | Use quantized models (~5MB), lazy load, cache in extension storage                                    |
| **HIBP rate limiting**                            | Medium     | Medium   | Batch checks with 100ms delay, cache results 24h, respect 429 responses                               |
| **LLM hallucinations in agent**                   | High       | High     | Strict tool-use pattern (never trust raw LLM text for actions), confirmation gates, sanitized results |
| **Agent deletes wrong items**                     | Medium     | Critical | Confirmation required for ALL destructive actions, undo support, audit log                            |
| **BYOK key leakage**                              | Low        | Critical | Key encrypted with master key, never sent to Lockbox servers, memory-only decryption                  |
| **Provider API breaking changes**                 | Medium     | Medium   | Vercel AI SDK abstracts provider differences, pin versions                                            |
| **Phishing false positives**                      | Medium     | Medium   | Whitelist mechanism, conservative thresholds, user feedback loop                                      |
| **Performance degradation on large vaults**       | Medium     | Medium   | Lazy loading, web workers for heavy computation, pagination                                           |
| **Model download fails**                          | Medium     | Low      | Graceful fallback to keyword search / heuristic autofill                                              |
| **Privacy perception issue**                      | Medium     | High     | Clear UI showing what data goes where, privacy-first defaults (all AI off until enabled)              |

---

## Testing Strategy

### Unit Tests (Vitest)

Every module in `packages/ai/src/` gets a corresponding `__tests__/` file:

- Health analyzer with known-score test vaults
- Breach checker with mocked HIBP responses
- Form classifier with HTML fixtures
- Phishing detector with known-good and known-bad URLs
- Agent tools with mock vault data
- Safety gates with adversarial inputs
- Semantic search with known-similar items

### Integration Tests

- Provider adapters tested against mock HTTP servers (not real APIs)
- Agent loop tested end-to-end with mock LLM responses
- BYOK key round-trip (encrypt → store → decrypt → use)

### Manual Testing Checklist

- [ ] Health dashboard shows correct scores for test vault
- [ ] Breach monitoring detects known-breached password ("password123")
- [ ] Autofill correctly classifies forms on: Google login, Amazon signup, Stripe checkout
- [ ] Phishing warning appears on typosquatted domain
- [ ] Chat assistant can: search, create, organize items
- [ ] All features work in dark mode
- [ ] All features work offline (graceful degradation)
- [ ] Extension bundle size within budget

### Test Commands

```bash
bun run test                                    # All (existing + new)
cd packages/ai && npx vitest run               # AI package only
cd packages/crypto && npx vitest run           # Breach checking
cd packages/generator && npx vitest run        # Smart generation
```

---

## Excluded

These are explicitly out of scope for this plan:

| Feature                     | Reason                                                     |
| --------------------------- | ---------------------------------------------------------- |
| Passkey management          | Orthogonal to AI, separate feature track                   |
| Email alias generation      | Requires external provider integration (SimpleLogin, etc.) |
| Biometric auth improvements | Platform-specific, not AI-related                          |
| Team/sharing features       | Requires auth model changes (multi-user encryption)        |
| Custom model training       | Too complex, not enough value for self-hosted product      |
| Voice input                 | Niche use case, consider post-Phase 3                      |
