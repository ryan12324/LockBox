# Lockbox UX Redesign — "Ghost in the Vault / Aura & Architecture"

## TL;DR

> **Quick Summary**: Transform Lockbox from a CSS-token-reskinned app into a fully component-driven, Aura-animated UX across web vault, browser extension, and supporting screens. The AI agent _is_ the interface — Aura breathes, reacts, and guides.
>
> **Deliverables**:
>
> - Round-trip encryption tests for all 6 item types
> - 3 new design system components (Select, Textarea, Modal)
> - AuraProvider + ToastProvider infrastructure
> - ItemPanel.tsx decomposed from 2,282-line monolith into 8+ sub-components
> - All 21 web TSX files migrated from raw HTML to `@lockbox/design` components
> - 5 strategic animations wired (copy squish, search typography, page fade-in, Aura breathing, toast entrance)
> - Extension popup decomposed from 4,693-line monolith into 13+ view files
> - Full light/dark mode parity
>
> **Estimated Effort**: XL (35 tasks across 6 waves)
> **Parallel Execution**: YES — 6 waves, up to 8 concurrent tasks per wave
> **Critical Path**: T1 (encryption tests) → T5 (ItemPanel decomp) → T12 (vault list redesign) → T13 (item detail redesign) → T25 (extension decomp) → Final QA

---

## Context

### Original Request

Full UX transformation of Lockbox password manager across web, extension, and mobile surfaces. The design system (`@lockbox/design`) is built with 6 components (Button, Input, Card, Badge, Toast, Aura) and CSS tokens are swapped. Now the actual UX work: component adoption, Aura integration, monolith decomposition, animation wiring, and screen-by-screen redesign.

### Current State (Verified via Codebase Exploration)

- **0 imports from `@lockbox/design`** in `apps/web/src/` — reskin was CSS-token-only, no component adoption yet
- **267 raw `<button>/<input>/<textarea>/<select>`** across 21 web TSX files
- **ItemPanel.tsx**: 2,282 lines, 95 raw form elements, handles all 6 item types inline
- **Extension App.tsx**: 4,693 lines, 13 views in one file (SetupView, LoginView, tabs, detail, add, edit, health, ai-settings, chat, hw-keys, qr-sync, trash, settings, emergency, history)
- **No `providers/` directory** exists under `apps/web/src/`
- **Existing crypto tests** cover only `login` type round-trips — need card, identity, note, passkey, document
- **Design system components** use inline `React.CSSProperties` style objects (not Tailwind classes)
- **Missing design components**: Select, Textarea, Modal
- **Stores**: Zustand at `apps/web/src/store/` — auth, vault, search, health, chat, teams
- **Test infrastructure**: Vitest with 52 web tests, 108 API tests, 51 extension tests, 84 mobile tests
- **1,012+ tests passing** across all apps

### Interview Summary

**Key Decisions**:

- Metis directives approved as the phasing strategy
- Strategic animations only (~5 touch points) — not animation-heavy
- Card variant="frost" restricted to overlays/modals (performance concern)
- Extension content scripts are DONE — don't touch them
- Full light/dark mode parity required

### Metis Review

**Identified Gaps** (addressed in plan):

- Encryption tests MUST precede ItemPanel decomposition (safety net)
- AuraProvider and ToastProvider are infrastructure dependencies — must be Wave 1
- Extension decomposition is independent from web work — can overlap
- Mobile surface excluded from this plan (Capacitor Android — separate planning cycle)

---

## Work Objectives

### Core Objective

Replace all raw HTML form elements with `@lockbox/design` components, decompose monolithic files, wire Aura as the ambient AI presence, and add 5 strategic animations — across web and extension surfaces.

### Concrete Deliverables

- `packages/design/src/components/Select.tsx` — new component
- `packages/design/src/components/Textarea.tsx` — new component
- `packages/design/src/components/Modal.tsx` — new component
- `apps/web/src/providers/AuraProvider.tsx` — Zustand store + React context
- `apps/web/src/providers/ToastProvider.tsx` — React context + toast queue
- `apps/web/src/components/item-fields/LoginFields.tsx` — extracted from ItemPanel
- `apps/web/src/components/item-fields/CardFields.tsx` — extracted
- `apps/web/src/components/item-fields/IdentityFields.tsx` — extracted
- `apps/web/src/components/item-fields/NoteFields.tsx` — extracted
- `apps/web/src/components/item-fields/PasskeyFields.tsx` — extracted
- `apps/web/src/components/item-fields/DocumentFields.tsx` — extracted
- `apps/web/src/components/item-fields/CustomFieldsSection.tsx` — extracted
- `apps/web/src/components/item-fields/SecurityAlertsSection.tsx` — extracted
- All 21 web TSX files migrated to design system components
- Extension popup split into 13+ view files under `apps/extension/entrypoints/popup/views/`
- 5 CSS animation keyframes + Aura integration in AppLayout

### Definition of Done

- [ ] `bun run test` — all 1,012+ tests pass
- [ ] `bun run typecheck` — zero TypeScript errors
- [ ] `bun run lint` — zero lint errors
- [ ] Zero raw `<button>` in web app (all replaced with `<Button>`)
- [ ] Zero raw `<input>` in web app (all replaced with `<Input>`)
- [ ] Aura visible in AppLayout corner, responding to events
- [ ] Toast notifications replace all inline error/success messages
- [ ] Light and dark mode fully functional across all changed screens

### Must Have

- Round-trip encryption tests for ALL 6 item types before any ItemPanel refactoring
- Design system components used exclusively (no raw HTML form elements in web)
- AuraProvider with Zustand store exposing `state`, `setState`, event subscriptions
- ToastProvider with queue, auto-dismiss, stacking
- ItemPanel decomposed into separate field components per item type
- 5 strategic animations: copy squish, search typography, page fade-in, Aura breathing, toast entrance
- Extension popup split into separate view files
- All existing 1,012+ tests passing after every wave

### Must NOT Have (Guardrails)

- No `as any`, `@ts-ignore`, `@ts-expect-error` — strict TypeScript
- No changes to encryption logic, AAD contract, or data serialization format
- No Card variant="frost" except in Modal/overlay contexts
- No touching extension content scripts (`entrypoints/content.ts`, `entrypoints/webauthn-interceptor.ts`)
- No touching `entrypoints/background.ts` logic
- No excessive animations — stick to the 5 defined touch points
- No changes to Zustand store APIs (auth, vault, search, health, chat, teams) — only ADD new stores/providers
- No mobile surface changes in this plan
- No new npm dependencies without explicit justification
- No AI slop: no over-commenting, no generic variable names, no premature abstractions

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (Vitest across all apps)
- **Automated tests**: YES (Tests-after for new components, TDD for encryption tests)
- **Framework**: Vitest (`npx vitest run` per app)
- **Encryption tests**: TDD — write failing tests first, then verify ItemPanel decomposition doesn't break them

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright (playwright skill) — Navigate, interact, assert DOM, screenshot
- **Component Library**: Use Bash — `npx vitest run` to verify tests pass
- **Extension**: Use Bash — `npx vitest run` in extension directory
- **Design System**: Use Bash — `bun run build` in packages/design to verify exports

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — safety net + infrastructure, 6 parallel):
├── Task 1: Round-trip encryption tests for all 6 item types [deep]
├── Task 2: Build Select component in @lockbox/design [visual-engineering]
├── Task 3: Build Textarea component in @lockbox/design [visual-engineering]
├── Task 4: Build Modal component in @lockbox/design [visual-engineering]
├── Task 5: Create AuraProvider (Zustand + context) [unspecified-high]
└── Task 6: Create ToastProvider (context + queue) [unspecified-high]

Wave 2 (After Wave 1 — monolith decomposition + foundation, 7 parallel):
├── Task 7: Decompose ItemPanel.tsx into sub-components (depends: 1, 2, 3) [deep]
├── Task 8: Add Aura to AppLayout shell + fade-in on Outlet (depends: 5) [visual-engineering]
├── Task 9: Replace raw elements in AppLayout.tsx (depends: 5, 6) [unspecified-high]
├── Task 10: Replace raw elements in Login.tsx (depends: 2, 6) [visual-engineering]
├── Task 11: Replace raw elements in Register.tsx (depends: 2, 6) [visual-engineering]
├── Task 12: Replace raw elements in Unlock.tsx (depends: 6) [quick]
└── Task 13: Define CSS animation keyframes (squish, search-type, fade-in, aura-breathe, toast-enter) [quick]

Wave 3 (After Wave 2 — core vault UX, 6 parallel):
├── Task 14: Redesign vault list with Card + Badge + quick-actions (depends: 7, 8) [visual-engineering]
├── Task 15: Redesign item detail with progressive disclosure Cards (depends: 7, 8) [visual-engineering]
├── Task 16: Elevate search bar + wire search typography animations (depends: 8, 13) [visual-engineering]
├── Task 17: Wire copy-to-clipboard squish animation (depends: 7, 13) [quick]
├── Task 18: Replace raw elements in Settings.tsx (depends: 2, 3, 6) [unspecified-high]
└── Task 19: Replace raw elements in AISettings.tsx (depends: 2, 3, 6) [unspecified-low]

Wave 4 (After Wave 3 — supporting screens, 8 parallel):
├── Task 20: Redesign Health page with Aura + Badge (depends: 5, 8) [visual-engineering]
├── Task 21: Redesign Chat page with Aura inline + thinking state (depends: 5, 8) [visual-engineering]
├── Task 22: Replace raw elements in Generator.tsx (depends: 2, 6) [unspecified-low]
├── Task 23: Replace raw elements in Teams.tsx + TeamDetail.tsx (depends: 2, 3, 6) [unspecified-high]
├── Task 24: Replace raw elements in EmergencyAccess.tsx (depends: 2, 6) [unspecified-low]
├── Task 25: Replace raw elements in ImportExport.tsx (depends: 6) [unspecified-low]
├── Task 26: Replace raw elements in Trash.tsx + ShareView.tsx (depends: 6) [unspecified-low]
└── Task 27: Replace inline messages with Toast system across all pages (depends: 6, 18) [unspecified-high]

Wave 5 (After Wave 1 — extension, independent from web, 5 parallel):
├── Task 28: Extract extension views into separate files (depends: none from web) [deep]
├── Task 29: Integrate Button + Input into extension views (depends: 28) [visual-engineering]
├── Task 30: Integrate Card + Badge into extension views (depends: 28) [visual-engineering]
├── Task 31: Wire constrained animations for 360×480px popup (depends: 28, 13) [quick]
└── Task 32: Replace raw elements in ShareLinkModal + AttachmentSection + ItemHistoryPanel + IssueList (depends: 2, 4, 6) [unspecified-high]

Wave FINAL (After ALL tasks — independent review, 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review — tsc + lint + test (unspecified-high)
├── Task F3: Full Playwright QA across all web screens (unspecified-high + playwright)
└── Task F4: Scope fidelity check — diff vs plan (deep)

Critical Path: T1 → T7 → T14/T15 → T27 → F1-F4
Parallel Speedup: ~65% faster than sequential
Max Concurrent: 8 (Wave 4)
```

### Task Dependency Graph

| Task  | Depends On | Blocks                                               | Reason                                                        |
| ----- | ---------- | ---------------------------------------------------- | ------------------------------------------------------------- |
| T1    | None       | T7                                                   | Encryption safety net must exist before decomposing ItemPanel |
| T2    | None       | T7, T10, T11, T14, T18, T19, T22, T23, T24, T29, T32 | Select component needed for dropdowns                         |
| T3    | None       | T7, T18, T19, T23                                    | Textarea component needed for note/identity fields            |
| T4    | None       | T32                                                  | Modal component for ShareLinkModal etc.                       |
| T5    | None       | T8, T9, T14, T15, T16, T20, T21                      | AuraProvider required for Aura integration                    |
| T6    | None       | T9, T10, T11, T12, T18-T27, T32                      | ToastProvider required for error/success messaging            |
| T7    | T1, T2, T3 | T14, T15, T17                                        | ItemPanel decomposition — needs safety net + Select/Textarea  |
| T8    | T5         | T14, T15, T16, T20, T21                              | Aura in AppLayout is foundation for all Aura features         |
| T9    | T5, T6     | None                                                 | AppLayout needs both providers                                |
| T10   | T2, T6     | None                                                 | Login uses Input + Select + Toast                             |
| T11   | T2, T6     | None                                                 | Register uses Input + Select + Toast                          |
| T12   | T6         | None                                                 | Unlock uses Input + Toast                                     |
| T13   | None       | T16, T17, T31                                        | CSS keyframes needed by animation tasks                       |
| T14   | T7, T8     | T27                                                  | Vault list needs decomposed items + Aura                      |
| T15   | T7, T8     | T27                                                  | Item detail needs decomposed items + Aura                     |
| T16   | T8, T13    | None                                                 | Search needs Aura + keyframes                                 |
| T17   | T7, T13    | None                                                 | Copy squish needs ItemPanel components + keyframes            |
| T18   | T2, T3, T6 | T27                                                  | Settings replacement                                          |
| T19   | T2, T3, T6 | None                                                 | AISettings replacement                                        |
| T20   | T5, T8     | None                                                 | Health Aura integration                                       |
| T21   | T5, T8     | None                                                 | Chat Aura integration                                         |
| T22   | T2, T6     | None                                                 | Generator replacement                                         |
| T23   | T2, T3, T6 | None                                                 | Teams replacement                                             |
| T24   | T2, T6     | None                                                 | Emergency replacement                                         |
| T25   | T6         | None                                                 | ImportExport replacement                                      |
| T26   | T6         | None                                                 | Trash + ShareView replacement                                 |
| T27   | T6, T18    | F1-F4                                                | Toast system wiring across all pages                          |
| T28   | None       | T29, T30, T31                                        | Extension decomposition (independent track)                   |
| T29   | T28        | None                                                 | Extension Button/Input integration                            |
| T30   | T28        | None                                                 | Extension Card/Badge integration                              |
| T31   | T28, T13   | None                                                 | Extension animations                                          |
| T32   | T2, T4, T6 | None                                                 | Remaining web component replacements                          |
| F1-F4 | All tasks  | None                                                 | Final verification                                            |

### Dependency Matrix

| Task | Depends On | Depended By                            | Wave |
| ---- | ---------- | -------------------------------------- | ---- |
| T1   | —          | T7                                     | 1    |
| T2   | —          | T7,T10,T11,T14,T18,T19,T22-T24,T29,T32 | 1    |
| T3   | —          | T7,T18,T19,T23                         | 1    |
| T4   | —          | T32                                    | 1    |
| T5   | —          | T8,T9,T14-T16,T20,T21                  | 1    |
| T6   | —          | T9-T12,T18-T27,T32                     | 1    |
| T7   | T1,T2,T3   | T14,T15,T17                            | 2    |
| T8   | T5         | T14-T16,T20,T21                        | 2    |
| T9   | T5,T6      | —                                      | 2    |
| T10  | T2,T6      | —                                      | 2    |
| T11  | T2,T6      | —                                      | 2    |
| T12  | T6         | —                                      | 2    |
| T13  | —          | T16,T17,T31                            | 2    |
| T14  | T7,T8      | T27                                    | 3    |
| T15  | T7,T8      | T27                                    | 3    |
| T16  | T8,T13     | —                                      | 3    |
| T17  | T7,T13     | —                                      | 3    |
| T18  | T2,T3,T6   | T27                                    | 3    |
| T19  | T2,T3,T6   | —                                      | 3    |
| T20  | T5,T8      | —                                      | 4    |
| T21  | T5,T8      | —                                      | 4    |
| T22  | T2,T6      | —                                      | 4    |
| T23  | T2,T3,T6   | —                                      | 4    |
| T24  | T2,T6      | —                                      | 4    |
| T25  | T6         | —                                      | 4    |
| T26  | T6         | —                                      | 4    |
| T27  | T6,T18     | F1-F4                                  | 4    |
| T28  | —          | T29,T30,T31                            | 5    |
| T29  | T28        | —                                      | 5    |
| T30  | T28        | —                                      | 5    |
| T31  | T28,T13    | —                                      | 5    |
| T32  | T2,T4,T6   | —                                      | 5    |

### Agent Dispatch Summary

| Wave  | Tasks | Categories                                                                                                                                                                                     |
| ----- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | 6     | T1→`deep`, T2→`visual-engineering`, T3→`visual-engineering`, T4→`visual-engineering`, T5→`unspecified-high`, T6→`unspecified-high`                                                             |
| 2     | 7     | T7→`deep`, T8→`visual-engineering`, T9→`unspecified-high`, T10→`visual-engineering`, T11→`visual-engineering`, T12→`quick`, T13→`quick`                                                        |
| 3     | 6     | T14→`visual-engineering`, T15→`visual-engineering`, T16→`visual-engineering`, T17→`quick`, T18→`unspecified-high`, T19→`unspecified-low`                                                       |
| 4     | 8     | T20→`visual-engineering`, T21→`visual-engineering`, T22→`unspecified-low`, T23→`unspecified-high`, T24→`unspecified-low`, T25→`unspecified-low`, T26→`unspecified-low`, T27→`unspecified-high` |
| 5     | 5     | T28→`deep`, T29→`visual-engineering`, T30→`visual-engineering`, T31→`quick`, T32→`unspecified-high`                                                                                            |
| FINAL | 4     | F1→`deep`, F2→`unspecified-high`, F3→`unspecified-high`+`playwright`, F4→`deep`                                                                                                                |

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.

### Wave 1 — Safety Net + Infrastructure (6 parallel, no dependencies)

- [ ] 1. Round-Trip Encryption Tests for All 6 Item Types

  **What to do**:
  - Add test cases to `apps/web/src/__tests__/crypto.test.ts` covering round-trip encrypt→decrypt for: `card`, `identity`, `note`, `passkey`, `document` (login already covered)
  - Each test must: create a realistic item with ALL fields populated, encrypt with `encryptVaultItem`, decrypt with `decryptVaultItem`, assert every field matches
  - Add AAD mismatch tests per type (wrong itemId, wrong revisionDate → must throw)
  - Follow existing test patterns in the file (see `makeTestItem()` and `describe('encryptVaultItem / decryptVaultItem')`)
  - Import types from `@lockbox/types`: `CardItem`, `IdentityItem`, `SecureNoteItem`, `PasskeyItem`, `DocumentItem`

  **Must NOT do**:
  - Do NOT modify `apps/web/src/lib/crypto.ts` — test-only task
  - Do NOT change the AAD contract (`utf8(itemId:revisionDate)`)
  - Do NOT add any new dependencies

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Encryption tests require careful understanding of AAD binding, type contracts, and data integrity — needs thorough, methodical work
  - **Skills**: []
    - No specialized skills needed — pure TypeScript test writing
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser interaction needed — pure unit tests
    - `frontend-ui-ux`: No UI work
    - `git-master`: No git operations

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4, 5, 6)
  - **Blocks**: Task 7 (ItemPanel decomposition needs this safety net)
  - **Blocked By**: None

  **References**:

  **Pattern References** (existing code to follow):
  - `apps/web/src/__tests__/crypto.test.ts:10-51` — `makeTestItem()` helper and login round-trip test pattern. Copy this structure for each new type.
  - `apps/web/src/__tests__/crypto.test.ts:65-97` — AAD mismatch tests. Replicate these for each type.
  - `apps/web/src/__tests__/crypto.test.ts:148-220` — E2E simulation pattern. Extend to cover other types if time permits.

  **API/Type References** (contracts to implement against):
  - `packages/types/src/vault.ts` — All vault item type definitions: `CardItem`, `IdentityItem`, `SecureNoteItem`, `PasskeyItem`, `DocumentItem`. Check every field name and type.
  - `apps/web/src/lib/crypto.ts:14-37` — The exact `encryptVaultItem` / `decryptVaultItem` signatures and AAD construction

  **WHY Each Reference Matters**:
  - The crypto.test.ts patterns ensure consistency with existing test structure — use the same `makeTestKey()` helper
  - The vault.ts types define every field that must be tested — missing a field means the safety net has a hole
  - The crypto.ts signatures show the exact API — userKey is 64 bytes, first 32 used

  **Acceptance Criteria**:
  - [ ] 5 new describe blocks added (one per missing type)
  - [ ] Each type has: round-trip test, AAD-mismatch test (wrong itemId), AAD-mismatch test (wrong revisionDate)
  - [ ] `cd apps/web && npx vitest run src/__tests__/crypto.test.ts` → ALL PASS (existing + new)

  **QA Scenarios**:

  ```
  Scenario: All 6 item types round-trip through encryption
    Tool: Bash
    Preconditions: No changes to crypto.ts, only test file modified
    Steps:
      1. Run: cd apps/web && npx vitest run src/__tests__/crypto.test.ts
      2. Count test results in output
    Expected Result: 15+ tests pass (existing 7 + at least 10 new), 0 failures
    Failure Indicators: Any "FAIL" in output, or "AssertionError"
    Evidence: .sisyphus/evidence/task-1-crypto-tests.txt

  Scenario: AAD mismatch correctly rejects decryption for card type
    Tool: Bash
    Preconditions: New card AAD tests exist
    Steps:
      1. Run: cd apps/web && npx vitest run src/__tests__/crypto.test.ts -t "card"
      2. Verify "wrong itemId" and "wrong revisionDate" tests pass
    Expected Result: Card-specific tests pass, confirming AAD enforcement
    Evidence: .sisyphus/evidence/task-1-card-aad.txt
  ```

  **Commit**: YES
  - Message: `test(crypto): add round-trip encryption tests for all 6 vault item types`
  - Files: `apps/web/src/__tests__/crypto.test.ts`
  - Pre-commit: `cd apps/web && npx vitest run src/__tests__/crypto.test.ts`

---

- [ ] 2. Build Select Component in @lockbox/design

  **What to do**:
  - Create `packages/design/src/components/Select.tsx`
  - API: `SelectProps` extending `React.SelectHTMLAttributes<HTMLSelectElement>` with `label?: string`, `error?: string`, `options: Array<{ value: string; label: string }>`
  - Use inline `React.CSSProperties` — match Input component's style pattern exactly (same border, focus ring, error state, label, radius, font tokens)
  - Focused state: `--color-aura` border + `--color-aura-dim` glow (matching Input)
  - Error state: `--color-error` border + `--color-error-subtle` glow
  - Disabled state: opacity 0.55, `cursor: not-allowed`
  - Export from `packages/design/src/index.ts`
  - Add Storybook story at `packages/design/src/stories/Select.stories.tsx`

  **Must NOT do**:
  - No Tailwind classes — inline styles only (match existing components)
  - No external dependencies
  - No Card variant="frost"

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Design system component requiring exact visual consistency with existing Input component
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Ensures polished visual output matching the design system's aesthetic standards
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed for component creation
    - `git-master`: No git operations
    - `cloudflare-deploy`: No deployment

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4, 5, 6)
  - **Blocks**: Tasks 7, 10, 11, 14, 18, 19, 22-24, 29, 32
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `packages/design/src/components/Input.tsx:1-127` — EXACT pattern to follow: wrapper div, label, focus/error states via useState, `React.CSSProperties`, CSS variable tokens. The Select must be visually identical to Input when closed.
  - `packages/design/src/components/Button.tsx:1-141` — Hover/press state pattern with `onMouseEnter`/`onMouseLeave`
  - `packages/design/src/index.ts:1-15` — Export pattern to follow for adding Select

  **External References**:
  - No external docs needed — follow internal patterns exactly

  **WHY Each Reference Matters**:
  - Input.tsx is the TEMPLATE — same label position, same error message position, same border radius, same focus glow. Do not deviate.
  - index.ts shows the export format — `export { Select, type SelectProps } from './components/Select.js';`

  **Acceptance Criteria**:
  - [ ] `packages/design/src/components/Select.tsx` exists with `SelectProps` interface
  - [ ] Exported from `packages/design/src/index.ts`
  - [ ] Story file at `packages/design/src/stories/Select.stories.tsx`
  - [ ] `cd packages/design && bun run build` → SUCCESS

  **QA Scenarios**:

  ```
  Scenario: Select component builds and exports correctly
    Tool: Bash
    Preconditions: Component file created, index.ts updated
    Steps:
      1. Run: cd packages/design && bun run build
      2. Verify: grep "Select" dist/index.d.ts
    Expected Result: Build succeeds, Select exported in type declarations
    Failure Indicators: Build error, or Select missing from dist/index.d.ts
    Evidence: .sisyphus/evidence/task-2-select-build.txt

  Scenario: Select matches Input visual pattern
    Tool: Bash
    Preconditions: Component file exists
    Steps:
      1. Read Select.tsx and verify it uses: --color-aura for focus border, --color-aura-dim for focus glow, --color-error for error, --radius-md, --font-sans
      2. Grep for these tokens: grep -c "color-aura" packages/design/src/components/Select.tsx
    Expected Result: All 5+ token references present, matching Input.tsx pattern
    Failure Indicators: Missing token references, hardcoded colors
    Evidence: .sisyphus/evidence/task-2-select-tokens.txt
  ```

  **Commit**: YES (groups with Tasks 3, 4)
  - Message: `feat(design): add Select, Textarea, Modal components`
  - Files: `packages/design/src/components/Select.tsx`, `packages/design/src/index.ts`, `packages/design/src/stories/Select.stories.tsx`
  - Pre-commit: `cd packages/design && bun run build`

---

- [ ] 3. Build Textarea Component in @lockbox/design

  **What to do**:
  - Create `packages/design/src/components/Textarea.tsx`
  - API: `TextareaProps` extending `React.TextareaHTMLAttributes<HTMLTextAreaElement>` with `label?: string`, `error?: string`
  - Match Input component's style pattern exactly: same label, border, focus ring (`--color-aura` + `--color-aura-dim` glow), error state, radius, font tokens
  - Include `resize` prop: `'none' | 'vertical' | 'both'` (default: `'vertical'`)
  - Min-height: 100px
  - Export from `packages/design/src/index.ts`
  - Add story at `packages/design/src/stories/Textarea.stories.tsx`

  **Must NOT do**:
  - No Tailwind classes — inline styles only
  - No external dependencies

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Design system component with visual consistency requirements
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Visual polish and design system consistency
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed for component creation
    - `git-master`: No git operations

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4, 5, 6)
  - **Blocks**: Tasks 7, 18, 19, 23
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `packages/design/src/components/Input.tsx:1-127` — EXACT pattern: wrapper, label, focus/error states, same CSS variable tokens. Textarea is essentially Input but `<textarea>` instead of `<input>`.
  - `packages/design/src/index.ts:11` — Export line pattern: `export { Input, type InputProps } from './components/Input.js';`

  **WHY Each Reference Matters**:
  - Input.tsx is the template — follow it exactly but swap `<input>` for `<textarea>` and add resize + min-height

  **Acceptance Criteria**:
  - [ ] `packages/design/src/components/Textarea.tsx` exists
  - [ ] Exported from `packages/design/src/index.ts`
  - [ ] Story file exists
  - [ ] `cd packages/design && bun run build` → SUCCESS

  **QA Scenarios**:

  ```
  Scenario: Textarea component builds correctly
    Tool: Bash
    Preconditions: Component created, index.ts updated
    Steps:
      1. Run: cd packages/design && bun run build
      2. Verify: grep "Textarea" dist/index.d.ts
    Expected Result: Build succeeds, Textarea in type declarations
    Failure Indicators: Build error or missing export
    Evidence: .sisyphus/evidence/task-3-textarea-build.txt
  ```

  **Commit**: YES (groups with Tasks 2, 4)
  - Message: `feat(design): add Select, Textarea, Modal components`
  - Files: `packages/design/src/components/Textarea.tsx`, `packages/design/src/index.ts`, `packages/design/src/stories/Textarea.stories.tsx`
  - Pre-commit: `cd packages/design && bun run build`

---

- [ ] 4. Build Modal Component in @lockbox/design

  **What to do**:
  - Create `packages/design/src/components/Modal.tsx`
  - API: `ModalProps` with `open: boolean`, `onClose: () => void`, `title?: string`, `children: React.ReactNode`, `size?: 'sm' | 'md' | 'lg'`
  - Uses `Card variant="frost"` for the modal panel (this is the ONE allowed use of frost)
  - Backdrop: `position: fixed`, full viewport, `background: rgba(0,0,0,0.5)`, `backdropFilter: blur(4px)`, click to close
  - Uses `React.createPortal` to render in `document.body`
  - Close on Escape key
  - Entrance animation: fade-in + scale from 0.95 (use CSS `transition` not keyframes)
  - Size map: sm=400px, md=520px, lg=640px max-width
  - Export from `packages/design/src/index.ts`

  **Must NOT do**:
  - No Tailwind classes — inline styles only
  - No external dependencies
  - frost is ONLY acceptable here in Modal — do not propagate to other components

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Overlay component with animation, portal, keyboard handling — complex UI engineering
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Portal patterns, animation polish, backdrop blur
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed for creation
    - `git-master`: No git operations

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 5, 6)
  - **Blocks**: Task 32
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `packages/design/src/components/Card.tsx:1-82` — Card variant="frost" styles at lines 23-29. Modal MUST use this variant for its panel.
  - `packages/design/src/components/Toast.tsx:67-72` — Fixed positioning pattern with z-index
  - `packages/design/src/index.ts` — Export pattern

  **WHY Each Reference Matters**:
  - Card.tsx frost variant is the REQUIRED panel style — use it directly or replicate its exact tokens
  - Toast.tsx shows the z-index and fixed positioning convention used in the design system

  **Acceptance Criteria**:
  - [ ] `packages/design/src/components/Modal.tsx` exists
  - [ ] Uses Card variant="frost" for panel or replicates its exact styles
  - [ ] Closes on Escape and backdrop click
  - [ ] Uses `React.createPortal`
  - [ ] `cd packages/design && bun run build` → SUCCESS

  **QA Scenarios**:

  ```
  Scenario: Modal component builds and exports
    Tool: Bash
    Preconditions: Component created
    Steps:
      1. Run: cd packages/design && bun run build
      2. Verify: grep "Modal" dist/index.d.ts
    Expected Result: Build succeeds, Modal in type declarations
    Failure Indicators: Build error or missing export
    Evidence: .sisyphus/evidence/task-4-modal-build.txt
  ```

  **Commit**: YES (groups with Tasks 2, 3)
  - Message: `feat(design): add Select, Textarea, Modal components`
  - Files: `packages/design/src/components/Modal.tsx`, `packages/design/src/index.ts`, `packages/design/src/stories/Modal.stories.tsx`
  - Pre-commit: `cd packages/design && bun run build`

---

- [ ] 5. Create AuraProvider (Zustand Store + React Context)

  **What to do**:
  - Create directory `apps/web/src/providers/`
  - Create `apps/web/src/providers/AuraProvider.tsx`
  - Zustand store `useAuraStore` with state: `{ auraState: AuraState; setAuraState: (s: AuraState) => void }`
  - `AuraState` imported from `@lockbox/design` (type already exists: `'idle' | 'active' | 'thinking' | 'hidden'`)
  - React Context `AuraContext` wrapping the Zustand store for tree-level access
  - `AuraProvider` component wraps children, provides context
  - `useAura()` hook returns `{ state, setState, pulse, startThinking, stopThinking }`
  - Helper methods: `pulse()` temporarily sets 'active' for 600ms then back to 'idle'; `startThinking()` sets 'thinking'; `stopThinking()` sets 'idle'
  - Wire event subscriptions: listen for custom events `'lockbox:copy'`, `'lockbox:search'`, `'lockbox:chat-thinking'` on `window`

  **Must NOT do**:
  - Do NOT modify existing stores (auth, vault, search, health, chat, teams)
  - Do NOT use `as any`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: State management architecture requiring Zustand + Context integration — not visual, not trivial
  - **Skills**: []
    - No specialized skills needed — pure React + Zustand patterns
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not a visual task — it's state management
    - `playwright`: No browser interaction
    - `git-master`: No git operations

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4, 6)
  - **Blocks**: Tasks 8, 9, 14, 15, 16, 20, 21
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `apps/web/src/store/auth.ts:1-79` — Zustand store creation pattern with `create()`. Follow same structure but simpler (no persistence needed).
  - `packages/design/src/components/Aura.tsx:3-4` — `AuraState` and `AuraPosition` type definitions to import
  - `apps/web/src/App.tsx:1-77` — Where AuraProvider will eventually wrap routes (but DO NOT modify App.tsx in this task)

  **WHY Each Reference Matters**:
  - auth.ts shows the Zustand convention used across the project — follow same import pattern and store shape
  - Aura.tsx defines the exact `AuraState` type — import it, don't redefine
  - App.tsx shows where the provider will plug in (context for the implementer)

  **Acceptance Criteria**:
  - [ ] `apps/web/src/providers/AuraProvider.tsx` exists
  - [ ] Exports: `AuraProvider`, `useAura`
  - [ ] `useAura()` returns `{ state, setState, pulse, startThinking, stopThinking }`
  - [ ] `bun run typecheck` → 0 new errors
  - [ ] `cd apps/web && npx vitest run` → all tests pass

  **QA Scenarios**:

  ```
  Scenario: AuraProvider exports and typechecks
    Tool: Bash
    Preconditions: Provider file created
    Steps:
      1. Run: bun run typecheck
      2. Grep for errors in output
    Expected Result: Zero new TypeScript errors related to AuraProvider
    Failure Indicators: Type errors mentioning AuraProvider or useAura
    Evidence: .sisyphus/evidence/task-5-aura-typecheck.txt

  Scenario: Existing tests still pass
    Tool: Bash
    Preconditions: No existing code modified
    Steps:
      1. Run: cd apps/web && npx vitest run
    Expected Result: All 52 web tests pass
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-5-tests-pass.txt
  ```

  **Commit**: YES
  - Message: `feat(web): add AuraProvider with Zustand store and event subscriptions`
  - Files: `apps/web/src/providers/AuraProvider.tsx`
  - Pre-commit: `bun run typecheck`

---

- [ ] 6. Create ToastProvider (React Context + Queue)

  **What to do**:
  - Create `apps/web/src/providers/ToastProvider.tsx`
  - React Context with `ToastContext` providing `{ toast: (msg: string, variant?: ToastVariant) => void; toasts: ToastItem[] }`
  - `ToastItem` type: `{ id: string; message: string; variant: ToastVariant; createdAt: number }`
  - `ToastVariant` imported from `@lockbox/design` (type already exists: `'info' | 'success' | 'error' | 'warning'`)
  - Queue max 5 toasts, FIFO overflow
  - Auto-dismiss after `duration` (default 4000ms)
  - `ToastProvider` renders a portal container at bottom-right with stacked toasts using the `<Toast>` component from `@lockbox/design`
  - Toasts stack vertically with 8px gap, newest at bottom
  - `useToast()` hook returns `{ toast }`
  - Generate unique IDs with `crypto.randomUUID()`

  **Must NOT do**:
  - Do NOT modify existing stores
  - Do NOT add new npm dependencies

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: React Context + portal + queue state management — architectural, not visual
  - **Skills**: []
    - No specialized skills needed
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: The Toast component is already built — this is plumbing
    - `playwright`: No browser interaction

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4, 5)
  - **Blocks**: Tasks 9-12, 18-27, 32
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `packages/design/src/components/Toast.tsx:1-128` — Toast component API: `message`, `variant`, `duration`, `onDismiss`, `visible`. The provider must use this component to render each toast.
  - `apps/web/src/store/auth.ts:34-78` — Zustand create pattern (for reference, though this provider uses React Context not Zustand)

  **WHY Each Reference Matters**:
  - Toast.tsx defines the exact props the rendered component expects — provider must pass them correctly
  - The existing Toast component handles its own dismiss timer — provider manages queue, Toast handles individual auto-dismiss

  **Acceptance Criteria**:
  - [ ] `apps/web/src/providers/ToastProvider.tsx` exists
  - [ ] Exports: `ToastProvider`, `useToast`
  - [ ] `useToast()` returns `{ toast }` function
  - [ ] Queue max 5, FIFO overflow, auto-dismiss
  - [ ] `bun run typecheck` → 0 new errors

  **QA Scenarios**:

  ```
  Scenario: ToastProvider exports and typechecks
    Tool: Bash
    Preconditions: Provider file created
    Steps:
      1. Run: bun run typecheck
      2. Check for errors
    Expected Result: Zero new TypeScript errors
    Failure Indicators: Type errors mentioning ToastProvider or useToast
    Evidence: .sisyphus/evidence/task-6-toast-typecheck.txt
  ```

  **Commit**: YES
  - Message: `feat(web): add ToastProvider with queue management and portal rendering`
  - Files: `apps/web/src/providers/ToastProvider.tsx`
  - Pre-commit: `bun run typecheck`

### Wave 2 — Monolith Decomposition + Foundation (7 parallel, after Wave 1)

- [ ] 7. Decompose ItemPanel.tsx into Sub-Components by Item Type

  **What to do**:
  - Create directory `apps/web/src/components/item-fields/`
  - Extract 8 sub-components from `apps/web/src/components/ItemPanel.tsx` (2,282 lines):
    - `LoginFields.tsx` — username, password, URIs, TOTP fields + password generator
    - `CardFields.tsx` — cardholder, number, expiry, CVV, brand
    - `IdentityFields.tsx` — name, email, phone, address, SSN, passport, license
    - `NoteFields.tsx` — content textarea
    - `PasskeyFields.tsx` — rpId, rpName, credentialId, userHandle, publicKey
    - `DocumentFields.tsx` — content, file handling
    - `CustomFieldsSection.tsx` — dynamic custom fields add/edit/remove
    - `SecurityAlertsSection.tsx` — SecurityAlert rendering with action buttons
  - Each sub-component receives: field values, setters, mode ('view'|'edit'|'add'), disabled state
  - Use `<Input>` from `@lockbox/design` for all text inputs
  - Use `<Select>` from `@lockbox/design` for all dropdowns (type selector, folder selector, card brand, exp month/year)
  - Use `<Textarea>` from `@lockbox/design` for note content
  - Use `<Button>` from `@lockbox/design` for all action buttons
  - Use `<Badge>` from `@lockbox/design` for tags, security alert severity
  - Slim ItemPanel.tsx to orchestration-only: routing to the right field component based on `type`, header, save/delete actions
  - Target: ItemPanel.tsx under 400 lines, each sub-component 100-300 lines

  **Must NOT do**:
  - Do NOT change encryption logic — `encryptVaultItem` / `decryptVaultItem` calls stay identical
  - Do NOT change the `handleSave` data assembly — same fields, same JSON shape
  - Do NOT change any Zustand store APIs
  - Do NOT use `as any`

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 2,282-line monolith decomposition requires careful extraction without breaking encryption data flow — highest-risk task in the plan
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Components must look polished with design system integration during extraction
  - **Skills Evaluated but Omitted**:
    - `playwright`: Decomposition is refactoring, verified by tests not browser
    - `git-master`: No git operations needed
    - `cloudflare-deploy`: No deployment

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 2)
  - **Parallel Group**: Wave 2 (with Tasks 8-13)
  - **Blocks**: Tasks 14, 15, 17
  - **Blocked By**: Tasks 1 (encryption tests as safety net), 2 (Select), 3 (Textarea)

  **References**:

  **Pattern References**:
  - `apps/web/src/components/ItemPanel.tsx:1-100` — State declarations per item type. Lines 55-100 show how login/note/card/identity/passkey state is initialized from the `item` prop.
  - `apps/web/src/components/ItemPanel.tsx:26-34` — `ItemPanelProps` interface — sub-components inherit a subset of these props
  - `apps/web/src/components/ItemPanel.tsx:2200-2282` — Bottom actions, history panel, share modal — these stay in the parent orchestrator

  **API/Type References**:
  - `packages/types/src/vault.ts` — All item type definitions with field names
  - `packages/design/src/index.ts` — All available design components to import
  - `packages/design/src/components/Input.tsx:3-7` — InputProps for type-safe integration
  - `packages/design/src/components/Select.tsx` — SelectProps (created in Task 2)

  **Test References**:
  - `apps/web/src/__tests__/crypto.test.ts` — Round-trip tests that MUST still pass after decomposition. These are your safety net.

  **WHY Each Reference Matters**:
  - ItemPanel state declarations show exactly which fields each sub-component needs as props
  - crypto.test.ts is the SAFETY NET — if these tests break, the decomposition corrupted something
  - Type definitions ensure the sub-components handle the correct field set per item type

  **Acceptance Criteria**:
  - [ ] 8 new files in `apps/web/src/components/item-fields/`
  - [ ] `apps/web/src/components/ItemPanel.tsx` under 500 lines
  - [ ] Zero raw `<input>` or `<button>` in any item-fields file
  - [ ] `cd apps/web && npx vitest run` → ALL tests pass (especially crypto round-trips)
  - [ ] `bun run typecheck` → 0 errors

  **QA Scenarios**:

  ```
  Scenario: Encryption round-trip tests still pass after decomposition
    Tool: Bash
    Preconditions: ItemPanel decomposed, all sub-components created
    Steps:
      1. Run: cd apps/web && npx vitest run src/__tests__/crypto.test.ts
    Expected Result: All encryption tests pass — proves data flow unchanged
    Failure Indicators: Any FAIL — indicates broken field assembly
    Evidence: .sisyphus/evidence/task-7-crypto-safety.txt

  Scenario: ItemPanel is under 500 lines
    Tool: Bash
    Preconditions: Decomposition complete
    Steps:
      1. Run: wc -l apps/web/src/components/ItemPanel.tsx
    Expected Result: Under 500 lines
    Failure Indicators: Over 500 lines — insufficient extraction
    Evidence: .sisyphus/evidence/task-7-line-count.txt

  Scenario: No raw HTML form elements in item-fields
    Tool: Bash
    Preconditions: All sub-component files exist
    Steps:
      1. Run: grep -rn '<input\|<button\|<select\|<textarea' apps/web/src/components/item-fields/
    Expected Result: Zero matches — all replaced with design system components
    Failure Indicators: Any match of raw HTML elements
    Evidence: .sisyphus/evidence/task-7-no-raw-elements.txt
  ```

  **Commit**: YES
  - Message: `refactor(web): decompose ItemPanel into 8 type-specific sub-components`
  - Files: `apps/web/src/components/ItemPanel.tsx`, `apps/web/src/components/item-fields/*.tsx`
  - Pre-commit: `cd apps/web && npx vitest run && bun run typecheck`

---

- [ ] 8. Add Aura to AppLayout Shell + Page Fade-In Transition

  **What to do**:
  - Import `Aura` from `@lockbox/design` into `apps/web/src/components/AppLayout.tsx`
  - Import `useAura` from `../providers/AuraProvider.js`
  - Add `<Aura state={auraState} position="corner" />` inside the main content area (after `<Outlet>`, positioned relative to the main flex container)
  - Wrap `<Outlet>` in a `<div className="fade-in">` for page transition animation
  - Add AuraProvider and ToastProvider wrapping in `apps/web/src/App.tsx` — wrap the `<Routes>` with both providers
  - The Aura should be visible in bottom-right corner of the main content area, NOT the sidebar

  **Must NOT do**:
  - Do NOT modify sidebar structure or navigation logic
  - Do NOT change route definitions
  - Do NOT use Card variant="frost" for Aura container

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Aura positioning and animation integration — visual UI engineering
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Precise positioning, animation timing, visual hierarchy
  - **Skills Evaluated but Omitted**:
    - `playwright`: Visual verification can be done via screenshot in QA
    - `git-master`: No git operations

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 2)
  - **Parallel Group**: Wave 2 (with Tasks 7, 9-13)
  - **Blocks**: Tasks 14, 15, 16, 20, 21
  - **Blocked By**: Task 5 (AuraProvider)

  **References**:

  **Pattern References**:
  - `apps/web/src/components/AppLayout.tsx:381-398` — Main content area where Aura goes. The `<main>` flex container and `<Outlet>` are here.
  - `packages/design/src/components/Aura.tsx:24-41` — Position styles for 'corner': `position: absolute, bottom: 12, right: 12`
  - `apps/web/src/App.tsx:53-76` — Routes where AuraProvider + ToastProvider wrapping goes

  **WHY Each Reference Matters**:
  - AppLayout main area needs `position: relative` to contain the absolute Aura
  - Aura's corner position is pre-built — just needs the container to have relative positioning
  - App.tsx is where providers wrap — must be outside Routes but could be inside or outside ProtectedRoute

  **Acceptance Criteria**:
  - [ ] Aura component renders in AppLayout main area
  - [ ] `useAura()` hook works within protected routes
  - [ ] `<Outlet>` wrapped in fade-in div
  - [ ] AuraProvider + ToastProvider in App.tsx
  - [ ] `bun run typecheck` → 0 errors
  - [ ] `cd apps/web && npx vitest run` → all pass

  **QA Scenarios**:

  ```
  Scenario: Aura renders in AppLayout
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running at localhost:5173, user logged in
    Steps:
      1. Navigate to http://localhost:5173/vault
      2. Look for element matching `.aura-idle` or `.aura-active`
      3. Take screenshot
    Expected Result: Aura element present in DOM with corner positioning
    Failure Indicators: No aura element found
    Evidence: .sisyphus/evidence/task-8-aura-layout.png

  Scenario: Page transition has fade-in
    Tool: Playwright
    Preconditions: User logged in
    Steps:
      1. Navigate to /vault
      2. Click "Settings" in sidebar
      3. Assert .fade-in class on content wrapper
    Expected Result: Content area has fade-in class
    Evidence: .sisyphus/evidence/task-8-fade-in.png
  ```

  **Commit**: YES
  - Message: `feat(web): integrate Aura into AppLayout with providers and page transitions`
  - Files: `apps/web/src/components/AppLayout.tsx`, `apps/web/src/App.tsx`
  - Pre-commit: `cd apps/web && npx vitest run`

---

- [ ] 9. Replace Raw Elements in AppLayout.tsx with Design System Components

  **What to do**:
  - Replace all 25 raw `<button>` elements in `apps/web/src/components/AppLayout.tsx` with `<Button>` from `@lockbox/design`
  - Replace all raw `<input>` elements (folder name inputs) with `<Input>` from `@lockbox/design`
  - Map existing Tailwind button classes to Button variants: primary actions → `variant="primary"`, nav items → `variant="ghost"`, danger actions → `variant="danger"`
  - Nav items use `variant="ghost" size="sm"`
  - Folder create/rename inputs use `<Input>` with appropriate size
  - Preserve all existing click handlers, navigation, and state logic

  **Must NOT do**:
  - Do NOT change navigation logic or sidebar structure
  - Do NOT modify Zustand store interactions
  - Do NOT remove existing Tailwind layout classes (flex, spacing, etc.) — only replace inline form element styles

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Systematic replacement across 25 elements — requires careful mapping of styles to variants
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Ensuring variant choices produce correct visual hierarchy
  - **Skills Evaluated but Omitted**:
    - `playwright`: Can verify via test suite
    - `git-master`: No git operations

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 2)
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: Tasks 5 (AuraProvider), 6 (ToastProvider)

  **References**:

  **Pattern References**:
  - `apps/web/src/components/AppLayout.tsx:107-112` — `getNavItemClass` function defines current nav styling. Replace with `Button variant="ghost"` + active state.
  - `apps/web/src/components/AppLayout.tsx:128-151` — Nav button examples with click handlers to preserve
  - `packages/design/src/components/Button.tsx:3-4` — Variant/size types: `'primary' | 'secondary' | 'ghost' | 'danger'`, `'sm' | 'md' | 'lg'`

  **WHY Each Reference Matters**:
  - getNavItemClass shows the current active/hover styling pattern — map to Button ghost variant
  - Button.tsx variants define what's available — ghost for nav, danger for sign out, primary for confirmations

  **Acceptance Criteria**:
  - [ ] Zero raw `<button>` in AppLayout.tsx
  - [ ] Zero raw `<input>` in AppLayout.tsx
  - [ ] All navigation still works
  - [ ] `cd apps/web && npx vitest run` → all pass

  **QA Scenarios**:

  ```
  Scenario: No raw HTML form elements remain
    Tool: Bash
    Preconditions: Replacements complete
    Steps:
      1. Run: grep -cn '<button\|<input' apps/web/src/components/AppLayout.tsx
    Expected Result: 0 matches
    Evidence: .sisyphus/evidence/task-9-no-raw.txt
  ```

  **Commit**: YES (groups with auth pages)
  - Message: `refactor(web): replace raw elements in AppLayout with design system components`
  - Files: `apps/web/src/components/AppLayout.tsx`
  - Pre-commit: `cd apps/web && npx vitest run`

---

- [ ] 10. Replace Raw Elements in Login.tsx

  **What to do**:
  - Replace all 9 raw form elements in `apps/web/src/pages/Login.tsx` (545 lines)
  - Wrap login form in `<Card variant="raised">` for visual elevation
  - Replace `<input>` for email/password with `<Input>` (email type="email", password type="password")
  - Replace `<button>` submit with `<Button variant="primary" loading={loading}>`
  - Replace 2FA code input with `<Input>`
  - Add background `<Aura state="idle" position="center">` behind the login card for ambient presence
  - Replace inline error messages with `useToast().toast(error, 'error')`

  **Must NOT do**:
  - Do NOT change auth flow logic (deriveKey, makeAuthHash, etc.)
  - Do NOT change API calls or state management

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Auth page needs visual polish — Card elevation, Aura backdrop, input styling
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Login page is the first impression — must be polished
  - **Skills Evaluated but Omitted**:
    - `playwright`: Visual QA handled by final wave
    - `git-master`: No git ops

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 2)
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: Tasks 2 (Select for any dropdowns), 6 (ToastProvider)

  **References**:
  - `apps/web/src/pages/Login.tsx:1-80` — Current form structure and auth flow
  - `packages/design/src/components/Card.tsx:10-14` — variant="raised" styles
  - `packages/design/src/components/Input.tsx:3-7` — InputProps with type, error, label

  **Acceptance Criteria**:
  - [ ] Zero raw `<button>` or `<input>` in Login.tsx
  - [ ] Login form wrapped in Card
  - [ ] Aura renders as background element
  - [ ] `cd apps/web && npx vitest run` → all pass

  **QA Scenarios**:

  ```
  Scenario: Login page renders with design system components
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Navigate to /login
      2. Assert Card component present (check for organic-lg border radius style)
      3. Assert Input components present for email and password
      4. Assert Button component for submit
      5. Screenshot
    Expected Result: All design system components rendering correctly
    Evidence: .sisyphus/evidence/task-10-login-redesign.png
  ```

  **Commit**: YES (groups with T11, T12)
  - Message: `refactor(web): replace raw elements in auth pages with design system`
  - Files: `apps/web/src/pages/Login.tsx`
  - Pre-commit: `cd apps/web && npx vitest run`

---

- [ ] 11. Replace Raw Elements in Register.tsx

  **What to do**:
  - Replace all 4 raw form elements in `apps/web/src/pages/Register.tsx` (215 lines)
  - Wrap form in `<Card variant="raised">`
  - Replace email/password/confirm inputs with `<Input>`
  - Replace submit button with `<Button variant="primary" loading={loading}>`
  - Add password strength indicator integration (already exists — preserve it)
  - Background Aura like Login
  - Replace inline error with toast

  **Must NOT do**:
  - Do NOT change registration flow or key derivation logic

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Visual polish for registration flow — Card + Input + Aura
  - **Skills**: [`frontend-ui-ux`]
  - **Skills Evaluated but Omitted**: Same as Task 10

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 2)
  - **Blocks**: None
  - **Blocked By**: Tasks 2, 6

  **References**:
  - `apps/web/src/pages/Register.tsx:1-60` — Form structure and strength indicator
  - Same design system refs as Task 10

  **Acceptance Criteria**:
  - [ ] Zero raw form elements in Register.tsx
  - [ ] `cd apps/web && npx vitest run` → all pass

  **QA Scenarios**:

  ```
  Scenario: Register page uses design system
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Navigate to /register
      2. Assert Card, Input, Button components present
      3. Screenshot
    Expected Result: Design system components rendering
    Evidence: .sisyphus/evidence/task-11-register.png
  ```

  **Commit**: YES (groups with T10, T12)
  - Message: `refactor(web): replace raw elements in auth pages with design system`
  - Files: `apps/web/src/pages/Register.tsx`

---

- [ ] 12. Replace Raw Elements in Unlock.tsx

  **What to do**:
  - Replace 3 raw elements in `apps/web/src/pages/Unlock.tsx` (94 lines)
  - Wrap in `<Card variant="raised">`
  - Password input → `<Input type="password">`
  - Submit/logout buttons → `<Button>`
  - Background Aura

  **Must NOT do**:
  - Do NOT change unlock flow

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 94-line file with 3 replacements — trivial
  - **Skills**: []
  - **Skills Evaluated but Omitted**: All omitted — too simple

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 2)
  - **Blocks**: None
  - **Blocked By**: Task 6

  **References**:
  - `apps/web/src/pages/Unlock.tsx:1-40` — Simple form with password + 2 buttons

  **Acceptance Criteria**:
  - [ ] Zero raw form elements in Unlock.tsx
  - [ ] `cd apps/web && npx vitest run` → all pass

  **QA Scenarios**:

  ```
  Scenario: Unlock page uses design system
    Tool: Bash
    Steps:
      1. Run: grep -cn '<button\|<input' apps/web/src/pages/Unlock.tsx
    Expected Result: 0 matches
    Evidence: .sisyphus/evidence/task-12-unlock.txt
  ```

  **Commit**: YES (groups with T10, T11)

---

- [ ] 13. Define CSS Animation Keyframes for 5 Strategic Animations

  **What to do**:
  - Add to `apps/web/src/index.css` (or create a dedicated animations section):
    - `.squish` — `transform: scale(0.92)` on trigger, spring back to 1.0 over 300ms. Used for copy-to-clipboard feedback.
    - `.type-searching` — subtle letter-spacing expansion + color shift to `--color-aura` during active search. `.type-found` — snaps back.
    - `.fade-in` — opacity 0→1 over `--duration-normal` (250ms). Used for page transitions on `<Outlet>`.
    - `.aura-idle` — slow breathing: scale 1.0→1.05→1.0 over 4s infinite, opacity pulse 0.6→0.8→0.6.
    - `.aura-active` — faster pulse: scale 1.0→1.1→1.0 over 1.5s, brighter opacity 0.8→1.0→0.8.
    - `.aura-thinking` — continuous rotation of gradient + faster breathing.
    - `.toast-enter` — slide up from 20px below + fade in over 200ms.
  - Use CSS `@keyframes` — no JS animation libraries
  - Reference design tokens via CSS variables: `var(--duration-normal)`, `var(--ease-spring)`, etc.
  - Include `prefers-reduced-motion` media query to disable animations

  **Must NOT do**:
  - No JavaScript animation libraries
  - No more than these 5 animation categories
  - Do NOT use `!important`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure CSS keyframes — no logic, no state, just animation definitions
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Animation timing and easing expertise
  - **Skills Evaluated but Omitted**:
    - `playwright`: CSS-only, no verification needed beyond visual
    - `git-master`: No git ops

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 2) — NO dependencies from Wave 1 needed
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 16, 17, 31
  - **Blocked By**: None (can actually run in Wave 1, placed in Wave 2 for grouping)

  **References**:

  **Pattern References**:
  - `packages/design/src/tokens/animations.ts:1-6` — Duration tokens: fast=150ms, normal=250ms, slow=400ms, glacial=800ms
  - `packages/design/src/components/Aura.tsx:11-16` — `stateClassMap` defines the class names: `aura-idle`, `aura-active`, `aura-thinking`
  - `packages/design/src/components/Toast.tsx:109` — Toast already uses `className="fade-in"` — so the `.fade-in` keyframe must exist
  - `apps/web/src/index.css` — Existing global styles where keyframes should go

  **WHY Each Reference Matters**:
  - Animation tokens define the duration values to use in CSS
  - Aura class names are ALREADY defined in the component — keyframes must match those exact class names
  - Toast already references `fade-in` class — it needs to actually work

  **Acceptance Criteria**:
  - [ ] 7 animation classes defined in CSS: `.squish`, `.type-searching`, `.type-found`, `.fade-in`, `.aura-idle`, `.aura-active`, `.aura-thinking`, `.toast-enter`
  - [ ] `prefers-reduced-motion` media query disabling all animations
  - [ ] `bun run typecheck` → 0 errors (CSS-only, should be safe)

  **QA Scenarios**:

  ```
  Scenario: Animation keyframes defined in CSS
    Tool: Bash
    Steps:
      1. Run: grep -c '@keyframes' apps/web/src/index.css
    Expected Result: At least 5 @keyframes rules defined
    Evidence: .sisyphus/evidence/task-13-keyframes.txt

  Scenario: Reduced motion respected
    Tool: Bash
    Steps:
      1. Run: grep 'prefers-reduced-motion' apps/web/src/index.css
    Expected Result: Media query present
    Evidence: .sisyphus/evidence/task-13-reduced-motion.txt
  ```

  **Commit**: YES
  - Message: `feat(web): add strategic CSS animations (squish, search-type, fade-in, aura, toast)`
  - Files: `apps/web/src/index.css`
  - Pre-commit: `bun run typecheck`

### Wave 3 — Core Vault UX + Settings (6 parallel, after Wave 2)

- [ ] 14. Redesign Vault List with Card + Badge + Quick-Actions

  **What to do**:
  - Rewrite the item list rendering in `apps/web/src/pages/Vault.tsx` (267 lines)
  - Each vault item rendered as `<Card variant="surface" onClick={...}>` with:
    - Item name + type icon
    - Username/URL preview as secondary text
    - `<Badge>` for item type (login/card/note/identity/passkey/document)
    - `<Badge variant="warning">` for items with security alerts
    - Inline quick-action buttons: copy username, copy password (login only), favorite toggle
    - Copy actions dispatch `window.dispatchEvent(new CustomEvent('lockbox:copy'))` to trigger Aura pulse
  - Replace raw `<button>` elements (currently 4) with `<Button variant="ghost" size="sm">`
  - Replace the search `<input>` at top with `<Input type="search">`
  - Add/edit buttons use `<Button>`
  - Empty state: centered message with `<Aura state="idle" position="center">`

  **Must NOT do**:
  - Do NOT change vault loading logic (`loadVault`, `decryptVaultItem` calls)
  - Do NOT change filter logic
  - Do NOT change clipboard utility

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Core UX redesign — Card layout, Badge integration, visual hierarchy
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Vault list is the primary view — requires excellent visual design
  - **Skills Evaluated but Omitted**:
    - `playwright`: Final wave handles visual QA
    - `git-master`: No git ops

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 3)
  - **Parallel Group**: Wave 3 (with Tasks 15-19)
  - **Blocks**: Task 27 (toast wiring)
  - **Blocked By**: Tasks 7 (ItemPanel decomp), 8 (Aura in layout)

  **References**:

  **Pattern References**:
  - `apps/web/src/pages/Vault.tsx:86-106` — Current filter logic and `displayItems` computation — preserve entirely
  - `apps/web/src/pages/Vault.tsx:45-81` — `loadVault` function — do NOT modify
  - `packages/design/src/components/Card.tsx:38-81` — Card with onClick (interactive mode with hover elevation)
  - `packages/design/src/components/Badge.tsx:3` — BadgeVariant: 'default'|'primary'|'error'|'success'|'warning'

  **WHY Each Reference Matters**:
  - Vault.tsx filter/load logic is the data pipeline — must be preserved exactly
  - Card's interactive mode (onClick → hover effects) is how items become clickable cards
  - Badge variants map to item types and security alert severity

  **Acceptance Criteria**:
  - [ ] Each vault item renders inside a Card component
  - [ ] Badge shows item type
  - [ ] Quick-action copy buttons dispatch 'lockbox:copy' custom event
  - [ ] Zero raw `<button>` or `<input>` in Vault.tsx
  - [ ] `cd apps/web && npx vitest run` → all pass

  **QA Scenarios**:

  ```
  Scenario: Vault list renders items as Cards
    Tool: Playwright
    Preconditions: Dev server, user logged in with vault items
    Steps:
      1. Navigate to /vault
      2. Assert at least one element with Card styling (border-radius: var(--radius-organic-lg))
      3. Assert Badge elements present with item type text
      4. Screenshot
    Expected Result: Items render as Cards with Badges
    Evidence: .sisyphus/evidence/task-14-vault-list.png

  Scenario: Copy action triggers Aura pulse
    Tool: Playwright
    Preconditions: User on vault page with at least one login item
    Steps:
      1. Click copy-password button on first login item
      2. Wait 100ms
      3. Check Aura element has 'aura-active' class
    Expected Result: Aura briefly switches to active state
    Evidence: .sisyphus/evidence/task-14-copy-aura.png
  ```

  **Commit**: YES
  - Message: `feat(web): redesign vault list with Card, Badge, and quick-actions`
  - Files: `apps/web/src/pages/Vault.tsx`
  - Pre-commit: `cd apps/web && npx vitest run`

---

- [ ] 15. Redesign Item Detail with Progressive Disclosure Card Sections

  **What to do**:
  - Update `apps/web/src/components/ItemPanel.tsx` (now the slim orchestrator after Task 7)
  - Wrap each field section in collapsible `<Card>` sections:
    - Primary fields (name, type, folder) — always visible
    - Type-specific fields (LoginFields, CardFields, etc.) — always visible
    - Custom Fields section — collapsible, collapsed by default if empty
    - Security Alerts section — collapsible, expanded by default if alerts present
    - Attachments section — collapsible
    - History section — collapsible
  - Collapsible: simple `useState` toggle with CSS `max-height` transition
  - Section headers use bold text + chevron indicator
  - Action bar at top: `<Button variant="primary">` for Save, `<Button variant="ghost">` for Cancel, `<Button variant="danger">` for Delete
  - Use `<Badge>` for tags display
  - Replace all remaining raw elements in the orchestrator

  **Must NOT do**:
  - Do NOT modify sub-components (they were done in Task 7)
  - Do NOT change save/delete logic

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Progressive disclosure UI pattern — collapsible sections, visual hierarchy
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Collapsible card sections need polished animation and clear affordances
  - **Skills Evaluated but Omitted**: Same as Task 14

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 3)
  - **Blocks**: Task 27
  - **Blocked By**: Tasks 7, 8

  **References**:
  - `apps/web/src/components/ItemPanel.tsx` (post-Task-7 slim version) — the orchestrator to modify
  - `packages/design/src/components/Card.tsx` — Card component for sections
  - `apps/web/src/components/item-fields/` — Sub-components to render inside sections

  **Acceptance Criteria**:
  - [ ] Custom Fields and Attachments sections are collapsible
  - [ ] Action bar uses Button components
  - [ ] Zero raw elements in ItemPanel.tsx
  - [ ] `cd apps/web && npx vitest run` → all pass

  **QA Scenarios**:

  ```
  Scenario: Item detail shows collapsible sections
    Tool: Playwright
    Preconditions: User on vault, click an item to open detail
    Steps:
      1. Open any vault item
      2. Assert Card sections visible
      3. Click "Custom Fields" header
      4. Assert section toggles visibility
    Expected Result: Section collapses/expands on click
    Evidence: .sisyphus/evidence/task-15-progressive-disclosure.png
  ```

  **Commit**: YES
  - Message: `feat(web): redesign item detail with progressive disclosure Card sections`
  - Files: `apps/web/src/components/ItemPanel.tsx`

---

- [ ] 16. Elevate Search Bar + Wire Search Typography Animations

  **What to do**:
  - In `apps/web/src/pages/Vault.tsx`, replace the search input with `<Input type="search">` from `@lockbox/design`
  - Add `.type-searching` class to the search input wrapper when search is active (user typing)
  - Add `.type-found` class when results are displayed
  - Dispatch `window.dispatchEvent(new CustomEvent('lockbox:search'))` when search starts to trigger Aura
  - Style the elevated search bar: larger font, more padding, prominent position at top of vault list
  - Clear search button uses `<Button variant="ghost" size="sm">`

  **Must NOT do**:
  - Do NOT change search store logic (`useSearchStore`)
  - Do NOT change semantic search indexing

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Search bar elevation + typography animation — visual engineering
  - **Skills**: [`frontend-ui-ux`]
  - **Skills Evaluated but Omitted**: Same as Task 14

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 3)
  - **Blocks**: None
  - **Blocked By**: Tasks 8 (Aura in layout), 13 (CSS keyframes)

  **References**:
  - `apps/web/src/pages/Vault.tsx` — Search input location
  - `apps/web/src/store/search.ts` — Search store API (query, searching, results, indexed)
  - Task 13 CSS — `.type-searching`, `.type-found` class definitions

  **Acceptance Criteria**:
  - [ ] Search input uses `<Input type="search">`
  - [ ] `.type-searching` class applied during active search
  - [ ] Search dispatches custom event for Aura
  - [ ] `cd apps/web && npx vitest run` → all pass

  **QA Scenarios**:

  ```
  Scenario: Search bar has typography animation classes
    Tool: Playwright
    Preconditions: User on vault page
    Steps:
      1. Focus search input
      2. Type "test"
      3. Assert .type-searching class on search wrapper
    Expected Result: Animation class applied
    Evidence: .sisyphus/evidence/task-16-search-animation.png
  ```

  **Commit**: YES (groups with T17)
  - Message: `feat(web): elevate search bar with typography animations`

---

- [ ] 17. Wire Copy-to-Clipboard Squish Animation

  **What to do**:
  - In all copy-to-clipboard actions across item-fields components and Vault.tsx:
    - Add `.squish` class to the copy button on click
    - Remove class after 300ms (CSS animation handles the visual)
    - Dispatch `window.dispatchEvent(new CustomEvent('lockbox:copy'))` for Aura
  - Create a shared utility: `apps/web/src/lib/copy-utils.ts` with `copyWithFeedback(text: string, buttonRef: RefObject<HTMLElement>)` that:
    1. Copies to clipboard
    2. Adds `.squish` class
    3. Dispatches custom event
    4. Removes class after 300ms

  **Must NOT do**:
  - Do NOT change what gets copied (username, password, card number, etc.)
  - Do NOT add toast for copy — squish IS the feedback

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small utility function + adding class names to existing buttons
  - **Skills**: []
  - **Skills Evaluated but Omitted**: All — too simple

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 3)
  - **Blocks**: None
  - **Blocked By**: Tasks 7 (item-fields components), 13 (CSS keyframes)

  **References**:
  - `apps/web/src/components/item-fields/*.tsx` — Copy buttons in field components
  - Task 13 CSS — `.squish` keyframe definition

  **Acceptance Criteria**:
  - [ ] `apps/web/src/lib/copy-utils.ts` exists with `copyWithFeedback`
  - [ ] Copy buttons use squish animation
  - [ ] `bun run typecheck` → 0 errors

  **QA Scenarios**:

  ```
  Scenario: Copy button has squish animation
    Tool: Playwright
    Preconditions: User viewing a login item
    Steps:
      1. Click copy-password button
      2. Assert element briefly has .squish class
    Expected Result: Squish class applied and removed within 500ms
    Evidence: .sisyphus/evidence/task-17-squish.png
  ```

  **Commit**: YES (groups with T16)
  - Message: `feat(web): wire copy-to-clipboard squish animation and Aura pulse`
  - Files: `apps/web/src/lib/copy-utils.ts`, item-fields files

---

- [ ] 18. Replace Raw Elements in Settings.tsx

  **What to do**:
  - Replace all 23 raw form elements in `apps/web/src/pages/Settings.tsx` (950 lines)
  - Organize settings into `<Card>` sections: Appearance, Security (2FA), Auto-Lock, Clipboard, Email Aliases, Travel Mode, Hardware Keys, QR Sync
  - Replace `<input>` → `<Input>`, `<button>` → `<Button>`, `<select>` → `<Select>`
  - Replace inline error/success messages with `useToast()`
  - 2FA setup section: QR code stays, but inputs use `<Input>`, buttons use `<Button>`
  - Destructive actions use `<Button variant="danger">`

  **Must NOT do**:
  - Do NOT change 2FA setup/verify flow
  - Do NOT change alias encryption/decryption logic
  - Do NOT change travel mode toggle logic

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 950-line file with 23 replacements across 8 sections — complex, methodical work
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Settings page needs clear section hierarchy with Cards
  - **Skills Evaluated but Omitted**:
    - `playwright`: Final wave handles visual QA

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 3)
  - **Blocks**: Task 27 (toast wiring)
  - **Blocked By**: Tasks 2 (Select), 3 (Textarea), 6 (ToastProvider)

  **References**:
  - `apps/web/src/pages/Settings.tsx:1-80` — Settings structure and state declarations
  - `apps/web/src/pages/Settings.tsx:37-79` — All the local state that must be preserved

  **Acceptance Criteria**:
  - [ ] Zero raw `<button>/<input>/<select>` in Settings.tsx
  - [ ] Settings organized into Card sections
  - [ ] `cd apps/web && npx vitest run` → all pass

  **QA Scenarios**:

  ```
  Scenario: Settings has zero raw elements
    Tool: Bash
    Steps:
      1. Run: grep -cn '<button\|<input\|<select' apps/web/src/pages/Settings.tsx
    Expected Result: 0 matches
    Evidence: .sisyphus/evidence/task-18-settings-raw.txt
  ```

  **Commit**: YES
  - Message: `refactor(web): replace raw elements in Settings with design system`
  - Files: `apps/web/src/pages/Settings.tsx`

---

- [ ] 19. Replace Raw Elements in AISettings.tsx

  **What to do**:
  - Replace all 10 raw form elements in `apps/web/src/pages/AISettings.tsx`
  - Wrap sections in `<Card>`
  - Replace inputs → `<Input>`, buttons → `<Button>`, selects → `<Select>`
  - Provider selection dropdown → `<Select>`

  **Must NOT do**:
  - Do NOT change AI provider configuration logic

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Straightforward replacement — smaller file, clear pattern
  - **Skills**: []
  - **Skills Evaluated but Omitted**: All — simple replacement task

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 3)
  - **Blocks**: None
  - **Blocked By**: Tasks 2 (Select), 3 (Textarea), 6 (ToastProvider)

  **References**:
  - `apps/web/src/pages/AISettings.tsx` — Current structure
  - Same design system refs

  **Acceptance Criteria**:
  - [ ] Zero raw form elements in AISettings.tsx
  - [ ] `cd apps/web && npx vitest run` → all pass

  **QA Scenarios**:

  ```
  Scenario: AISettings has zero raw elements
    Tool: Bash
    Steps:
      1. Run: grep -cn '<button\|<input\|<select' apps/web/src/pages/AISettings.tsx
    Expected Result: 0 matches
    Evidence: .sisyphus/evidence/task-19-aisettings-raw.txt
  ```

  **Commit**: YES (groups with T18)
  - Message: `refactor(web): replace raw elements in AISettings`

### Wave 4 — Supporting Screens + Toast Wiring (8 parallel, after Wave 3)

- [ ] 20. Redesign Health Page with Aura + Badge

  **What to do**:
  - Update `apps/web/src/pages/Health.tsx` (587 lines)
  - Aura state reflects vault health: healthy=`idle` (green calm), issues=`active` (amber pulse), critical=`thinking` (red alert)
  - Wire `useAura()` to set state based on health score thresholds
  - Wrap health score in `<Card variant="raised">`
  - Issue list items use `<Badge variant="error">` for critical, `<Badge variant="warning">` for warnings, `<Badge variant="success">` for resolved
  - Replace remaining raw `<button>/<input>` (3 total) with design system
  - Replace inline error messages with toast
  - Update `apps/web/src/components/HealthScore.tsx` and `apps/web/src/components/IssueList.tsx` to use Card/Badge

  **Must NOT do**:
  - Do NOT change health analysis logic (`analyzeVaultHealth`, `analyzeItem`)
  - Do NOT change HIBP check logic
  - Do NOT change the Security Copilot or Lifecycle Tracker logic

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Health dashboard with Aura integration — visual data presentation
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Dashboard visualization + Aura feedback mapping
  - **Skills Evaluated but Omitted**: `playwright` — final wave

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 4)
  - **Parallel Group**: Wave 4 (with Tasks 21-27)
  - **Blocks**: None
  - **Blocked By**: Tasks 5 (AuraProvider), 8 (Aura in layout)

  **References**:
  - `apps/web/src/pages/Health.tsx:32-47` — Health state and analysis triggers
  - `apps/web/src/components/HealthScore.tsx` — Score display component to update
  - `apps/web/src/components/IssueList.tsx` — Issue rendering to update with Badge

  **Acceptance Criteria**:
  - [ ] Aura state reflects health score
  - [ ] Health sections wrapped in Card
  - [ ] Issues use Badge for severity
  - [ ] Zero raw form elements across Health.tsx, HealthScore.tsx, IssueList.tsx
  - [ ] `cd apps/web && npx vitest run` → all pass

  **QA Scenarios**:

  ```
  Scenario: Health page uses Card and Badge
    Tool: Playwright
    Preconditions: User logged in, health page loaded
    Steps:
      1. Navigate to /health
      2. Assert Card components present
      3. Assert Badge components for issue severity
      4. Screenshot
    Expected Result: Health dashboard with Card sections and Badge indicators
    Evidence: .sisyphus/evidence/task-20-health.png
  ```

  **Commit**: YES
  - Message: `feat(web): redesign Health page with Aura integration and Badge indicators`

---

- [ ] 21. Redesign Chat Page with Aura Inline + Thinking State

  **What to do**:
  - Update `apps/web/src/pages/Chat.tsx` (169 lines)
  - Add `<Aura state={chatAuraState} position="inline">` next to the "Assistant" header
  - Wire Aura state: `idle` when waiting, `thinking` during AI response, `active` when showing results
  - Dispatch `window.dispatchEvent(new CustomEvent('lockbox:chat-thinking'))` when AI starts generating
  - Wrap message bubbles in `<Card variant="surface">` for assistant messages
  - User messages get `<Card variant="raised">`
  - Replace raw `<button>` (5 total) with `<Button>` — send button `variant="primary"`, clear `variant="ghost"`, approve/deny `variant="primary"`/`variant="danger"`
  - Replace chat input with `<Input>` or `<Textarea>` for multi-line support
  - Loading indicator integrates with Aura thinking state

  **Must NOT do**:
  - Do NOT change chat store logic (`useChatStore`)
  - Do NOT change AI provider configuration or message handling

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Chat UX with Aura integration — visual + interaction design
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Chat bubble design, Aura inline positioning, thinking state animation
  - **Skills Evaluated but Omitted**: `playwright` — final wave

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 4)
  - **Blocks**: None
  - **Blocked By**: Tasks 5 (AuraProvider), 8 (Aura in layout)

  **References**:
  - `apps/web/src/pages/Chat.tsx:1-80` — Current chat structure, message rendering
  - `apps/web/src/store/chat.ts` — Chat store API
  - `packages/design/src/components/Aura.tsx:18-22` — `position="inline"` size: 40x40

  **Acceptance Criteria**:
  - [ ] Aura inline next to chat header
  - [ ] Aura shows thinking state during AI response
  - [ ] Message bubbles use Card components
  - [ ] Zero raw form elements
  - [ ] `cd apps/web && npx vitest run` → all pass

  **QA Scenarios**:

  ```
  Scenario: Chat page has inline Aura
    Tool: Playwright
    Preconditions: User on chat page
    Steps:
      1. Navigate to /chat
      2. Assert Aura element with inline positioning near header
      3. Type a message and send
      4. Assert Aura switches to thinking state
      5. Screenshot
    Expected Result: Inline Aura visible, reacts to chat activity
    Evidence: .sisyphus/evidence/task-21-chat-aura.png
  ```

  **Commit**: YES
  - Message: `feat(web): redesign Chat page with inline Aura and Card message bubbles`

---

- [ ] 22. Replace Raw Elements in Generator.tsx

  **What to do**:
  - Replace all 8 raw form elements in `apps/web/src/pages/Generator.tsx`
  - Password length slider stays (no design system slider) but wrap in styled container
  - Toggle switches for uppercase/lowercase/digits/symbols → `<Button variant="ghost">` toggle group
  - Generated password display in `<Card variant="surface">`
  - Copy button → `<Button>` with squish animation
  - Replace passphrase separator input → `<Input>`

  **Must NOT do**:
  - Do NOT change generator logic

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Straightforward replacement with minor visual enhancement
  - **Skills**: []
  - **Skills Evaluated but Omitted**: All — simple

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 4)
  - **Blocks**: None
  - **Blocked By**: Tasks 2 (Select), 6 (ToastProvider)

  **References**:
  - `apps/web/src/pages/Generator.tsx` — 8 raw elements to replace

  **Acceptance Criteria**:
  - [ ] Zero raw `<button>/<input>` in Generator.tsx
  - [ ] `cd apps/web && npx vitest run` → all pass

  **QA Scenarios**:

  ```
  Scenario: Generator has zero raw elements
    Tool: Bash
    Steps:
      1. Run: grep -cn '<button\|<input\|<select' apps/web/src/pages/Generator.tsx
    Expected Result: 0 matches
    Evidence: .sisyphus/evidence/task-22-generator-raw.txt
  ```

  **Commit**: YES (groups with other page replacements)

---

- [ ] 23. Replace Raw Elements in Teams.tsx + TeamDetail.tsx

  **What to do**:
  - Replace 9 raw elements in `apps/web/src/pages/Teams.tsx`
  - Replace 18 raw elements in `apps/web/src/pages/TeamDetail.tsx`
  - Team cards → `<Card>` with team name, member count badge
  - Invite form → `<Input>` + `<Button>`
  - Role selector → `<Select>`
  - Member list items in `<Card variant="surface">`
  - Shared folder management uses `<Card>` sections
  - Replace error/success messages with toast

  **Must NOT do**:
  - Do NOT change team crypto logic (RSA-OAEP key wrapping)
  - Do NOT change invitation flow

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Two files with 27 total replacements + complex team management UI
  - **Skills**: [`frontend-ui-ux`]
  - **Skills Evaluated but Omitted**: `playwright` — final wave

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 4)
  - **Blocks**: None
  - **Blocked By**: Tasks 2, 3, 6

  **References**:
  - `apps/web/src/pages/Teams.tsx` — 9 raw elements
  - `apps/web/src/pages/TeamDetail.tsx` — 18 raw elements

  **Acceptance Criteria**:
  - [ ] Zero raw form elements across both files
  - [ ] `cd apps/web && npx vitest run` → all pass

  **QA Scenarios**:

  ```
  Scenario: Teams pages have zero raw elements
    Tool: Bash
    Steps:
      1. Run: grep -cn '<button\|<input\|<select' apps/web/src/pages/Teams.tsx apps/web/src/pages/TeamDetail.tsx
    Expected Result: 0 matches in both files
    Evidence: .sisyphus/evidence/task-23-teams-raw.txt
  ```

  **Commit**: YES

---

- [ ] 24. Replace Raw Elements in EmergencyAccess.tsx

  **What to do**:
  - Replace 10 raw elements in `apps/web/src/pages/EmergencyAccess.tsx`
  - Emergency contacts list in `<Card>` sections
  - Add/grant forms use `<Input>` + `<Button>`
  - Status badges use `<Badge>`

  **Must NOT do**:
  - Do NOT change emergency access flow

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: Standard replacement pattern
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 4)
  - **Blocks**: None
  - **Blocked By**: Tasks 2, 6

  **Acceptance Criteria**:
  - [ ] Zero raw form elements
  - [ ] `cd apps/web && npx vitest run` → all pass

  **QA Scenarios**:

  ```
  Scenario: EmergencyAccess zero raw elements
    Tool: Bash
    Steps:
      1. Run: grep -cn '<button\|<input\|<select' apps/web/src/pages/EmergencyAccess.tsx
    Expected Result: 0 matches
    Evidence: .sisyphus/evidence/task-24-emergency-raw.txt
  ```

  **Commit**: YES (groups with other page replacements)

---

- [ ] 25. Replace Raw Elements in ImportExport.tsx

  **What to do**:
  - Replace 8 raw elements in `apps/web/src/pages/ImportExport.tsx`
  - File upload area in `<Card>`
  - Format selector → `<Select>`
  - Action buttons → `<Button>`

  **Must NOT do**:
  - Do NOT change import/export logic

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 4)
  - **Blocks**: None
  - **Blocked By**: Task 6

  **Acceptance Criteria**:
  - [ ] Zero raw form elements
  - [ ] `cd apps/web && npx vitest run` → all pass

  **QA Scenarios**:

  ```
  Scenario: ImportExport zero raw elements
    Tool: Bash
    Steps:
      1. Run: grep -cn '<button\|<input\|<select' apps/web/src/pages/ImportExport.tsx
    Expected Result: 0 matches
    Evidence: .sisyphus/evidence/task-25-importexport-raw.txt
  ```

  **Commit**: YES (groups with other page replacements)

---

- [ ] 26. Replace Raw Elements in Trash.tsx + ShareView.tsx

  **What to do**:
  - Replace 4 raw elements in `apps/web/src/pages/Trash.tsx`
  - Replace 12 raw elements in `apps/web/src/pages/ShareView.tsx`
  - Trash items in `<Card>` with restore/delete `<Button>` actions
  - ShareView form uses `<Input>` + `<Card>` layout
  - Shared item display in `<Card variant="raised">`

  **Must NOT do**:
  - Do NOT change trash restore/delete logic
  - Do NOT change share link decryption logic (HKDF key derivation)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 4)
  - **Blocks**: None
  - **Blocked By**: Task 6

  **Acceptance Criteria**:
  - [ ] Zero raw form elements in both files
  - [ ] `cd apps/web && npx vitest run` → all pass

  **QA Scenarios**:

  ```
  Scenario: Trash and ShareView zero raw elements
    Tool: Bash
    Steps:
      1. Run: grep -cn '<button\|<input\|<select' apps/web/src/pages/Trash.tsx apps/web/src/pages/ShareView.tsx
    Expected Result: 0 matches in both
    Evidence: .sisyphus/evidence/task-26-trash-share-raw.txt
  ```

  **Commit**: YES

---

- [ ] 27. Replace Inline Messages with Toast System Across All Pages

  **What to do**:
  - Audit ALL pages for inline error/success messages (patterns: `{error && <p>...`, `setError(...)`, `setSuccess(...)`)
  - Replace with `useToast().toast(message, variant)`:
    - `setError('...')` → `toast('...', 'error')`
    - `setSuccess('...')` → `toast('...', 'success')`
    - Loading states → keep as-is (not toast-worthy)
  - Files to update (from grep analysis): Login, Register, Settings, Teams, TeamDetail, EmergencyAccess, Chat, Health, AISettings, ImportExport, ItemPanel, ShareLinkModal
  - Remove now-unused `error`/`success` state variables where the ONLY consumer was the inline message
  - Keep `error` state if it's used for form validation (e.g., Input error prop) — Toast for transient notifications, Input error for field-level validation

  **Must NOT do**:
  - Do NOT replace field-level validation errors (those belong on `<Input error={...}>`)
  - Do NOT remove loading state indicators
  - Do NOT change error handling logic — only the display

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Cross-cutting concern touching 12+ files — needs systematic approach
  - **Skills**: []
  - **Skills Evaluated but Omitted**: All — systematic find-and-replace, not visual

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 4, but runs after T18 for Settings)
  - **Parallel Group**: Wave 4
  - **Blocks**: Final wave
  - **Blocked By**: Tasks 6 (ToastProvider), 18 (Settings must be Card-ified first)

  **References**:
  - All page files — search for `setError\(` and `{error &&`
  - `apps/web/src/providers/ToastProvider.tsx` — `useToast()` API

  **Acceptance Criteria**:
  - [ ] No inline `{error && <p className="text-red...">}` patterns remaining (except field-level Input errors)
  - [ ] Toast used for all transient notifications
  - [ ] `cd apps/web && npx vitest run` → all pass
  - [ ] `bun run typecheck` → 0 errors

  **QA Scenarios**:

  ```
  Scenario: No inline error messages remain (except field validation)
    Tool: Bash
    Steps:
      1. Run: grep -rn 'text-red\|text-\[var(--color-error)\].*error' apps/web/src/pages/ | grep -v 'Input\|error=' | wc -l
    Expected Result: 0 or near-0 matches (only field-level errors remain)
    Evidence: .sisyphus/evidence/task-27-no-inline-errors.txt

  Scenario: Toast triggers on error conditions
    Tool: Playwright
    Preconditions: Dev server, on login page
    Steps:
      1. Submit login form with invalid credentials
      2. Assert Toast appears at bottom-right with error variant
      3. Screenshot
    Expected Result: Toast notification visible with error message
    Evidence: .sisyphus/evidence/task-27-toast-error.png
  ```

  **Commit**: YES
  - Message: `feat(web): replace inline messages with Toast system across all pages`
  - Files: Multiple pages
  - Pre-commit: `bun run test && bun run typecheck`

### Wave 5 — Extension Popup + Remaining Components (5 parallel, overlaps with Waves 3-4)

> Note: Extension work (Tasks 28-31) is an INDEPENDENT track from web work.
> Task 28 can start after Wave 1 completes (it only needs the design system components).
> Tasks 29-31 wait for Task 28 but NOT for web tasks.

- [ ] 28. Extract Extension Views into Separate Files

  **What to do**:
  - Decompose `apps/extension/entrypoints/popup/App.tsx` (4,693 lines) into separate view files
  - Create directory `apps/extension/entrypoints/popup/views/`
  - Extract these views based on the `ViewState` type (lines 49-62):
    - `views/SetupView.tsx` — API URL configuration
    - `views/LoginView.tsx` — Login/2FA authentication
    - `views/TabsView.tsx` — Main tabbed interface (site, vault, shared, generator, totp)
    - `views/DetailView.tsx` — Item detail/view
    - `views/AddView.tsx` — New item creation
    - `views/EditView.tsx` — Item editing
    - `views/HealthView.tsx` — Health dashboard
    - `views/AISettingsView.tsx` — AI provider config
    - `views/ChatView.tsx` — Chat interface
    - `views/HWKeysView.tsx` — Hardware key management
    - `views/QRSyncView.tsx` — QR sync
    - `views/TrashView.tsx` — Trash management
    - `views/SettingsView.tsx` — Extension settings
    - `views/EmergencyView.tsx` — Emergency access
    - `views/HistoryView.tsx` — Item history
  - Slim App.tsx to view router + shared state:
    - Authentication state management stays in App.tsx
    - Each view receives: `setView`, relevant state, shared utilities
    - Target: App.tsx under 300 lines
  - Shared utilities (typeIcon, formatFileSize, sendMessage) → `views/shared.ts`

  **Must NOT do**:
  - Do NOT touch `entrypoints/content.ts` or `entrypoints/webauthn-interceptor.ts`
  - Do NOT touch `entrypoints/background.ts`
  - Do NOT change any chrome.runtime.sendMessage calls
  - Do NOT change encryption/decryption logic
  - Do NOT add new npm dependencies

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 4,693-line monolith decomposition — highest-risk extraction in the plan. Requires understanding complex state flow between 15 views.
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Extension popup has constrained 360×480px viewport — visual awareness needed during extraction
  - **Skills Evaluated but Omitted**:
    - `playwright`: Can't easily test extension popup via Playwright
    - `git-master`: No git operations
    - `cloudflare-deploy`: No deployment

  **Parallelization**:
  - **Can Run In Parallel**: YES (independent from web work)
  - **Parallel Group**: Wave 5 (can start as early as after Wave 1)
  - **Blocks**: Tasks 29, 30, 31
  - **Blocked By**: None from web track (only needs design system from Wave 1)

  **References**:

  **Pattern References**:
  - `apps/extension/entrypoints/popup/App.tsx:1-80` — Imports, ViewState type, sendMessage helper. These define the extraction surface.
  - `apps/extension/entrypoints/popup/App.tsx:49-62` — ViewState union type — one view file per variant
  - `apps/extension/entrypoints/popup/App.tsx:77-80` — SetupView already defined as a local function — extraction model

  **Test References**:
  - `apps/extension/src/__tests__/` — 10 test files that must continue passing. Most test lib/ modules, not popup UI directly.

  **WHY Each Reference Matters**:
  - ViewState type defines the EXACT set of views to extract — one file per variant
  - SetupView at line 79 shows how views are already structured as functions — extract to files
  - Extension tests mostly cover lib/ modules — popup decomposition should be safe

  **Acceptance Criteria**:
  - [ ] 15 view files in `apps/extension/entrypoints/popup/views/`
  - [ ] `apps/extension/entrypoints/popup/App.tsx` under 400 lines
  - [ ] `cd apps/extension && npx vitest run` → all 51 tests pass
  - [ ] `bun run typecheck` → 0 errors in extension

  **QA Scenarios**:

  ```
  Scenario: Extension tests pass after decomposition
    Tool: Bash
    Preconditions: All view files extracted
    Steps:
      1. Run: cd apps/extension && npx vitest run
    Expected Result: All 51 tests pass
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-28-extension-tests.txt

  Scenario: App.tsx is under 400 lines
    Tool: Bash
    Steps:
      1. Run: wc -l apps/extension/entrypoints/popup/App.tsx
    Expected Result: Under 400 lines
    Evidence: .sisyphus/evidence/task-28-line-count.txt

  Scenario: All 15 view files exist
    Tool: Bash
    Steps:
      1. Run: ls apps/extension/entrypoints/popup/views/ | wc -l
    Expected Result: At least 15 files (views + shared.ts)
    Evidence: .sisyphus/evidence/task-28-view-count.txt
  ```

  **Commit**: YES
  - Message: `refactor(extension): decompose popup from 4,693-line monolith into 15 view files`
  - Files: `apps/extension/entrypoints/popup/App.tsx`, `apps/extension/entrypoints/popup/views/*.tsx`
  - Pre-commit: `cd apps/extension && npx vitest run`

---

- [ ] 29. Integrate Button + Input into Extension Views

  **What to do**:
  - Across all 15 extracted extension view files, replace raw `<button>` with `<Button>` from `@lockbox/design`
  - Replace raw `<input>` with `<Input>` from `@lockbox/design`
  - Map variants:
    - Primary actions (login, save, send) → `variant="primary" size="sm"` (compact for extension)
    - Secondary actions → `variant="secondary" size="sm"`
    - Nav/toggle → `variant="ghost" size="sm"`
    - Danger (delete, logout) → `variant="danger" size="sm"`
  - All sizes should be "sm" in extension (compact popup viewport)
  - Ensure `@lockbox/design` is in extension's package.json dependencies

  **Must NOT do**:
  - Do NOT change any logic or state management
  - Do NOT change chrome API calls
  - Size MUST be "sm" — extension popup is 360×480px

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Component integration with constrained viewport considerations
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Compact viewport requires careful sizing decisions
  - **Skills Evaluated but Omitted**: `playwright` — extension popup not easily Playwright-testable

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 30-32)
  - **Parallel Group**: Wave 5
  - **Blocks**: None
  - **Blocked By**: Task 28 (views must be extracted first)

  **References**:
  - `apps/extension/entrypoints/popup/views/*.tsx` — All extracted view files
  - `packages/design/src/components/Button.tsx:35-51` — Size styles: sm = 32px min-height
  - `packages/design/src/components/Input.tsx` — Input component

  **Acceptance Criteria**:
  - [ ] Zero raw `<button>` or `<input>` across all view files
  - [ ] All buttons use `size="sm"`
  - [ ] `cd apps/extension && npx vitest run` → all pass
  - [ ] `bun run typecheck` → 0 errors

  **QA Scenarios**:

  ```
  Scenario: Extension views have zero raw button/input elements
    Tool: Bash
    Steps:
      1. Run: grep -rn '<button\|<input' apps/extension/entrypoints/popup/views/ | grep -v 'Button\|Input' | wc -l
    Expected Result: 0 matches
    Evidence: .sisyphus/evidence/task-29-ext-no-raw.txt
  ```

  **Commit**: YES (groups with T30, T31)
  - Message: `feat(extension): integrate Button and Input from design system`

---

- [ ] 30. Integrate Card + Badge into Extension Views

  **What to do**:
  - In extension view files, wrap item displays in `<Card variant="surface" padding="sm">`
  - Add `<Badge>` for item types, health status, etc.
  - Vault items list: each item in a compact Card
  - Detail view: sections in Card
  - Health view: issues with Badge severity indicators
  - Card padding MUST be "sm" in extension (compact viewport)

  **Must NOT do**:
  - Do NOT use Card variant="frost" (except if Modal is needed)
  - Do NOT change any logic

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Card/Badge integration with compact layout considerations
  - **Skills**: [`frontend-ui-ux`]
  - **Skills Evaluated but Omitted**: Same as T29

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 29, 31, 32)
  - **Blocks**: None
  - **Blocked By**: Task 28

  **References**:
  - `apps/extension/entrypoints/popup/views/*.tsx` — View files
  - `packages/design/src/components/Card.tsx:32-36` — Padding map: sm=12px

  **Acceptance Criteria**:
  - [ ] Items displayed in Card components
  - [ ] Badge used for type/severity indicators
  - [ ] `cd apps/extension && npx vitest run` → all pass

  **QA Scenarios**:

  ```
  Scenario: Extension uses Card and Badge
    Tool: Bash
    Steps:
      1. Run: grep -rn "from '@lockbox/design'" apps/extension/entrypoints/popup/views/ | wc -l
    Expected Result: Multiple files importing design system
    Evidence: .sisyphus/evidence/task-30-ext-design-imports.txt
  ```

  **Commit**: YES (groups with T29, T31)
  - Message: `feat(extension): integrate Card and Badge from design system`

---

- [ ] 31. Wire Constrained Animations for 360×480px Extension Popup

  **What to do**:
  - Add a minimal CSS file: `apps/extension/entrypoints/popup/animations.css`
  - Include ONLY: `.fade-in`, `.squish`, `.toast-enter` — NO Aura animations (too large for extension popup)
  - Animations must be subtle — extension popup has limited viewport
  - `.fade-in` duration: 150ms (faster than web's 250ms)
  - `.squish` scale: 0.95 (less dramatic than web's 0.92)
  - Import this CSS in `apps/extension/entrypoints/popup/main.tsx`
  - `prefers-reduced-motion` respected

  **Must NOT do**:
  - Do NOT add Aura animations (too heavy for extension)
  - Do NOT add search typography animations (no room in extension)
  - Do NOT add more than 3 animation classes

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 3 CSS animation classes — trivial
  - **Skills**: []
  - **Skills Evaluated but Omitted**: All — CSS-only task

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 29, 30, 32)
  - **Blocks**: None
  - **Blocked By**: Tasks 28 (extension decomp), 13 (reference for animation patterns)

  **References**:
  - Task 13 CSS — Animation patterns to scale down for extension
  - `apps/extension/entrypoints/popup/main.tsx` — Where to import CSS

  **Acceptance Criteria**:
  - [ ] `apps/extension/entrypoints/popup/animations.css` exists with 3 animation classes
  - [ ] `prefers-reduced-motion` query present
  - [ ] Imported in main.tsx
  - [ ] `bun run typecheck` → 0 errors

  **QA Scenarios**:

  ```
  Scenario: Extension animations CSS exists and is imported
    Tool: Bash
    Steps:
      1. Run: grep 'animations.css' apps/extension/entrypoints/popup/main.tsx
      2. Run: grep '@keyframes' apps/extension/entrypoints/popup/animations.css | wc -l
    Expected Result: Import found, at least 2 keyframes defined
    Evidence: .sisyphus/evidence/task-31-ext-animations.txt
  ```

  **Commit**: YES (groups with T29, T30)
  - Message: `feat(extension): add constrained animations for popup viewport`

---

- [ ] 32. Replace Raw Elements in ShareLinkModal + AttachmentSection + ItemHistoryPanel + IssueList

  **What to do**:
  - Replace 8 raw elements in `apps/web/src/components/ShareLinkModal.tsx` — migrate to `<Modal>` from design system
  - Replace 4 raw elements in `apps/web/src/components/AttachmentSection.tsx`
  - Replace 3 raw elements in `apps/web/src/components/ItemHistoryPanel.tsx`
  - Replace 2 raw elements in `apps/web/src/components/IssueList.tsx`
  - ShareLinkModal: replace custom modal wrapper with `<Modal>` component
  - All buttons → `<Button>`, inputs → `<Input>`

  **Must NOT do**:
  - Do NOT change share link crypto logic (HKDF derivation)
  - Do NOT change file upload/download logic

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 4 files, 17 total replacements — moderate complexity
  - **Skills**: []
  - **Skills Evaluated but Omitted**: All — systematic replacement

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 5)
  - **Blocks**: None
  - **Blocked By**: Tasks 2 (Select), 4 (Modal), 6 (ToastProvider)

  **References**:
  - `apps/web/src/components/ShareLinkModal.tsx` — 8 raw elements + custom modal to replace with Modal
  - `packages/design/src/components/Modal.tsx` — Modal API (created in Task 4)

  **Acceptance Criteria**:
  - [ ] ShareLinkModal uses `<Modal>` from design system
  - [ ] Zero raw form elements across all 4 files
  - [ ] `cd apps/web && npx vitest run` → all pass

  **QA Scenarios**:

  ```
  Scenario: All 4 component files have zero raw elements
    Tool: Bash
    Steps:
      1. Run: grep -cn '<button\|<input\|<select\|<textarea' apps/web/src/components/ShareLinkModal.tsx apps/web/src/components/AttachmentSection.tsx apps/web/src/components/ItemHistoryPanel.tsx apps/web/src/components/IssueList.tsx
    Expected Result: 0 matches in all files
    Evidence: .sisyphus/evidence/task-32-components-raw.txt
  ```

  **Commit**: YES
  - Message: `refactor(web): replace raw elements in remaining component files`
  - Files: 4 component files
  - Pre-commit: `cd apps/web && npx vitest run`

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `deep`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `bun run typecheck` + `bun run lint` + `bun run test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, `console.log` in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp). Verify all imports use `.js` extensions.
      Output: `Typecheck [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` + `playwright` skill
      Start from clean state. Run dev server (`cd apps/web && bun run dev`). Execute EVERY QA scenario from EVERY task via Playwright — follow exact steps, capture evidence. Test cross-task integration (Aura + Toast + Card working together). Test edge cases: empty vault, dark mode toggle, rapid copy-paste. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff (`git diff`). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
      Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| After  | Commit Message                                                       | Test Gate                                           |
| ------ | -------------------------------------------------------------------- | --------------------------------------------------- |
| Wave 1 | `test(crypto): add round-trip encryption tests for all 6 item types` | `cd apps/web && npx vitest run`                     |
| Wave 1 | `feat(design): add Select, Textarea, Modal components`               | `cd packages/design && bun run build`               |
| Wave 1 | `feat(web): add AuraProvider and ToastProvider`                      | `cd apps/web && npx vitest run`                     |
| Wave 2 | `refactor(web): decompose ItemPanel into sub-components`             | `bun run test && bun run typecheck`                 |
| Wave 2 | `feat(web): integrate Aura into AppLayout + page transitions`        | `bun run test`                                      |
| Wave 2 | `refactor(web): replace raw elements in auth pages`                  | `bun run test`                                      |
| Wave 3 | `feat(web): redesign vault list and item detail with Card/Badge`     | `bun run test`                                      |
| Wave 3 | `feat(web): wire search typography and copy squish animations`       | `bun run test`                                      |
| Wave 3 | `refactor(web): replace raw elements in Settings + AISettings`       | `bun run test`                                      |
| Wave 4 | `feat(web): redesign Health and Chat with Aura integration`          | `bun run test`                                      |
| Wave 4 | `refactor(web): replace raw elements in remaining pages`             | `bun run test`                                      |
| Wave 4 | `feat(web): wire Toast system across all pages`                      | `bun run test && bun run typecheck`                 |
| Wave 5 | `refactor(extension): decompose popup into view files`               | `cd apps/extension && npx vitest run`               |
| Wave 5 | `feat(extension): integrate design system components`                | `cd apps/extension && npx vitest run`               |
| Wave 5 | `refactor(web): replace raw elements in remaining components`        | `bun run test`                                      |
| Final  | `chore: final QA pass and cleanup`                                   | `bun run test && bun run typecheck && bun run lint` |

---

## Success Criteria

### Verification Commands

```bash
bun run test          # Expected: 1,012+ tests pass (0 failures)
bun run typecheck     # Expected: 0 errors
bun run lint          # Expected: 0 errors
```

### Final Checklist

- [ ] All "Must Have" items present and verified
- [ ] All "Must NOT Have" items absent (no `as any`, no raw buttons, no frost outside modals)
- [ ] All 1,012+ tests pass
- [ ] TypeScript strict — zero errors
- [ ] Aura visible in AppLayout, responding to copy/search/chat events
- [ ] Toast system replaces all inline messages
- [ ] Extension popup decomposed into separate view files
- [ ] Light mode and dark mode fully functional
- [ ] 5 animations wired: copy squish, search typography, page fade-in, Aura breathing, toast entrance
