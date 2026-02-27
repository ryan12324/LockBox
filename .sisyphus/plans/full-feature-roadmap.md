# Lockbox Full Feature Roadmap — 4 Waves, 19 Features, 38 Tasks

## TL;DR

> **Quick Summary**: Implement all 19 next-phase features for Lockbox across all 4 application surfaces (web, extension, mobile, API), organized into 4 progressive waves from table-stakes to moonshots.
>
> **Deliverables**:
>
> - 5 Wave 1 features: Identity item type, custom fields, trash auto-purge, account TOTP 2FA, save-on-submit
> - 5 Wave 2 features: File attachments, version history, QR scan TOTP, 2FA detection, email aliases
> - 4 Wave 3 features: Emergency access, passkey storage, CLI tool, travel mode
> - 5 Wave 4 features: AI password rotation, document vault, self-hosted relay, hardware keys, multi-device QR sync
> - All features implemented across web + extension + mobile + API (as per AGENTS.md mandate)
> - Full test coverage via vitest + agent-executed QA
>
> **Estimated Effort**: XL (4 waves, 8-12 weeks total)
> **Parallel Execution**: YES — 12 sub-waves with 2-7 parallel tasks each
> **Critical Path**: T1→T3→T6→T10→T13→T19→T23→T27→T30→F1-F4

---

## Context

### Original Request

Complete next-phase feature roadmap for Lockbox: 19 features across 4 waves, each implemented across all application surfaces (web vault, browser extension, mobile app, API).

### Codebase Analysis

**Architecture Verified**:

- `apps/api` — Hono on CF Workers, D1 SQLite, Drizzle ORM, 9 route files, auth middleware, 125-line schema
- `apps/web` — React 19, Vite, Tailwind v4, Zustand, 13 pages, 5 components, 6 stores
- `apps/extension` — WXT, content script (form-detector.ts + autofill.ts), background.ts, popup/
- `apps/mobile` — Capacitor, Kotlin plugins (biometric, autofill, storage), offline sync queue
- `packages/types` — vault.ts (VaultItemType = 'login' | 'note' | 'card'), api.ts, crypto.ts, team.ts, sharing.ts, ai.ts, guards.ts
- `packages/crypto` — AES-256-GCM (encryption.ts), RSA-OAEP (rsa.ts), HKDF (hkdf.ts), Argon2id (kdf.ts), HIBP (breach.ts)

**Key Patterns Discovered**:

- Vault items: Client generates `id` + `revisionDate`, encrypts with AAD = `utf8(itemId:revisionDate)`, sends encrypted blob; server stores opaquely
- `encryptedData` = `base64(iv).base64(ciphertext+tag)` — single string format
- ItemPanel.tsx (951 lines) handles view/edit/add for all types with type-discriminated sections
- Extension form-detector detects username/password/email via heuristic attribute matching
- Extension autofill uses SPA-compatible event simulation (click→focus→input→change→blur)
- RSA-OAEP used for folder key wrapping in team sharing (rsa.ts has full wrap/unwrap)
- D1 migrations via Drizzle in `apps/api/drizzle/` (2 migration files)
- **R2 NOT configured** in wrangler.toml — needed for file attachments (Wave 2)
- **No email service** configured — needed for emergency access notifications (Wave 3)
- **No scheduled workers** configured — needed for trash auto-purge (Wave 1)

### Gap Analysis (Self-Performed)

**Identified Gaps Addressed in Plan**:

1. R2 bucket must be provisioned and added to wrangler.toml before file attachments
2. Email service (Cloudflare Email Workers or external SMTP) needed for emergency access
3. Scheduled worker cron trigger needed for trash auto-purge
4. `VaultItemType` union must be extended: 'identity' (W1), 'passkey' (W3), 'document' (W4)
5. EncryptedVaultItem has separate `iv` field — but AGENTS.md says `encryptedData = base64(iv).base64(ct+tag)` single string. Current code has both `encryptedData` AND `iv` on the schema. Tasks must follow the SINGLE-STRING convention from AGENTS.md for new features.

---

## Work Objectives

### Core Objective

Implement all 19 planned features across all application surfaces, maintaining zero-knowledge encryption, strict TypeScript, and the existing architectural patterns.

### Concrete Deliverables

- 3 new vault item types: `identity`, `passkey`, `document`
- Custom fields on all vault items
- Account-level TOTP 2FA with backup codes
- Trash auto-purge (30-day scheduled worker)
- Save-on-submit credential detection (extension)
- File attachment system (R2-backed, client-encrypted)
- Version history (last 10 versions per item)
- QR code scanning for TOTP (mobile)
- 2FA detection in health dashboard (2fa.directory API)
- Email alias integration (SimpleLogin/AnonAddy)
- Emergency access with timed release
- Passkey storage + WebAuthn authenticator (extension)
- CLI tool (`apps/cli`)
- Travel mode
- AI password rotation agent
- Secure document vault
- Self-hosted relay (Cloudflare Tunnel)
- Hardware security key storage
- Multi-device key sync via QR

### Definition of Done

- [ ] All 19 features functional across all applicable surfaces
- [ ] `bun run test` passes (all existing + new tests)
- [ ] `bun run typecheck` passes with zero errors
- [ ] All QA scenarios executed with evidence captured

### Must Have

- Every new vault item type follows AAD encryption contract: `utf8(itemId:revisionDate)`
- All encrypted data uses single-string format: `base64(iv).base64(ciphertext+tag)`
- All client surfaces (web/ext/mobile) support each new feature
- Strict TypeScript — no `as any`, no `@ts-ignore`
- Full dark mode support (Tailwind `dark:` variants)
- `.js` extensions on all local imports

### Must NOT Have (Guardrails)

- NO server-side decryption of vault data — server stays zero-knowledge
- NO storing master key, user key, or plaintext secrets to disk/localStorage
- NO single-surface features (except Feature 5: save-on-submit is extension-inherent, but save action goes through shared vault CRUD)
- NO breaking changes to existing vault item types
- NO modifying existing migration files (add new migrations only)
- NO hardcoded API keys or secrets
- NO `console.log` in production code (use proper error handling)
- NO overriding client-provided `id` or `revisionDate` on server side

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision

- **Infrastructure exists**: YES (vitest across all 4 apps: 52+108+51+84 = 295 tests)
- **Automated tests**: Tests-after (each task includes test requirements)
- **Framework**: vitest (existing)
- **Test Commands**:
  - `cd apps/api && npx vitest run`
  - `cd apps/web && npx vitest run`
  - `cd apps/extension && npx vitest run`
  - `cd apps/mobile && npx vitest run`

### QA Policy

Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Web UI**: Playwright (playwright skill) — navigate, interact, assert DOM, screenshot
- **Extension**: Playwright + manual content script testing via tmux
- **Mobile**: tmux (Capacitor build verification + Android emulator where possible)
- **API**: Bash (curl) — send requests, assert status + response fields
- **CLI**: tmux — run commands, validate output
- **Packages**: Bash (bun test) — import, call functions, compare output

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1A (Start immediately — types + migration foundation):
├── Task 1: Types: Identity, custom fields, 2FA types, guards [quick]
├── Task 2: API Migration: identity, custom fields, 2FA, trash [quick]

Wave 1B (After 1A — API routes, 3 parallel):
├── Task 3: API: Vault routes for identity + custom fields (depends: 1, 2) [unspecified-high]
├── Task 4: API: Account TOTP 2FA flow (depends: 2) [deep]
├── Task 5: API: Trash auto-purge scheduled worker (depends: 2) [unspecified-high]

Wave 1C (After 1B — client surfaces, 4 parallel):
├── Task 6: Web: Identity item + custom fields in ItemPanel (depends: 3) [visual-engineering]
├── Task 7: Web: Trash view + Account 2FA setup (depends: 4, 5) [visual-engineering]
├── Task 8: Extension: Identity autofill + save-on-submit (depends: 3) [deep]
├── Task 9: Mobile: Identity + custom fields + 2FA login (depends: 3, 4) [deep]

Wave 2A (After Wave 1 — foundation, 3 parallel):
├── Task 10: API + R2: File attachment endpoints (depends: W1) [unspecified-high]
├── Task 11: API: Version history table + endpoints (depends: W1) [unspecified-high]
├── Task 12: Types: Attachment, version, 2FA-directory, alias types (depends: W1) [quick]

Wave 2B (After 2A — features, 4 parallel):
├── Task 13: Web: File attachments UI (depends: 10, 12) [visual-engineering]
├── Task 14: Web: Version history + 2FA detection dashboard (depends: 11, 12) [visual-engineering]
├── Task 15: API + Web: Email alias integration (depends: 12) [unspecified-high]
├── Task 16: Extension: Attachments + 2FA detection + alias (depends: 10, 12) [deep]

Wave 2C (After 2B — mobile, 2 parallel):
├── Task 17: Mobile: QR scanner plugin + file attachments (depends: 10) [deep]
├── Task 18: Mobile: Version history + 2FA detection + aliases (depends: 11, 15) [deep]

Wave 3A (After Wave 2 — foundation, 4 parallel):
├── Task 19: Types + Crypto: Emergency access + passkey + travel types (depends: W2) [unspecified-high]
├── Task 20: API: Emergency access tables + endpoints (depends: 19) [deep]
├── Task 21: API: Travel mode endpoints (depends: 19) [unspecified-high]
├── Task 22: CLI: apps/cli package scaffold + core commands (depends: W2) [deep]

Wave 3B (After 3A — client surfaces, 4 parallel):
├── Task 23: Web: Emergency access UI (depends: 20) [visual-engineering]
├── Task 24: Web: Travel mode + passkey management UI (depends: 21) [visual-engineering]
├── Task 25: Extension: Passkey WebAuthn authenticator (depends: 19) [deep]
├── Task 26: Mobile: Emergency + travel + passkeys (depends: 20, 21) [deep]

Wave 4A (After Wave 3 — foundation, 3 parallel):
├── Task 27: Types + Crypto: Document, HW key, ECDH types (depends: W3) [unspecified-high]
├── Task 28: API: Document vault + HW key endpoints (depends: 27) [unspecified-high]
├── Task 29: Infra: Self-hosted relay (Cloudflare Tunnel) (depends: W3) [deep]

Wave 4B (After 4A — features, 3 parallel):
├── Task 30: Web: Document vault + HW key setup + QR sync (depends: 28) [visual-engineering]
├── Task 31: AI: Password rotation agent + site adapters (depends: W3) [deep]
├── Task 32: Extension: HW key WebUSB + QR sync (depends: 27) [deep]

Wave 4C (After 4B — mobile + integration, 2 parallel):
├── Task 33: Mobile: HW key FIDO2 + QR sync + document vault (depends: 28) [deep]
├── Task 34: Integration: Cross-feature E2E testing (depends: all) [deep]

Wave FINAL (After ALL tasks — independent review, 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Full QA re-run (unspecified-high + playwright)
└── Task F4: Scope fidelity check (deep)

Critical Path: T1→T2→T3→T6→T10→T13→T19→T20→T23→T27→T28→T30→F1-F4
Parallel Speedup: ~65% faster than sequential execution
Max Concurrent: 4 (Waves 1C, 2B, 3A, 3B)
```

### Task Dependency Graph

| Task  | Depends On | Blocks        | Wave  |
| ----- | ---------- | ------------- | ----- |
| T1    | None       | T2, T3, T6-T9 | 1A    |
| T2    | T1         | T3, T4, T5    | 1A    |
| T3    | T1, T2     | T6, T8, T9    | 1B    |
| T4    | T2         | T7, T9        | 1B    |
| T5    | T2         | T7            | 1B    |
| T6    | T3         | —             | 1C    |
| T7    | T4, T5     | —             | 1C    |
| T8    | T3         | —             | 1C    |
| T9    | T3, T4     | —             | 1C    |
| T10   | W1         | T13, T16, T17 | 2A    |
| T11   | W1         | T14, T18      | 2A    |
| T12   | W1         | T13-T16, T18  | 2A    |
| T13   | T10, T12   | —             | 2B    |
| T14   | T11, T12   | —             | 2B    |
| T15   | T12        | T18           | 2B    |
| T16   | T10, T12   | —             | 2B    |
| T17   | T10        | —             | 2C    |
| T18   | T11, T15   | —             | 2C    |
| T19   | W2         | T20, T21, T25 | 3A    |
| T20   | T19        | T23, T26      | 3A    |
| T21   | T19        | T24, T26      | 3A    |
| T22   | W2         | —             | 3A    |
| T23   | T20        | —             | 3B    |
| T24   | T21        | —             | 3B    |
| T25   | T19        | —             | 3B    |
| T26   | T20, T21   | —             | 3B    |
| T27   | W3         | T28, T30, T32 | 4A    |
| T28   | T27        | T30, T33      | 4A    |
| T29   | W3         | —             | 4A    |
| T30   | T28        | —             | 4B    |
| T31   | W3         | —             | 4B    |
| T32   | T27        | —             | 4B    |
| T33   | T28        | —             | 4C    |
| T34   | All        | —             | 4C    |
| F1-F4 | All        | —             | FINAL |

### Agent Dispatch Summary

| Wave  | Tasks | Agents                                                                                 |
| ----- | ----- | -------------------------------------------------------------------------------------- |
| 1A    | 2     | T1→`quick`, T2→`quick`                                                                 |
| 1B    | 3     | T3→`unspecified-high`, T4→`deep`, T5→`unspecified-high`                                |
| 1C    | 4     | T6→`visual-engineering`, T7→`visual-engineering`, T8→`deep`, T9→`deep`                 |
| 2A    | 3     | T10→`unspecified-high`, T11→`unspecified-high`, T12→`quick`                            |
| 2B    | 4     | T13→`visual-engineering`, T14→`visual-engineering`, T15→`unspecified-high`, T16→`deep` |
| 2C    | 2     | T17→`deep`, T18→`deep`                                                                 |
| 3A    | 4     | T19→`unspecified-high`, T20→`deep`, T21→`unspecified-high`, T22→`deep`                 |
| 3B    | 4     | T23→`visual-engineering`, T24→`visual-engineering`, T25→`deep`, T26→`deep`             |
| 4A    | 3     | T27→`unspecified-high`, T28→`unspecified-high`, T29→`deep`                             |
| 4B    | 3     | T30→`visual-engineering`, T31→`deep`, T32→`deep`                                       |
| 4C    | 2     | T33→`deep`, T34→`deep`                                                                 |
| FINAL | 4     | F1→`oracle`, F2→`unspecified-high`, F3→`unspecified-high`, F4→`deep`                   |

### Cross-Wave Dependencies

- Wave 2 T10 (File Attachments R2) → Wave 4 T28 (Document Vault reuses R2 infra)
- Wave 1 T4 (Account 2FA) → Wave 4 T28/T30 (HW keys extend auth chain)
- Wave 1 T1 (Identity type in `packages/types`) → All subsequent tasks reference these types
- Wave 2 T12 (Attachment types) → Wave 4 T27 (Document type extends attachment patterns)
- Wave 3 T19 (Passkey types) → Wave 3 T25 (Extension passkey WebAuthn)

### Risk Assessment

| Feature                    | Risk       | Reason                                                                              |
| -------------------------- | ---------- | ----------------------------------------------------------------------------------- |
| 12. Passkey Storage        | 🔴 HIGHEST | Deep WebAuthn browser API, navigator.credentials interceptor, conditional mediation |
| 15. AI Password Rotation   | 🔴 HIGHEST | Site-specific automation is inherently fragile, requires per-site adapters          |
| 18. Hardware Security Keys | 🟠 HIGH    | WebUSB/CTAP2 platform-specific, limited browser support                             |
| 19. Multi-Device QR Sync   | 🟠 HIGH    | Ephemeral ECDH over QR, 30s timeout, cross-platform camera                          |
| 6. File Attachments        | 🟡 MEDIUM  | R2 provisioning, file encryption, size limits, cross-platform upload                |
| 11. Emergency Access       | 🟡 MEDIUM  | Crypto complexity (pre-encrypt user key), timed release, email notifications        |
| 17. Self-Hosted Relay      | 🟡 MEDIUM  | Cloudflare Tunnel config, mDNS discovery, fallback routing                          |
| 4. Account 2FA             | 🟢 LOW     | Well-understood TOTP pattern, existing packages/totp                                |
| 1-3,5                      | 🟢 LOW     | Extend existing patterns directly                                                   |

---

## TODOs

### 🟥 Wave 1 — Table Stakes (Tasks 1-9)

- [ ] 1. Types Package: Identity Item Type + Custom Fields + 2FA Settings Types

  **What to do**:
  - Add `IdentityItem` interface to `packages/types/src/vault.ts` with fields: title, firstName, middleName, lastName, email, phone, address1, address2, city, state, postalCode, country, company, ssn?, passportNumber?, licenseNumber?
  - Extend `VaultItemType` union: `'login' | 'note' | 'card' | 'identity'`
  - Add `CustomField` type to vault.ts: `{ name: string, value: string, type: 'text' | 'hidden' | 'boolean' }`
  - Add `customFields?: CustomField[]` to the base `VaultItem` interface
  - Add `TotpTwoFactorSetup`, `TotpTwoFactorVerify`, `BackupCode` types to a new `packages/types/src/twofa.ts`
  - Add `isIdentityItem` type guard to `packages/types/src/guards.ts`
  - Update barrel export in `packages/types/src/index.ts`
  - Run `bun run typecheck` to verify all type references resolve

  **Must NOT do**:
  - Do NOT modify existing LoginItem/SecureNoteItem/CardItem interfaces (backward compat)
  - Do NOT add runtime validation — types only in this task

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure type definitions, no complex logic, <100 lines of changes
  - **Skills**: [] (none needed)
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: No UI work in this task
    - `playwright`: No browser testing needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with nothing — this is a foundation task)
  - **Parallel Group**: Wave 1A (with Task 2)
  - **Blocks**: T2, T3, T6, T7, T8, T9
  - **Blocked By**: None (can start immediately)

  **References**:
  **Pattern References**:
  - `packages/types/src/vault.ts:7` — Current `VaultItemType` union to extend
  - `packages/types/src/vault.ts:13-23` — `VaultItem` base interface pattern to add `customFields` to
  - `packages/types/src/vault.ts:29-35` — `LoginItem` pattern to follow for `IdentityItem`
  - `packages/types/src/guards.ts` — Existing type guards (`isLoginItem`, `isSecureNoteItem`, `isCardItem`) to follow pattern
  - `packages/types/src/index.ts` — Barrel export pattern to update
  **API/Type References**:
  - `packages/types/src/crypto.ts:10-15` — `KdfConfig` as example of typed config objects
  - `packages/types/src/team.ts:9-16` — `CustomPermissions` as example of granular option types
  **External References**:
  - Bitwarden identity type reference: first/last/address/ssn/passport/license fields

  **Acceptance Criteria**:
  - [ ] `bun run typecheck` passes with zero errors
  - [ ] `IdentityItem` interface exported from `@lockbox/types`
  - [ ] `VaultItemType` includes `'identity'`
  - [ ] `CustomField` type exported with 3 variants (text/hidden/boolean)
  - [ ] `isIdentityItem` guard exported and functional
  - [ ] 2FA types exported (TotpTwoFactorSetup, BackupCode)

  **QA Scenarios:**
  ```
  Scenario: Type compilation verification
    Tool: Bash
    Preconditions: packages/types has been updated
    Steps:
      1. Run `cd packages/types && npx tsc --noEmit`
      2. Run `bun run typecheck` from repo root
      3. Verify IdentityItem is importable: `echo 'import type { IdentityItem } from "./src/vault.js"' | npx tsx --eval`
    Expected Result: Zero type errors across entire monorepo
    Evidence: .sisyphus/evidence/task-1-typecheck.txt
  ```

  **Commit**: YES
  - Message: `feat(types): add identity, custom fields, and 2FA types`
  - Files: `packages/types/src/vault.ts`, `packages/types/src/twofa.ts`, `packages/types/src/guards.ts`, `packages/types/src/index.ts`
  - Pre-commit: `bun run typecheck`

- [ ] 2. API DB Migration: Identity Support, Custom Fields, 2FA Tables, Trash Purge

  **What to do**:
  - Create new Drizzle migration file `apps/api/drizzle/0002_feature_roadmap_wave1.sql`
  - Update `apps/api/src/db/schema.ts` with:
    - `vault_items.type` already accepts any string — no column change needed, but add comment documenting 'identity' as valid type
    - Note: `customFields` are INSIDE `encrypted_data` blob, no schema change needed — they're part of the encrypted payload
    - New table `user_totp_settings`: `user_id` (FK users, PK), `encrypted_totp_secret` (text), `enabled` (integer 0/1), `created_at`
    - New table `backup_codes`: `id` (PK), `user_id` (FK users), `code_hash` (text), `used` (integer 0/1), `created_at`
  - Run migration locally to verify SQL syntax
  - Update Drizzle config if needed

  **Must NOT do**:
  - Do NOT modify existing migration files (0000, 0001)
  - Do NOT add columns to vault_items for custom fields (they go in encrypted_data)
  - Do NOT store TOTP secret in plaintext — it must be encrypted with a derivative of auth hash

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Schema definition + SQL migration, straightforward Drizzle pattern
  - **Skills**: [] (none needed)
  - **Skills Evaluated but Omitted**:
    - `cloudflare-deploy`: Not deploying, just schema changes

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 1)
  - **Parallel Group**: Wave 1A (with Task 1)
  - **Blocks**: T3, T4, T5
  - **Blocked By**: T1 (needs type definitions for schema comments)

  **References**:
  **Pattern References**:
  - `apps/api/src/db/schema.ts:36-49` — `vaultItems` table definition pattern
  - `apps/api/src/db/schema.ts:4-14` — `users` table pattern (FK reference style)
  - `apps/api/src/db/schema.ts:54-59` — `userKeyPairs` table (single-column PK with FK)
  - `apps/api/drizzle/0000_eager_ricochet.sql` — Existing migration SQL format
  - `apps/api/drizzle/0001_dark_ultimo.sql` — Second migration pattern
  **API/Type References**:
  - `packages/types/src/twofa.ts` (from T1) — Types that map to these tables
  **External References**:
  - Drizzle ORM D1 docs: `https://orm.drizzle.team/docs/get-started-sqlite#cloudflare-d1`

  **Acceptance Criteria**:
  - [ ] Migration file exists at `apps/api/drizzle/0002_feature_roadmap_wave1.sql`
  - [ ] `user_totp_settings` table defined in schema.ts with proper FK
  - [ ] `backup_codes` table defined in schema.ts
  - [ ] `cd apps/api && npx vitest run` passes (existing tests unbroken)

  **QA Scenarios:**
  ```
  Scenario: Migration SQL validity
    Tool: Bash
    Preconditions: Migration file created
    Steps:
      1. Run `cd apps/api && npx drizzle-kit generate` to verify schema consistency
      2. Run `cd apps/api && npx vitest run` to ensure existing tests pass
      3. Verify schema.ts exports `userTotpSettings` and `backupCodes` tables
    Expected Result: drizzle-kit reports no pending changes, all tests pass
    Evidence: .sisyphus/evidence/task-2-migration.txt
  ```

  **Commit**: YES
  - Message: `feat(api): migration for identity, custom fields, 2FA tables`
  - Files: `apps/api/src/db/schema.ts`, `apps/api/drizzle/0002_*.sql`
  - Pre-commit: `cd apps/api && npx vitest run`

- [ ] 3. API Routes: Vault CRUD for Identity Type + Custom Fields Support

  **What to do**:
  - Update `apps/api/src/routes/vault.ts` POST `/items` to accept `type: 'identity'`
  - The vault route already stores any `type` string and `encryptedData` blob — verify identity items work through existing CRUD
  - Add type validation: accept 'login', 'note', 'card', 'identity' only (reject unknown types)
  - Custom fields need NO API changes — they're inside `encryptedData`
  - Add API tests for identity item CRUD in `apps/api/src/__tests__/`
  - Test: create identity item → retrieve → verify type='identity' and encrypted data round-trips

  **Must NOT do**:
  - Do NOT decrypt or inspect encrypted data server-side
  - Do NOT add identity-specific columns to vault_items (all data is in encrypted blob)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: API route modifications + validation + comprehensive test writing
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser work, API only

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 4, 5)
  - **Parallel Group**: Wave 1B
  - **Blocks**: T6, T8, T9
  - **Blocked By**: T1, T2

  **References**:
  **Pattern References**:
  - `apps/api/src/routes/vault.ts:49-75` — POST `/items` handler (current pattern for creating items)
  - `apps/api/src/routes/vault.ts:79-111` — PUT `/items/:id` handler (update pattern)
  - `apps/api/src/routes/vault.ts:23-45` — GET `/` handler with type filtering
  - `apps/api/src/routes/vault.ts:41` — Current type column: `type: text('type').notNull()`
  **Test References**:
  - `apps/api/src/__tests__/` — Existing test directory and patterns

  **Acceptance Criteria**:
  - [ ] POST `/api/vault/items` with `type: 'identity'` returns 201
  - [ ] GET `/api/vault?type=identity` returns only identity items
  - [ ] POST `/api/vault/items` with `type: 'unknown'` returns 400
  - [ ] `cd apps/api && npx vitest run` passes with new tests

  **QA Scenarios:**
  ```
  Scenario: Identity item CRUD via API
    Tool: Bash (curl)
    Preconditions: API running locally, authenticated session token available
    Steps:
      1. POST /api/vault/items with body: {"id": "test-id-1", "type": "identity", "encryptedData": "dGVzdA==", "revisionDate": "2026-01-01T00:00:00Z"} → expect 201
      2. GET /api/vault?type=identity → expect array containing item with id "test-id-1"
      3. PUT /api/vault/items/test-id-1 with updated encryptedData → expect 200
      4. DELETE /api/vault/items/test-id-1 → expect 200 (soft delete)
    Expected Result: Full CRUD cycle completes, type filtering works
    Evidence: .sisyphus/evidence/task-3-identity-crud.txt

  Scenario: Reject invalid type
    Tool: Bash (curl)
    Steps:
      1. POST /api/vault/items with body: {"type": "invalid", "encryptedData": "dGVzdA=="} → expect 400
    Expected Result: 400 status with error message
    Evidence: .sisyphus/evidence/task-3-invalid-type.txt
  ```

  **Commit**: YES
  - Message: `feat(api): vault routes for identity type and custom fields`
  - Files: `apps/api/src/routes/vault.ts`, `apps/api/src/__tests__/vault.test.ts`
  - Pre-commit: `cd apps/api && npx vitest run`

---

- [ ] 4. API Routes: Account TOTP 2FA (Setup, Verify, Login Challenge, Backup Codes)

  **What to do**:
  - Create new route file `apps/api/src/routes/twofa.ts` with Hono router
  - POST `/api/auth/2fa/setup` (authed): Generate random TOTP secret (32 bytes), encrypt with HKDF derivative of user's stored auth hash, store in `user_totp_settings`, return base32-encoded secret + QR code data (otpauth:// URI)
  - POST `/api/auth/2fa/verify` (authed): Accept TOTP code, verify against stored encrypted secret, if valid set `enabled=1`, generate 8 backup codes (bcrypt-hashed), store in `backup_codes` table, return backup code strings
  - POST `/api/auth/2fa/disable` (authed): Accept current TOTP code for confirmation, delete settings + backup codes
  - Modify `apps/api/src/routes/auth.ts` POST `/login`: After successful auth hash check, if user has 2FA enabled, return `{ requires2FA: true, tempToken: ... }` instead of full session
  - POST `/api/auth/2fa/validate` (with temp token): Accept TOTP code OR backup code, verify, return full session token
  - Backup code validation: bcrypt-compare against unused codes, mark used on success
  - Wire new routes in `apps/api/src/index.ts`
  - Add comprehensive tests

  **Must NOT do**:
  - Do NOT store TOTP secret in plaintext
  - Do NOT send the TOTP secret back to client after initial setup (only during setup response)
  - Do NOT allow login bypass without valid 2FA code when enabled
  - Do NOT allow backup code reuse

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex auth flow modification, crypto operations, multiple endpoints with security implications
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser work
    - `git-master`: Not a git operation

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 3, 5)
  - **Parallel Group**: Wave 1B
  - **Blocks**: T7, T9
  - **Blocked By**: T2 (needs 2FA tables)

  **References**:
  **Pattern References**:
  - `apps/api/src/routes/auth.ts:159-209` — Current login flow to modify (add 2FA challenge step)
  - `apps/api/src/routes/auth.ts:33-56` — `hashAuthHash` pattern for server-side hashing
  - `apps/api/src/routes/auth.ts:253-299` — Change-password flow as example of auth-sensitive endpoint
  - `apps/api/src/middleware/auth.ts` — Auth middleware pattern for temp token handling
  **API/Type References**:
  - `packages/types/src/twofa.ts` (from T1) — Request/response types for 2FA endpoints
  - `packages/totp/` — Existing TOTP generation library (use for server-side verification)
  **External References**:
  - RFC 6238 (TOTP) — 30-second window, SHA-1 default
  - `packages/totp/src/` — Already implements TOTP generation, reuse for verification

  **Acceptance Criteria**:
  - [ ] POST `/api/auth/2fa/setup` returns otpauth:// URI with encrypted secret stored
  - [ ] POST `/api/auth/2fa/verify` with valid code enables 2FA and returns 8 backup codes
  - [ ] POST `/login` for 2FA-enabled user returns `{ requires2FA: true, tempToken: ... }`
  - [ ] POST `/api/auth/2fa/validate` with valid TOTP code returns full session
  - [ ] POST `/api/auth/2fa/validate` with valid backup code returns full session and marks code used
  - [ ] Backup code reuse returns 401
  - [ ] `cd apps/api && npx vitest run` passes

  **QA Scenarios:**
  ```
  Scenario: Full 2FA setup and login flow
    Tool: Bash (curl)
    Preconditions: Registered user without 2FA
    Steps:
      1. POST /api/auth/2fa/setup with auth header → expect 200 with {secret, otpauthUri}
      2. Generate TOTP code from secret using packages/totp
      3. POST /api/auth/2fa/verify with code → expect 200 with {enabled: true, backupCodes: [8 strings]}
      4. POST /api/auth/logout
      5. POST /api/auth/login with credentials → expect 200 with {requires2FA: true, tempToken: "..."}
      6. POST /api/auth/2fa/validate with tempToken + TOTP code → expect 200 with {token: "...", user: {...}}
    Expected Result: Complete 2FA lifecycle works end-to-end
    Evidence: .sisyphus/evidence/task-4-2fa-flow.txt

  Scenario: Backup code usage
    Tool: Bash (curl)
    Steps:
      1. Login to trigger 2FA challenge
      2. POST /api/auth/2fa/validate with backupCodes[0] → expect 200
      3. Logout, login again
      4. POST /api/auth/2fa/validate with same backupCodes[0] → expect 401 (already used)
    Expected Result: Backup codes are single-use
    Evidence: .sisyphus/evidence/task-4-backup-codes.txt
  ```

  **Commit**: YES
  - Message: `feat(api): account TOTP 2FA setup, verify, and login challenge`
  - Files: `apps/api/src/routes/twofa.ts`, `apps/api/src/routes/auth.ts`, `apps/api/src/index.ts`, `apps/api/src/__tests__/twofa.test.ts`
  - Pre-commit: `cd apps/api && npx vitest run`

- [ ] 5. API: Trash Auto-Purge Scheduled Worker + Trash Query Endpoint

  **What to do**:
  - Add GET `/api/vault/trash` endpoint to `apps/api/src/routes/vault.ts`: returns soft-deleted items with `deletedAt` and computed `daysRemaining` (30 - days since deletion)
  - Add scheduled handler to `apps/api/src/index.ts`: Cloudflare Workers `scheduled` event that runs daily
  - Scheduled handler: `DELETE FROM vault_items WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', '-30 days')`
  - Add `[triggers]` section to `apps/api/wrangler.toml`: `crons = ["0 2 * * *"]` (daily at 2 AM UTC)
  - Add tests for trash query endpoint and purge logic

  **Must NOT do**:
  - Do NOT permanently delete items before 30 days
  - Do NOT modify the existing soft-delete mechanism
  - Do NOT purge items that have been restored (deletedAt = null)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Scheduled worker setup + API endpoint + wrangler config changes
  - **Skills**: [`cloudflare-deploy`]
    - `cloudflare-deploy`: Cloudflare Workers scheduled triggers and wrangler.toml configuration
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser work

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 3, 4)
  - **Parallel Group**: Wave 1B
  - **Blocks**: T7
  - **Blocked By**: T2 (needs schema available)

  **References**:
  **Pattern References**:
  - `apps/api/src/routes/vault.ts:113-134` — Soft delete handler (sets `deletedAt`)
  - `apps/api/src/routes/vault.ts:136-158` — Restore handler (clears `deletedAt`)
  - `apps/api/src/routes/vault.ts:160-179` — Permanent delete handler (reference for purge query)
  - `apps/api/src/index.ts` — App entry point to add scheduled export
  - `apps/api/wrangler.toml` — Current config (needs `[triggers]` section added)
  **External References**:
  - Cloudflare Workers scheduled events: `export default { scheduled(event, env, ctx) {} }`

  **Acceptance Criteria**:
  - [ ] GET `/api/vault/trash` returns soft-deleted items with `daysRemaining` field
  - [ ] Scheduled handler deletes items older than 30 days
  - [ ] `wrangler.toml` has `[triggers]` cron config
  - [ ] `cd apps/api && npx vitest run` passes

  **QA Scenarios:**
  ```
  Scenario: Trash listing with days remaining
    Tool: Bash (curl)
    Preconditions: User has soft-deleted items
    Steps:
      1. Create an item via POST /api/vault/items
      2. DELETE /api/vault/items/:id (soft delete)
      3. GET /api/vault/trash → expect array with item, `daysRemaining` ≈ 30
    Expected Result: Trash endpoint returns deleted items with countdown
    Evidence: .sisyphus/evidence/task-5-trash-list.txt

  Scenario: Auto-purge logic (unit test)
    Tool: Bash
    Steps:
      1. Insert a vault_item with deleted_at = 31 days ago (direct DB)
      2. Insert a vault_item with deleted_at = 29 days ago
      3. Run the purge function
      4. Query DB: 31-day item should be gone, 29-day item should remain
    Expected Result: Only items older than 30 days are permanently deleted
    Evidence: .sisyphus/evidence/task-5-purge-logic.txt
  ```

  **Commit**: YES
  - Message: `feat(api): trash auto-purge scheduled worker`
  - Files: `apps/api/src/routes/vault.ts`, `apps/api/src/index.ts`, `apps/api/wrangler.toml`, `apps/api/src/__tests__/trash.test.ts`
  - Pre-commit: `cd apps/api && npx vitest run`

- [ ] 6. Web: Identity Item Type + Custom Fields Editor in ItemPanel

  **What to do**:
  - Update `apps/web/src/components/ItemPanel.tsx`:
    - Add `'identity'` to the type selector (line 379: the tab buttons)
    - Add identity form state: `firstName`, `lastName`, `middleName`, `email`, `phone`, `address1`, `address2`, `city`, `state`, `postalCode`, `country`, `company`, `ssn`, `passportNumber`, `licenseNumber`
    - Add identity view mode: display all identity fields in a structured card layout
    - Add identity edit mode: form inputs for all identity fields, group into sections (Personal, Address, IDs)
    - Add Custom Fields section (ALL item types): dynamic array of {name, value, type} with add/remove buttons
    - Custom field type='hidden' renders as password input with toggle visibility
    - Custom field type='boolean' renders as checkbox
    - Include custom fields in the vault item construction before encryption
  - Update `apps/web/src/pages/Vault.tsx`: Show identity items in the list with appropriate icon
  - Update `apps/web/src/store/vault.ts` if needed for identity type filtering
  - Add `typeIcon` for identity: 📛 or similar
  - All new UI must have full dark mode support

  **Must NOT do**:
  - Do NOT refactor ItemPanel into smaller components (keep existing pattern)
  - Do NOT change existing login/note/card rendering
  - Do NOT modify encryption logic (use existing `encryptVaultItem`)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Significant UI/UX work with form layout, section organization, and responsive design
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Identity form has many fields needing clear visual hierarchy
  - **Skills Evaluated but Omitted**:
    - `playwright`: QA will use playwright but skill not needed for implementation

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 7, 8, 9)
  - **Parallel Group**: Wave 1C
  - **Blocks**: None
  - **Blocked By**: T3 (needs API to accept identity type)

  **References**:
  **Pattern References**:
  - `apps/web/src/components/ItemPanel.tsx:379-393` — Type selector tabs (add 'identity')
  - `apps/web/src/components/ItemPanel.tsx:230-256` — Vault item construction per type (add identity case)
  - `apps/web/src/components/ItemPanel.tsx:483-568` — Login edit fields pattern (replicate for identity)
  - `apps/web/src/components/ItemPanel.tsx:686-771` — Login view fields pattern (replicate for identity)
  - `apps/web/src/components/ItemPanel.tsx:311` — `typeIcon` function to extend
  **API/Type References**:
  - `packages/types/src/vault.ts:IdentityItem` (from T1) — Interface defining all identity fields
  - `packages/types/src/vault.ts:CustomField` (from T1) — Custom field type definition
  **External References**:
  - Bitwarden identity form layout for UX reference

  **Acceptance Criteria**:
  - [ ] Identity items can be created, viewed, and edited in web vault
  - [ ] All identity fields (name, address, phone, IDs) render correctly
  - [ ] Custom fields can be added/removed on any item type
  - [ ] Hidden custom fields are masked with toggle
  - [ ] Boolean custom fields render as checkboxes
  - [ ] Dark mode fully supported on all new UI
  - [ ] `cd apps/web && npx vitest run` passes

  **QA Scenarios:**
  ```
  Scenario: Create and view identity item
    Tool: Playwright
    Preconditions: Logged into web vault
    Steps:
      1. Click "+" button to add new item
      2. Select "Identity" tab in type selector
      3. Fill in: Name="My ID", firstName="John", lastName="Doe", email="john@test.com", phone="555-1234", city="Portland", state="OR", postalCode="97201"
      4. Click "Save"
      5. Click on the created item in the vault list
      6. Verify all fields display correctly in view mode
    Expected Result: Identity item created and all fields visible
    Evidence: .sisyphus/evidence/task-6-identity-create.png

  Scenario: Custom fields on login item
    Tool: Playwright
    Steps:
      1. Edit an existing login item
      2. Scroll to Custom Fields section
      3. Click "+ Add Custom Field"
      4. Set name="Security Question", value="My dog's name", type="text"
      5. Add another: name="Recovery Email", value="backup@test.com", type="hidden"
      6. Add another: name="Premium", type="boolean", checked=true
      7. Save the item
      8. View the item: verify text field shows value, hidden field is masked, boolean shows checkbox
    Expected Result: All 3 custom field types render correctly
    Evidence: .sisyphus/evidence/task-6-custom-fields.png
  ```

  **Commit**: YES
  - Message: `feat(web): identity item type and custom fields in ItemPanel`
  - Files: `apps/web/src/components/ItemPanel.tsx`, `apps/web/src/pages/Vault.tsx`
  - Pre-commit: `cd apps/web && npx vitest run`

- [ ] 7. Web: Trash View + Account 2FA Setup Flow

  **What to do**:
  - Create `apps/web/src/pages/Trash.tsx`: List soft-deleted items with days remaining until auto-purge, restore button, permanent delete button
  - Add Trash nav link to `apps/web/src/components/AppLayout.tsx`
  - Add route in `apps/web/src/App.tsx`
  - Create 2FA settings section in `apps/web/src/pages/Settings.tsx` (or new `apps/web/src/pages/TwoFactor.tsx`)
  - 2FA Setup Flow:
    1. Click "Enable 2FA" button
    2. Call POST `/api/auth/2fa/setup` → get `otpauthUri`
    3. Display QR code (use `qrcode` npm package to render otpauth:// URI as SVG)
    4. Show manual entry key (base32 secret) below QR
    5. Input field for verification code
    6. Call POST `/api/auth/2fa/verify` with code → receive backup codes
    7. Display backup codes with "Copy All" and "Download" buttons
    8. Show confirmation: "2FA is now enabled"
  - 2FA Login Prompt:
    - Modify `apps/web/src/pages/Login.tsx`: When login returns `{ requires2FA: true, tempToken }`, show TOTP input
    - On submit: POST `/api/auth/2fa/validate` with code + tempToken
    - Also support entering a backup code instead
  - Add loading/error states, full dark mode

  **Must NOT do**:
  - Do NOT auto-purge client-side (server handles purge)
  - Do NOT store 2FA secret in localStorage/sessionStorage
  - Do NOT skip backup code display step

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Multiple new pages with complex interactive flows (QR code, backup codes display)
  - **Skills**: [`frontend-ui-ux`, `playwright`]
    - `frontend-ui-ux`: Trash view + 2FA setup flow need polished UX
    - `playwright`: QA scenarios require browser automation
  - **Skills Evaluated but Omitted**:
    - `cloudflare-deploy`: No deployment

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 6, 8, 9)
  - **Parallel Group**: Wave 1C
  - **Blocks**: None
  - **Blocked By**: T4 (2FA API), T5 (trash API)

  **References**:
  **Pattern References**:
  - `apps/web/src/pages/Settings.tsx` — Existing settings page to add 2FA section
  - `apps/web/src/pages/Login.tsx` — Current login flow to modify for 2FA challenge
  - `apps/web/src/pages/Vault.tsx` — Page layout and item listing pattern for Trash
  - `apps/web/src/components/AppLayout.tsx` — Navigation layout to add Trash link
  - `apps/web/src/App.tsx` — Router to add Trash route
  **API/Type References**:
  - `apps/api/src/routes/twofa.ts` (from T4) — 2FA endpoint contracts
  - `packages/totp` — TOTP generation for QR code otpauth:// URIs
  **External References**:
  - `qrcode` npm package for QR code SVG rendering

  **Acceptance Criteria**:
  - [ ] Trash page lists soft-deleted items with days remaining countdown
  - [ ] Restore button moves item back to vault
  - [ ] Permanent delete button removes item (with confirmation)
  - [ ] 2FA setup flow shows QR code and manual key
  - [ ] Backup codes displayed after verification with copy/download
  - [ ] Login page shows 2FA prompt when `requires2FA` is true
  - [ ] Login with 2FA code succeeds
  - [ ] Dark mode fully supported
  - [ ] `cd apps/web && npx vitest run` passes

  **QA Scenarios:**
  ```
  Scenario: Trash view with restore
    Tool: Playwright
    Preconditions: User has deleted items in vault
    Steps:
      1. Navigate to /trash
      2. Verify deleted items listed with "X days remaining" badge
      3. Click "Restore" on first item
      4. Navigate to /vault → verify item appears in vault list
    Expected Result: Item restored from trash to active vault
    Evidence: .sisyphus/evidence/task-7-trash-restore.png

  Scenario: 2FA setup complete flow
    Tool: Playwright
    Preconditions: Logged in, 2FA not enabled
    Steps:
      1. Navigate to Settings
      2. Click "Enable Two-Factor Authentication"
      3. Verify QR code SVG rendered on page
      4. Verify manual key displayed below QR code
      5. Enter valid TOTP code in verification input
      6. Click "Verify"
      7. Verify 8 backup codes displayed
      8. Click "Copy All" → verify clipboard contains codes
    Expected Result: 2FA enabled with backup codes shown
    Evidence: .sisyphus/evidence/task-7-2fa-setup.png
  ```

  **Commit**: YES
  - Message: `feat(web): trash view and account 2FA setup flow`
  - Files: `apps/web/src/pages/Trash.tsx`, `apps/web/src/pages/Settings.tsx`, `apps/web/src/pages/Login.tsx`, `apps/web/src/components/AppLayout.tsx`, `apps/web/src/App.tsx`
  - Pre-commit: `cd apps/web && npx vitest run`

- [ ] 8. Extension: Identity Field Autofill + Save-on-Submit Detection

  **What to do**:
  - Update `apps/extension/lib/form-detector.ts`:
    - Add identity field detection: `detectFieldType` expanded to recognize 'name', 'first-name', 'last-name', 'phone', 'address', 'city', 'state', 'zip', 'postal', 'country', 'company' via autocomplete attributes and name/id/placeholder heuristics
    - New `DetectedIdentityForm` interface: fields for each identity field type detected on the page
    - `detectIdentityForms(document)` function that finds forms with identity-type fields
  - Update `apps/extension/lib/autofill.ts`:
    - New `fillIdentityForm(form, identityItem)` function using `simulateFill` pattern
    - Extend `createSuggestionDropdown` to show identity items when identity fields detected
  - Update `apps/extension/entrypoints/content.ts`:
    - `injectOverlays` now also detects identity forms and shows lock icon
    - `handleAutofill` checks for both login AND identity matches based on form type
  - **Save-on-Submit Detection** (NEW):
    - Add `apps/extension/lib/save-detector.ts`: Monitor form submissions (submit event, XHR/fetch interception)
    - When credentials submitted: compare username+password against vault items via background script
    - If NO match: inject banner "Save this login to Lockbox?" with Save/Dismiss buttons (Shadow DOM)
    - If match but password differs: inject banner "Update password for [site]?" with Update/Dismiss
    - Save/Update buttons call background script to create/update vault item
  - Update `apps/extension/entrypoints/background.ts`:
    - New message handler: `save-credentials` → create vault item
    - New message handler: `update-credentials` → update existing vault item
    - New message handler: `check-credentials` → compare against vault
  - Add tests for form detection, autofill, and save detection logic

  **Must NOT do**:
  - Do NOT persist credentials before user confirms save
  - Do NOT auto-submit forms
  - Do NOT block page navigation while banner is shown
  - Do NOT create duplicate vault items (check for existing match)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex content script logic, DOM manipulation, form submission interception, multi-file coordination
  - **Skills**: [`playwright`]
    - `playwright`: Testing content script behavior requires browser automation
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Shadow DOM banners are simple, not complex UI

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 6, 7, 9)
  - **Parallel Group**: Wave 1C
  - **Blocks**: None
  - **Blocked By**: T3 (needs identity type accepted by API)

  **References**:
  **Pattern References**:
  - `apps/extension/lib/form-detector.ts:14-36` — `detectFieldType` function to extend with identity fields
  - `apps/extension/lib/form-detector.ts:6-11` — `DetectedForm` interface pattern
  - `apps/extension/lib/autofill.ts:13-36` — `simulateFill` SPA-compatible event sequence
  - `apps/extension/lib/autofill.ts:41-46` — `fillForm` pattern to replicate for identity
  - `apps/extension/lib/autofill.ts:52-66` — Shadow DOM overlay pattern (reuse for save banner)
  - `apps/extension/entrypoints/content.ts:31-68` — `handleAutofill` pattern
  - `apps/extension/entrypoints/content.ts:71-84` — `injectOverlays` pattern to extend
  - `apps/extension/entrypoints/content.ts:87-100` — Phishing warning banner injection (Shadow DOM pattern for save banner)
  **API/Type References**:
  - `packages/types/src/vault.ts:IdentityItem` (from T1) — Identity item fields for autofill mapping

  **Acceptance Criteria**:
  - [ ] Extension detects identity form fields (name, address, phone) on web pages
  - [ ] Lock icon appears on identity form fields
  - [ ] Clicking lock icon offers identity items for autofill
  - [ ] Identity autofill fills all detected fields (name, address, phone, etc.)
  - [ ] Form submission with new credentials shows "Save" banner
  - [ ] Form submission with changed password shows "Update" banner
  - [ ] Save/Update from banner creates/updates vault item
  - [ ] `cd apps/extension && npx vitest run` passes

  **QA Scenarios:**
  ```
  Scenario: Save-on-submit for new credentials
    Tool: Playwright + extension loaded
    Preconditions: Extension installed, vault has no matching items for test site
    Steps:
      1. Navigate to a test login page
      2. Fill username="testuser@example.com" and password="TestPass123!"
      3. Submit the form
      4. Verify a save banner appears at top of page: "Save this login to Lockbox?"
      5. Click "Save"
      6. Verify vault now contains item with matching username
    Expected Result: New credential saved to vault after user confirms
    Evidence: .sisyphus/evidence/task-8-save-on-submit.png

  Scenario: Identity field autofill
    Tool: Playwright + extension loaded
    Steps:
      1. Navigate to a page with name/address/phone fields
      2. Click lock icon on a name field
      3. Select identity item from dropdown
      4. Verify firstName, lastName, email, phone, address fields all filled
    Expected Result: All detected identity fields filled correctly
    Evidence: .sisyphus/evidence/task-8-identity-autofill.png
  ```

  **Commit**: YES
  - Message: `feat(ext): identity autofill and save-on-submit detection`
  - Files: `apps/extension/lib/form-detector.ts`, `apps/extension/lib/autofill.ts`, `apps/extension/lib/save-detector.ts`, `apps/extension/entrypoints/content.ts`, `apps/extension/entrypoints/background.ts`
  - Pre-commit: `cd apps/extension && npx vitest run`

- [ ] 9. Mobile: Identity Items + Custom Fields + 2FA Login Prompt

  **What to do**:
  - Update mobile vault item rendering to handle `type: 'identity'` in list view and detail view
  - Add identity item form for create/edit in mobile UI
  - Add custom fields section to item detail/edit screens (same UX as web: add/remove, text/hidden/boolean types)
  - Modify mobile login flow:
    - When login API returns `{ requires2FA: true, tempToken }`, show TOTP code input screen
    - Support entering backup code via text link "Use backup code instead"
    - Call POST `/api/auth/2fa/validate` with code + tempToken
  - Add 2FA setup flow accessible from mobile Settings:
    - Display QR code (otpauth:// URI rendered as QR)
    - Verification code input
    - Backup codes display with copy/share
  - Update mobile Trash view (if not already present): show deleted items with days remaining
  - Add tests for new mobile screens/logic

  **Must NOT do**:
  - Do NOT store 2FA secrets in SharedPreferences
  - Do NOT skip backup codes display
  - Do NOT break existing biometric unlock flow

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Mobile platform with Capacitor + Kotlin plugins, multi-screen modifications, auth flow changes
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: Mobile testing doesn't use Playwright
    - `frontend-ui-ux`: Mobile uses Capacitor/native patterns, not web UI

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 6, 7, 8)
  - **Parallel Group**: Wave 1C
  - **Blocks**: None
  - **Blocked By**: T3 (identity API), T4 (2FA API)

  **References**:
  **Pattern References**:
  - `apps/mobile/src/` — Mobile app entry point and structure
  - `apps/mobile/src/plugins/biometric.ts` — Kotlin plugin pattern for native functionality
  - `apps/mobile/src/plugins/autofill.ts` — Autofill service integration pattern
  - `apps/mobile/src/offline/sync-queue.ts` — Offline sync queue (identity items need to sync)
  **API/Type References**:
  - `packages/types/src/vault.ts:IdentityItem` (from T1) — Identity fields
  - `packages/types/src/vault.ts:CustomField` (from T1) — Custom field structure
  - `apps/api/src/routes/twofa.ts` (from T4) — 2FA API contracts

  **Acceptance Criteria**:
  - [ ] Identity items display in mobile vault list with icon
  - [ ] Identity detail screen shows all fields
  - [ ] Custom fields can be added/edited on any item type
  - [ ] Login shows 2FA code input when required
  - [ ] Backup code entry works as alternative
  - [ ] 2FA setup accessible from Settings
  - [ ] Trash view shows deleted items with countdown
  - [ ] `cd apps/mobile && npx vitest run` passes

  **QA Scenarios:**
  ```
  Scenario: 2FA login on mobile
    Tool: tmux (Capacitor build verification)
    Preconditions: User has 2FA enabled, app built
    Steps:
      1. Build: cd apps/mobile && npx cap build android
      2. Verify build succeeds without errors
      3. Run vitest: cd apps/mobile && npx vitest run
      4. Verify 2FA-related tests pass
    Expected Result: Build succeeds, all tests pass including 2FA flow
    Evidence: .sisyphus/evidence/task-9-mobile-2fa.txt
  ```

  **Commit**: YES
  - Message: `feat(mobile): identity items, custom fields, and 2FA login`
  - Files: `apps/mobile/src/**/*.ts`, `apps/mobile/src/**/*.tsx`
  - Pre-commit: `cd apps/mobile && npx vitest run`


### 🟧 Wave 2 — Competitive Differentiators (Tasks 10-18)

- [ ] 10. API + R2: File Attachment Endpoints + R2 Bucket Setup

  **What to do**:
  - Add R2 bucket binding to `apps/api/wrangler.toml`: `[[r2_buckets]] binding = "ATTACHMENTS" bucket_name = "lockbox-attachments"`
  - Create `apps/api/src/routes/attachments.ts` with Hono router:
    - POST `/api/vault/items/:itemId/attachments`: Accept multipart file upload, validate size (<10MB per file), store encrypted blob in R2 with key `{userId}/{itemId}/{attachmentId}`, store metadata in new `attachments` table
    - GET `/api/vault/items/:itemId/attachments`: List attachment metadata for an item
    - GET `/api/vault/items/:itemId/attachments/:attachmentId`: Stream encrypted blob from R2
    - DELETE `/api/vault/items/:itemId/attachments/:attachmentId`: Delete from R2 + DB
  - Add DB migration for `attachments` table: `id` (PK), `item_id` (FK vault_items), `user_id` (FK users), `encrypted_name` (text), `encrypted_mime_type` (text), `size` (integer), `created_at`
  - Add user quota check: total attachment size per user < 100MB
  - Update schema.ts with `attachments` table
  - File data is encrypted CLIENT-SIDE before upload — server stores opaque blob
  - Wire routes in `apps/api/src/index.ts`
  - Add tests

  **Must NOT do**:
  - Do NOT decrypt file content server-side
  - Do NOT store unencrypted files in R2
  - Do NOT allow files > 10MB
  - Do NOT exceed 100MB quota per user

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: R2 integration, multipart upload handling, quota management
  - **Skills**: [`cloudflare-deploy`]
    - `cloudflare-deploy`: R2 bucket provisioning and wrangler.toml configuration
  - **Skills Evaluated but Omitted**:
    - `playwright`: API-only task

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 11, 12)
  - **Parallel Group**: Wave 2A
  - **Blocks**: T13, T16, T17
  - **Blocked By**: Wave 1 complete

  **References**:
  **Pattern References**:
  - `apps/api/src/routes/vault.ts:49-75` — Item creation pattern (ownership enforcement)
  - `apps/api/src/db/schema.ts:36-49` — `vaultItems` table (FK pattern for attachments)
  - `apps/api/wrangler.toml:9-13` — D1 binding pattern (follow for R2 binding)
  **External References**:
  - Cloudflare R2 Workers API: `env.ATTACHMENTS.put(key, body)`, `env.ATTACHMENTS.get(key)`, `env.ATTACHMENTS.delete(key)`
  - Hono multipart: `c.req.parseBody()` for file uploads

  **Acceptance Criteria**:
  - [ ] R2 bucket configured in wrangler.toml
  - [ ] POST upload stores encrypted blob in R2 and metadata in DB
  - [ ] GET download streams encrypted blob from R2
  - [ ] File size limit enforced (>10MB rejected with 413)
  - [ ] User quota enforced (>100MB rejected with 413)
  - [ ] DELETE removes from both R2 and DB
  - [ ] `cd apps/api && npx vitest run` passes

  **QA Scenarios:**
  ```
  Scenario: File upload and download cycle
    Tool: Bash (curl)
    Steps:
      1. POST /api/vault/items/:id/attachments with multipart file (test.bin, 1KB) → expect 201 with {id, size}
      2. GET /api/vault/items/:id/attachments → expect array with 1 attachment
      3. GET /api/vault/items/:id/attachments/:attachId → expect binary blob matching upload
      4. DELETE /api/vault/items/:id/attachments/:attachId → expect 200
      5. GET /api/vault/items/:id/attachments → expect empty array
    Expected Result: Full CRUD lifecycle for attachments
    Evidence: .sisyphus/evidence/task-10-attachments.txt

  Scenario: Size limit enforcement
    Tool: Bash (curl)
    Steps:
      1. POST with 11MB file → expect 413
    Expected Result: Oversized file rejected
    Evidence: .sisyphus/evidence/task-10-size-limit.txt
  ```

  **Commit**: YES
  - Message: `feat(api): R2 file attachment endpoints`
  - Files: `apps/api/src/routes/attachments.ts`, `apps/api/src/db/schema.ts`, `apps/api/wrangler.toml`, `apps/api/src/index.ts`, `apps/api/drizzle/0003_*.sql`
  - Pre-commit: `cd apps/api && npx vitest run`

- [ ] 11. API: Version History Table + Endpoints

  **What to do**:
  - Add `vault_item_versions` table to schema.ts: `id` (PK), `item_id` (FK vault_items), `user_id` (FK users), `encrypted_data` (text), `revision_date` (text), `created_at` (text)
  - Create migration for the new table
  - Modify PUT `/api/vault/items/:id` in `apps/api/src/routes/vault.ts`: Before updating, copy current `encrypted_data` + `revision_date` into `vault_item_versions`
  - Enforce max 10 versions per item: after insert, delete oldest if count > 10
  - Add GET `/api/vault/items/:id/versions` endpoint: Return version list (id, revision_date, created_at) for an item
  - Add GET `/api/vault/items/:id/versions/:versionId` endpoint: Return full encrypted_data for a specific version
  - Add POST `/api/vault/items/:id/versions/:versionId/restore` endpoint: Copy version's encrypted_data back to item (creates new version first)
  - Add tests

  **Must NOT do**:
  - Do NOT store more than 10 versions per item
  - Do NOT delete version history on item soft-delete (preserve for restore)
  - Do NOT decrypt version data server-side

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: DB migration + route modification + new endpoints
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `cloudflare-deploy`: No deployment needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 10, 12)
  - **Parallel Group**: Wave 2A
  - **Blocks**: T14, T18
  - **Blocked By**: Wave 1 complete

  **References**:
  **Pattern References**:
  - `apps/api/src/routes/vault.ts:79-111` — PUT handler to modify (add version capture before update)
  - `apps/api/src/db/schema.ts:36-49` — `vaultItems` table (reference for version table schema)
  **External References**:
  - Drizzle ORM subqueries for "delete oldest if count > 10" pattern

  **Acceptance Criteria**:
  - [ ] Version table exists in schema.ts
  - [ ] PUT /items/:id creates version entry before updating
  - [ ] GET /items/:id/versions returns version list
  - [ ] Max 10 versions enforced
  - [ ] Restore creates new current version (not destructive)
  - [ ] `cd apps/api && npx vitest run` passes

  **QA Scenarios:**
  ```
  Scenario: Version creation on update
    Tool: Bash (curl)
    Steps:
      1. Create item via POST
      2. Update item 3 times via PUT (different encryptedData each time)
      3. GET /api/vault/items/:id/versions → expect 3 versions
      4. Verify versions have correct revision_dates in descending order
    Expected Result: Each update creates a version snapshot
    Evidence: .sisyphus/evidence/task-11-versions.txt
  ```

  **Commit**: YES
  - Message: `feat(api): version history table and endpoints`
  - Files: `apps/api/src/routes/vault.ts`, `apps/api/src/db/schema.ts`, `apps/api/drizzle/0003_*.sql`
  - Pre-commit: `cd apps/api && npx vitest run`

- [ ] 12. Types: Attachment, Version, 2FA-Directory, and Email Alias Types

  **What to do**:
  - Add to `packages/types/src/vault.ts`: `Attachment` interface (id, itemId, encryptedName, encryptedMimeType, size, createdAt)
  - Add `VaultItemVersion` interface (id, itemId, encryptedData, revisionDate, createdAt)
  - Add `packages/types/src/integrations.ts`: `TwoFaDirectoryEntry` (domain, methods[], documentation_url), `EmailAliasProvider` ('simplelogin' | 'anonaddy'), `EmailAliasConfig` (provider, apiKey, baseUrl?), `EmailAlias` (id, email, forwardTo, createdAt)
  - Update barrel export in index.ts
  - Run typecheck

  **Must NOT do**:
  - Do NOT add runtime logic — types only

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure type definitions
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 10, 11)
  - **Parallel Group**: Wave 2A
  - **Blocks**: T13, T14, T15, T16, T18
  - **Blocked By**: Wave 1 complete

  **References**:
  **Pattern References**:
  - `packages/types/src/vault.ts` — Existing type patterns
  - `packages/types/src/sharing.ts` — Integration type pattern
  - `packages/types/src/index.ts` — Barrel export
  **External References**:
  - 2fa.directory API response shape: `https://2fa.directory/api/v3/tfa.json`
  - SimpleLogin API: `https://app.simplelogin.io/api/`

  **Acceptance Criteria**:
  - [ ] `Attachment`, `VaultItemVersion`, `TwoFaDirectoryEntry`, `EmailAlias` types exported
  - [ ] `bun run typecheck` passes

  **QA Scenarios:**
  ```
  Scenario: Type compilation
    Tool: Bash
    Steps:
      1. Run `bun run typecheck`
    Expected Result: Zero errors
    Evidence: .sisyphus/evidence/task-12-typecheck.txt
  ```

  **Commit**: YES
  - Message: `feat(types): attachment, version, 2FA-directory, and alias types`
  - Files: `packages/types/src/vault.ts`, `packages/types/src/integrations.ts`, `packages/types/src/index.ts`
  - Pre-commit: `bun run typecheck`


- [ ] 13. Web: File Attachments UI (Drag-Drop Upload, Preview, Download)

  **What to do**:
  - Add `apps/web/src/components/AttachmentSection.tsx`: Reusable component for item detail/edit
    - Drag-and-drop zone with visual feedback
    - File list showing name, size, type icon
    - Encrypt file client-side with AES-256-GCM (use item's key, AAD = `utf8(itemId:attachmentId)`) before upload
    - Upload via POST to attachment endpoint
    - Download: GET encrypted blob → decrypt client-side → trigger browser download
    - Preview: inline image preview for image/* types, PDF.js for application/pdf
    - Delete button per attachment (with confirmation)
  - Integrate `AttachmentSection` into `apps/web/src/components/ItemPanel.tsx` (show in view/edit modes for all item types)
  - Add `apps/web/src/lib/file-crypto.ts`: Client-side file encryption/decryption helpers
  - Show file size quota usage in settings or item view ("X MB / 100 MB used")

  **Must NOT do**:
  - Do NOT upload unencrypted files
  - Do NOT render untrusted file content without sandboxing

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Complex UI with drag-drop, file preview, progress indicators
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Drag-drop zone, file preview, progress states need polished UX
  - **Skills Evaluated but Omitted**:
    - `playwright`: QA only, not implementation

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 14, 15, 16)
  - **Parallel Group**: Wave 2B
  - **Blocks**: None
  - **Blocked By**: T10 (attachment API), T12 (attachment types)

  **References**:
  **Pattern References**:
  - `apps/web/src/components/ItemPanel.tsx:180-283` — `handleSave` function (add attachment upload step)
  - `apps/web/src/lib/crypto.ts` — Existing encryption helpers (pattern for file-crypto.ts)
  - `packages/crypto/src/encryption.ts:16-38` — AES-256-GCM encrypt function (reuse for files)
  **External References**:
  - HTML5 Drag and Drop API, FileReader API

  **Acceptance Criteria**:
  - [ ] Drag-drop file upload works in item editor
  - [ ] Files encrypted before upload
  - [ ] File list displays in item view
  - [ ] Download decrypts and triggers browser save
  - [ ] Image preview works inline
  - [ ] Delete attachment works with confirmation
  - [ ] `cd apps/web && npx vitest run` passes

  **QA Scenarios:**
  ```
  Scenario: Upload, preview, and download file
    Tool: Playwright
    Steps:
      1. Open login item in edit mode
      2. Drag test-image.png onto the attachment zone
      3. Verify upload progress shown, then file appears in attachment list
      4. Save item, re-open in view mode
      5. Verify image thumbnail preview visible
      6. Click download → verify file downloads successfully
    Expected Result: Full attachment lifecycle with preview
    Evidence: .sisyphus/evidence/task-13-attachments.png
  ```

  **Commit**: YES
  - Message: `feat(web): file attachments UI with drag-drop and preview`
  - Files: `apps/web/src/components/AttachmentSection.tsx`, `apps/web/src/components/ItemPanel.tsx`, `apps/web/src/lib/file-crypto.ts`
  - Pre-commit: `cd apps/web && npx vitest run`

- [ ] 14. Web: Version History Viewer + 2FA Detection in Health Dashboard

  **What to do**:
  - Add version history to item detail:
    - "History" button in ItemPanel view mode
    - Slide-out panel or modal listing versions (date, relative time)
    - Click version to view decrypted content (read-only)
    - "Restore" button per version (calls POST /items/:id/versions/:versionId/restore)
  - Add 2FA detection to Health Dashboard (`apps/web/src/pages/Health.tsx`):
    - Fetch 2fa.directory data: `https://2fa.directory/api/v3/tfa.json` (cache locally)
    - For each login item with URIs, extract domain and check against 2fa.directory
    - New category in health dashboard: "Enable 2FA" section
    - Show list of sites that support 2FA but user has no TOTP configured
    - Show which 2FA methods each site supports (totp, u2f, sms)
    - Link to site's 2FA documentation from 2fa.directory
  - Add to health score calculation: percentage of 2FA-capable sites with TOTP configured

  **Must NOT do**:
  - Do NOT auto-enable 2FA on sites (only inform user)
  - Do NOT cache 2fa.directory data longer than 24 hours

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Version history viewer + health dashboard expansion with data visualization
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Version diff display, 2FA status badges need clear visual design

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 13, 15, 16)
  - **Parallel Group**: Wave 2B
  - **Blocks**: None
  - **Blocked By**: T11 (version API), T12 (types)

  **References**:
  **Pattern References**:
  - `apps/web/src/pages/Health.tsx` — Existing health dashboard to extend
  - `apps/web/src/components/HealthScore.tsx` — Score rendering pattern
  - `apps/web/src/components/IssueList.tsx` — Issue list pattern for 2FA detection items
  - `apps/web/src/components/ItemPanel.tsx:334-367` — Header area to add "History" button
  **External References**:
  - 2fa.directory API: `https://2fa.directory/api/v3/tfa.json`

  **Acceptance Criteria**:
  - [ ] Version history button visible in item view
  - [ ] Version list shows with dates
  - [ ] Restore version works (creates new current version)
  - [ ] Health dashboard shows "Enable 2FA" category
  - [ ] Sites supporting 2FA are listed with methods
  - [ ] `cd apps/web && npx vitest run` passes

  **QA Scenarios:**
  ```
  Scenario: View and restore version
    Tool: Playwright
    Steps:
      1. Open a login item that has been updated multiple times
      2. Click "History" button
      3. Verify version list appears with 2+ entries
      4. Click on an older version → verify old data displayed (read-only)
      5. Click "Restore" → confirm → verify current item updated to old version's data
    Expected Result: Version history browsable and restorable
    Evidence: .sisyphus/evidence/task-14-versions.png
  ```

  **Commit**: YES
  - Message: `feat(web): version history viewer and 2FA detection dashboard`
  - Files: `apps/web/src/components/ItemPanel.tsx`, `apps/web/src/pages/Health.tsx`
  - Pre-commit: `cd apps/web && npx vitest run`

- [ ] 15. API + Web: Email Alias Integration (SimpleLogin / AnonAddy)

  **What to do**:
  - Add `user_settings` table to DB (if not exists): key-value store for per-user settings
    - Or simpler: `alias_settings` table: `user_id` (PK), `provider` (text), `encrypted_api_key` (text), `base_url` (text null)
  - API endpoints:
    - PUT `/api/settings/alias`: Save alias provider config (API key encrypted client-side)
    - GET `/api/settings/alias`: Get config (encrypted API key)
    - POST `/api/aliases/generate`: Proxy to SimpleLogin/AnonAddy API to create new alias, return alias email
    - GET `/api/aliases`: List aliases from provider API
  - Web: Settings page section for email alias configuration
    - Provider selector (SimpleLogin / AnonAddy)
    - API key input (stored encrypted)
    - Test connection button
  - Web: Item editor — "Generate Alias" button next to username/email field
    - Calls POST /api/aliases/generate → populates email field with new alias
  - Add tests

  **Must NOT do**:
  - Do NOT store API keys in plaintext
  - Do NOT expose provider API keys to client (proxy through API)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Third-party API integration + settings storage + UI
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `cloudflare-deploy`: Not deploying

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 13, 14, 16)
  - **Parallel Group**: Wave 2B
  - **Blocks**: T18
  - **Blocked By**: T12 (alias types)

  **References**:
  **Pattern References**:
  - `apps/api/src/routes/vault.ts` — Authenticated route pattern
  - `apps/web/src/pages/Settings.tsx` — Settings page to extend
  - `apps/web/src/components/ItemPanel.tsx:486-494` — Username field area to add alias button
  **External References**:
  - SimpleLogin API: `POST https://app.simplelogin.io/api/alias/random/new` with `Authentication: API_KEY` header
  - AnonAddy API: `POST https://app.anonaddy.com/api/v1/aliases` with Bearer token

  **Acceptance Criteria**:
  - [ ] Alias provider configurable in Settings
  - [ ] "Generate Alias" button appears next to email fields in item editor
  - [ ] New alias created and populated in field
  - [ ] API keys stored encrypted
  - [ ] `bun run test` passes

  **QA Scenarios:**
  ```
  Scenario: Generate email alias in item editor
    Tool: Playwright
    Steps:
      1. Configure SimpleLogin API key in Settings
      2. Edit a login item
      3. Click "Generate Alias" next to username field
      4. Verify field populated with alias email (e.g., random@simplelogin.co)
    Expected Result: Alias generated and populated
    Evidence: .sisyphus/evidence/task-15-alias.png
  ```

  **Commit**: YES
  - Message: `feat(api,web): email alias integration`
  - Files: `apps/api/src/routes/aliases.ts`, `apps/api/src/db/schema.ts`, `apps/web/src/pages/Settings.tsx`, `apps/web/src/components/ItemPanel.tsx`
  - Pre-commit: `bun run test`

- [ ] 16. Extension: File Attachments View + 2FA Detection Badge + Email Alias

  **What to do**:
  - Extension popup: Show attachment count badge on items that have attachments
  - Attachment view: In item detail popup, list attachments with download button (decrypt + download)
  - No upload from extension (web only for upload) — view and download only
  - 2FA detection: After autofill, check if site supports 2FA via cached 2fa.directory data
    - If yes and no TOTP in vault item, show subtle badge: "⚠️ This site supports 2FA"
    - Link to 2FA setup docs from 2fa.directory
  - Email alias: In popup item editor (if available), add "Generate Alias" button
    - Calls background script to proxy alias generation
  - Update extension background script for new message types
  - Add tests

  **Must NOT do**:
  - Do NOT allow file upload from extension popup (complexity + size constraints)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Multiple extension features across popup/background/content scripts
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: Extension popup testing is limited

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 13, 14, 15)
  - **Parallel Group**: Wave 2B
  - **Blocks**: None
  - **Blocked By**: T10 (attachment API), T12 (types)

  **References**:
  **Pattern References**:
  - `apps/extension/entrypoints/popup/` — Popup UI to extend
  - `apps/extension/entrypoints/background.ts` — Background message handlers to add
  - `apps/extension/entrypoints/content.ts:87-100` — Banner injection pattern for 2FA badge

  **Acceptance Criteria**:
  - [ ] Attachment count badge visible on items
  - [ ] Download attachment from extension works
  - [ ] 2FA detection badge shown on applicable sites
  - [ ] Email alias generation works from extension
  - [ ] `cd apps/extension && npx vitest run` passes

  **QA Scenarios:**
  ```
  Scenario: 2FA detection badge
    Tool: Playwright + extension
    Steps:
      1. Navigate to github.com (supports 2FA)
      2. Trigger autofill for a login item WITHOUT totp
      3. Verify 2FA badge appears: "This site supports 2FA"
    Expected Result: Badge warns about missing 2FA
    Evidence: .sisyphus/evidence/task-16-2fa-badge.png
  ```

  **Commit**: YES
  - Message: `feat(ext): file view, 2FA detection, and email alias`
  - Files: `apps/extension/entrypoints/popup/`, `apps/extension/entrypoints/background.ts`, `apps/extension/entrypoints/content.ts`
  - Pre-commit: `cd apps/extension && npx vitest run`

- [ ] 17. Mobile: QR Code Scanner Plugin + File Attachments

  **What to do**:
  - Create Kotlin plugin `apps/mobile/android/.../plugins/QRScannerPlugin.kt`:
    - Use CameraX + ML Kit barcode scanning
    - Expose to TS via Capacitor plugin interface
    - Return decoded string (expecting otpauth:// URI)
  - Create TS bridge `apps/mobile/src/plugins/qr-scanner.ts`
  - In TOTP setup: "Scan QR Code" button opens camera → decode QR → parse otpauth:// URI → populate TOTP field
  - File attachments on mobile:
    - View attachment list in item detail
    - Download attachment (decrypt + save to Downloads or open with intent)
    - Upload via file picker (DocumentPicker) or camera capture
    - Encrypt before upload (same as web)
  - Add tests

  **Must NOT do**:
  - Do NOT require Google Play Services for QR scanning (use ML Kit bundled model)
  - Do NOT store decrypted files in app storage

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Native Kotlin plugin + Capacitor bridge + camera integration
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 18)
  - **Parallel Group**: Wave 2C
  - **Blocks**: None
  - **Blocked By**: T10 (attachment API)

  **References**:
  **Pattern References**:
  - `apps/mobile/src/plugins/biometric.ts` — Existing Capacitor plugin bridge pattern
  - `apps/mobile/src/plugins/index.ts` — Plugin registration
  - `apps/mobile/android/` — Native Android project structure
  **External References**:
  - CameraX + ML Kit barcode scanning: `com.google.mlkit:barcode-scanning`
  - Capacitor plugin guide: `https://capacitorjs.com/docs/plugins/creating-plugins`

  **Acceptance Criteria**:
  - [ ] QR scanner opens camera and decodes otpauth:// URIs
  - [ ] Scanned URI populates TOTP field in item editor
  - [ ] File attachments viewable/downloadable on mobile
  - [ ] File upload from file picker works
  - [ ] `cd apps/mobile && npx vitest run` passes

  **QA Scenarios:**
  ```
  Scenario: QR scanner plugin build
    Tool: tmux
    Steps:
      1. cd apps/mobile && npx cap sync android
      2. cd apps/mobile/android && ./gradlew assembleDebug
      3. Verify build succeeds with QR scanner plugin registered
    Expected Result: Android build succeeds
    Evidence: .sisyphus/evidence/task-17-qr-build.txt
  ```

  **Commit**: YES
  - Message: `feat(mobile): QR scanner plugin and file attachments`
  - Files: `apps/mobile/src/plugins/qr-scanner.ts`, `apps/mobile/android/.../QRScannerPlugin.kt`
  - Pre-commit: `cd apps/mobile && npx vitest run`

- [ ] 18. Mobile: Version History + 2FA Detection + Email Aliases

  **What to do**:
  - Version history in item detail: "History" button → version list → view/restore
  - 2FA detection: Check login items against cached 2fa.directory data, show badge in item list
  - Email alias: "Generate Alias" button in item editor (calls API through existing HTTP layer)
  - Settings: Alias provider configuration (same as web)
  - Add tests

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Multiple features in mobile context
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 17)
  - **Parallel Group**: Wave 2C
  - **Blocks**: None
  - **Blocked By**: T11 (version API), T15 (alias API)

  **References**:
  **Pattern References**:
  - `apps/mobile/src/` — Mobile app structure
  - Tasks 14, 15 web implementations — Feature logic to port

  **Acceptance Criteria**:
  - [ ] Version history accessible in item detail
  - [ ] 2FA detection badges on login items
  - [ ] Email alias generation works
  - [ ] `cd apps/mobile && npx vitest run` passes

  **QA Scenarios:**
  ```
  Scenario: Mobile version history
    Tool: tmux
    Steps:
      1. cd apps/mobile && npx vitest run
      2. Verify version history tests pass
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-18-mobile-versions.txt
  ```

  **Commit**: YES
  - Message: `feat(mobile): version history, 2FA detection, and aliases`
  - Files: `apps/mobile/src/**/*`
  - Pre-commit: `cd apps/mobile && npx vitest run`


### 🟨 Wave 3 — Power User / Developer Features (Tasks 19-26)

- [ ] 19. Types + Crypto: Emergency Access + Passkey + Travel Mode Types

  **What to do**:
  - `packages/types/src/emergency.ts`:
    - `EmergencyAccessGrant` interface: id, grantorUserId, granteeEmail, waitPeriodDays (1/3/7/14/30), status ('pending'|'confirmed'|'waiting'|'approved'|'rejected'|'expired'), encryptedUserKey (RSA-wrapped), createdAt
    - `EmergencyAccessRequest` interface: id, grantId, requestedAt, approvedAt?, rejectedAt?, expiresAt
  - `packages/types/src/vault.ts`:
    - `PasskeyItem` interface: type 'passkey', rpId, rpName, userId, userName, credentialId, encryptedPrivateKey, publicKey, counter, transports[], createdAt
    - Extend `VaultItemType`: `'login' | 'note' | 'card' | 'identity' | 'passkey'`
    - Add `isPasskeyItem` type guard to guards.ts
  - `packages/types/src/vault.ts`: Add `travelSafe?: boolean` field to `Folder` interface
  - `packages/crypto/src/emergency.ts`: Helper to pre-encrypt userKey with grantee's RSA public key for emergency access
  - Update barrel exports in index.ts

  **Must NOT do**:
  - Do NOT add emergency access logic — types and crypto helpers only

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Crypto helper + complex type definitions with security implications
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (first task in Wave 3A)
  - **Parallel Group**: Wave 3A (with Tasks 20, 21, 22 after this completes)
  - **Blocks**: T20, T21, T25
  - **Blocked By**: Wave 2 complete

  **References**:
  **Pattern References**:
  - `packages/types/src/vault.ts:7` — VaultItemType to extend with 'passkey'
  - `packages/types/src/vault.ts:80-85` — Folder interface to add travelSafe
  - `packages/types/src/team.ts` — Complex type definitions pattern
  - `packages/crypto/src/rsa.ts:66-73` — `rsaEncrypt` for wrapping userKey with public key
  - `packages/crypto/src/rsa.ts:76-89` — `rsaDecrypt` for unwrapping

  **Acceptance Criteria**:
  - [ ] All emergency access types exported
  - [ ] PasskeyItem type with all WebAuthn fields exported
  - [ ] Folder type includes optional travelSafe boolean
  - [ ] Emergency crypto helper wraps userKey with RSA public key
  - [ ] `bun run typecheck` passes

  **QA Scenarios:**
  ```
  Scenario: Emergency access crypto helper
    Tool: Bash
    Steps:
      1. Run `bun run typecheck`
      2. Run relevant crypto tests: `cd packages/crypto && npx vitest run`
    Expected Result: Types compile, crypto tests pass
    Evidence: .sisyphus/evidence/task-19-types-crypto.txt
  ```

  **Commit**: YES
  - Message: `feat(types,crypto): emergency access, passkey, and travel types`
  - Files: `packages/types/src/emergency.ts`, `packages/types/src/vault.ts`, `packages/types/src/guards.ts`, `packages/types/src/index.ts`, `packages/crypto/src/emergency.ts`
  - Pre-commit: `bun run typecheck`

- [ ] 20. API: Emergency Access Tables + Endpoints + Email Notifications

  **What to do**:
  - Migration: `emergency_access_grants` table and `emergency_access_requests` table
  - Endpoints in `apps/api/src/routes/emergency.ts`:
    - POST `/api/emergency/grants`: Create grant (grantor designates grantee by email, sets wait period, pre-encrypts userKey with grantee's public key via T19 crypto)
    - GET `/api/emergency/grants`: List grants (as grantor)
    - GET `/api/emergency/requests`: List incoming requests (as grantee)
    - DELETE `/api/emergency/grants/:id`: Revoke grant
    - POST `/api/emergency/requests`: Grantee requests access (starts timer)
    - POST `/api/emergency/grants/:id/reject`: Grantor rejects during wait period
    - POST `/api/emergency/grants/:id/approve`: Grantor approves early (skips wait)
    - GET `/api/emergency/grants/:id/access`: After approval/timer, return encrypted userKey
  - Scheduled check: In existing cron handler, check expired wait periods → auto-approve
  - Email notifications (Cloudflare Email Workers or fetch to external SMTP):
    - Email to grantor when request is made
    - Email to grantee when approved/rejected
  - Wire routes, add tests

  **Must NOT do**:
  - Do NOT expose plaintext userKey at any point
  - Do NOT auto-approve without full wait period
  - Do NOT allow grantee to request access without being designated first

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex multi-step security workflow, timed state machine, crypto operations, email integration
  - **Skills**: [`cloudflare-deploy`]
    - `cloudflare-deploy`: Email Workers / wrangler configuration for notifications

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 21, 22 after T19)
  - **Parallel Group**: Wave 3A
  - **Blocks**: T23, T26
  - **Blocked By**: T19 (types + crypto)

  **References**:
  **Pattern References**:
  - `apps/api/src/routes/auth.ts` — Security-sensitive endpoint pattern
  - `apps/api/src/routes/teams.ts` — Multi-user relationship endpoints
  - `apps/api/src/db/schema.ts` — Table definition patterns
  - `packages/crypto/src/emergency.ts` (from T19) — Key wrapping helper
  - `packages/crypto/src/rsa.ts` — RSA-OAEP operations
  **External References**:
  - Bitwarden emergency access model for workflow reference

  **Acceptance Criteria**:
  - [ ] Grant creation stores RSA-wrapped userKey
  - [ ] Request starts wait period timer
  - [ ] Grantor can reject during wait period
  - [ ] Auto-approval after wait period expires
  - [ ] Grantee receives encrypted userKey after approval
  - [ ] `cd apps/api && npx vitest run` passes

  **QA Scenarios:**
  ```
  Scenario: Emergency access full lifecycle
    Tool: Bash (curl)
    Steps:
      1. User A creates grant for user B (email=b@test.com, waitPeriodDays=0 for testing)
      2. User B requests access
      3. Check: grant status = 'waiting'
      4. Wait for auto-approve (or set waitPeriodDays=0)
      5. User B GET /emergency/grants/:id/access → expect encryptedUserKey
    Expected Result: Full lifecycle from grant to key access
    Evidence: .sisyphus/evidence/task-20-emergency.txt
  ```

  **Commit**: YES
  - Message: `feat(api): emergency access endpoints and email notifications`
  - Files: `apps/api/src/routes/emergency.ts`, `apps/api/src/db/schema.ts`, `apps/api/drizzle/0004_*.sql`, `apps/api/src/index.ts`
  - Pre-commit: `cd apps/api && npx vitest run`

- [ ] 21. API: Travel Mode Endpoints

  **What to do**:
  - Add `travel_safe` boolean column to `folders` table (default 1 = safe)
  - PUT `/api/vault/folders/:id/travel`: Set travel_safe flag (true/false)
  - Add `travel_mode` column to `users` table (0/1, default 0)
  - PUT `/api/settings/travel-mode`: Toggle travel mode on/off
  - GET `/api/settings/travel-mode`: Get current state
  - Modify sync endpoint: When travel mode enabled, exclude items in non-travel-safe folders from sync response
  - When travel mode disabled, full sync resumes
  - Add tests

  **Must NOT do**:
  - Do NOT delete non-travel-safe items (only exclude from sync)
  - Do NOT auto-enable travel mode

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Schema changes + sync behavior modification
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 20, 22)
  - **Parallel Group**: Wave 3A
  - **Blocks**: T24, T26
  - **Blocked By**: T19 (Folder type update)

  **References**:
  **Pattern References**:
  - `apps/api/src/routes/sync.ts` — Sync endpoint to modify for travel mode filtering
  - `apps/api/src/routes/vault.ts:209-231` — Folder update pattern
  - `apps/api/src/db/schema.ts:26-34` — Folders table to add travel_safe column

  **Acceptance Criteria**:
  - [ ] Folder travel_safe flag settable via API
  - [ ] Travel mode toggleable for user
  - [ ] Sync excludes non-travel-safe folders when travel mode ON
  - [ ] Sync returns all folders when travel mode OFF
  - [ ] `cd apps/api && npx vitest run` passes

  **QA Scenarios:**
  ```
  Scenario: Travel mode sync filtering
    Tool: Bash (curl)
    Steps:
      1. Create 2 folders: "Travel" (travel_safe=true), "Private" (travel_safe=false)
      2. Add items to each folder
      3. Enable travel mode: PUT /api/settings/travel-mode {enabled: true}
      4. GET /api/sync → expect only "Travel" folder items
      5. Disable travel mode: PUT /api/settings/travel-mode {enabled: false}
      6. GET /api/sync → expect ALL items
    Expected Result: Travel mode correctly filters sync response
    Evidence: .sisyphus/evidence/task-21-travel-mode.txt
  ```

  **Commit**: YES
  - Message: `feat(api): travel mode endpoints`
  - Files: `apps/api/src/routes/vault.ts`, `apps/api/src/routes/sync.ts`, `apps/api/src/db/schema.ts`, `apps/api/drizzle/0004_*.sql`
  - Pre-commit: `cd apps/api && npx vitest run`

- [ ] 22. CLI: apps/cli Package Scaffold + Auth + Core Commands

  **What to do**:
  - Create `apps/cli/` package with:
    - `package.json` with bin entry: `"lockbox": "./dist/index.js"`
    - `tsconfig.json` extending base
    - Entry point `src/index.ts`
  - Use `commander` or `yargs` for CLI framework
  - Commands:
    - `lockbox login` — prompt for email + master password, derive keys (Argon2id via packages/crypto), get session token
    - `lockbox unlock` — if session exists but vault locked, re-prompt for master password
    - `lockbox list [--type login|note|card|identity] [--folder NAME]` — list vault items (table or JSON)
    - `lockbox get <id>` — decrypt and display single item
    - `lockbox create --type login --name "GitHub"` — interactive prompts for fields, encrypt, push
    - `lockbox generate [--length 20] [--no-symbols]` — generate password (uses packages/generator)
    - `lockbox sync` — pull latest from server
    - `lockbox export --format json` — export decrypted vault (dangerous, requires confirmation)
  - Session management: Store session token in `~/.lockbox/session.json` (auto-refresh)
  - Output: `--json` flag for machine-readable output, default is formatted table
  - Add to turbo.json and workspace packages
  - Add tests

  **Must NOT do**:
  - Do NOT store master password or keys to disk
  - Do NOT skip confirmation for destructive operations (delete, export)
  - Do NOT ship with hardcoded API URL (require `--api-url` or env var)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: New package scaffold, CLI framework, auth flow, multiple commands
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 20, 21)
  - **Parallel Group**: Wave 3A
  - **Blocks**: None
  - **Blocked By**: Wave 2 complete (needs stable API)

  **References**:
  **Pattern References**:
  - `apps/api/package.json` — Package.json pattern for apps/
  - `packages/crypto/src/kdf.ts` — Argon2id key derivation for login
  - `packages/generator/` — Password generation for CLI generate command
  - `apps/web/src/lib/api.ts` — API client pattern to replicate for CLI
  - `apps/web/src/lib/crypto.ts` — Encryption/decryption helpers to port
  **External References**:
  - Commander.js: `https://github.com/tj/commander.js`

  **Acceptance Criteria**:
  - [ ] `apps/cli/` package exists with proper monorepo wiring
  - [ ] `lockbox login` authenticates and stores session
  - [ ] `lockbox list` shows vault items in table format
  - [ ] `lockbox get <id>` decrypts and displays item
  - [ ] `lockbox generate` outputs random password
  - [ ] `--json` flag outputs machine-readable JSON
  - [ ] Tests pass

  **QA Scenarios:**
  ```
  Scenario: CLI login and list
    Tool: tmux
    Steps:
      1. cd apps/cli && bun run build
      2. Run: echo 'masterpass' | bun run ./dist/index.js login --email test@test.com --api-url http://localhost:8787
      3. Run: bun run ./dist/index.js list --json
      4. Verify JSON output contains vault items array
    Expected Result: CLI authenticates and lists vault items
    Evidence: .sisyphus/evidence/task-22-cli.txt
  ```

  **Commit**: YES
  - Message: `feat(cli): lockbox CLI scaffold with auth and core commands`
  - Files: `apps/cli/**/*`
  - Pre-commit: `cd apps/cli && npx vitest run`

- [ ] 23. Web: Emergency Access UI (Grantor + Grantee Dashboards)

  **What to do**:
  - Create `apps/web/src/pages/EmergencyAccess.tsx`:
    - Split into two tabs: "Trusted Contacts" (grantor view) and "Access Requests" (grantee view)
    - Grantor view: List grants, add new trusted contact form (email + wait period dropdown), revoke button
    - Grantee view: List available grants, "Request Access" button, status tracker (pending/waiting/approved/rejected)
    - When approved: Show vault items in read-only mode (decrypt with received userKey)
  - Add navigation link in AppLayout
  - Add route in App.tsx
  - Key exchange flow in UI: When creating grant, fetch grantee's public key, encrypt userKey, send to API

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Complex multi-view page with state machine visualization (wait periods, status)
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Trust relationship UI with countdown timers needs careful design

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 24, 25, 26)
  - **Parallel Group**: Wave 3B
  - **Blocks**: None
  - **Blocked By**: T20 (emergency access API)

  **References**:
  **Pattern References**:
  - `apps/web/src/pages/Teams.tsx` — Multi-tab page with user relationships (similar pattern)
  - `apps/web/src/pages/TeamDetail.tsx` — Member management UI pattern
  - `apps/web/src/lib/team-crypto.ts` — RSA key exchange pattern (reuse for emergency access)

  **Acceptance Criteria**:
  - [ ] Grantor can add trusted contacts with configurable wait period
  - [ ] Grantor can revoke grants
  - [ ] Grantee can request access
  - [ ] Status tracking shows wait period countdown
  - [ ] Read-only vault access works after approval
  - [ ] Dark mode supported
  - [ ] `cd apps/web && npx vitest run` passes

  **QA Scenarios:**
  ```
  Scenario: Create emergency access grant
    Tool: Playwright
    Steps:
      1. Navigate to Emergency Access page
      2. Click "Add Trusted Contact"
      3. Enter email, select wait period "1 day"
      4. Click "Save"
      5. Verify grant appears in list with status "Pending acceptance"
    Expected Result: Grant created and listed
    Evidence: .sisyphus/evidence/task-23-emergency-ui.png
  ```

  **Commit**: YES
  - Message: `feat(web): emergency access grantor and grantee UI`
  - Files: `apps/web/src/pages/EmergencyAccess.tsx`, `apps/web/src/components/AppLayout.tsx`, `apps/web/src/App.tsx`
  - Pre-commit: `cd apps/web && npx vitest run`

- [ ] 24. Web: Travel Mode Settings + Passkey Management UI

  **What to do**:
  - Travel Mode in Settings:
    - Toggle switch: "Enable Travel Mode" with warning about data being excluded from sync
    - Folder list with travel_safe checkbox per folder
    - When enabling: confirmation dialog explaining consequences
  - Passkey Management:
    - New section in vault for passkey items (icon: 🔑)
    - Passkey item view: rpId, rpName, userName, credentialId, counter, createdAt
    - Passkey item create: form for manual entry (for items imported from other managers)
    - Note: The actual WebAuthn authenticator integration is in Task 25 (extension)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Settings UI with toggle + vault extension for passkey items
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 23, 25, 26)
  - **Parallel Group**: Wave 3B
  - **Blocks**: None
  - **Blocked By**: T21 (travel mode API)

  **References**:
  **Pattern References**:
  - `apps/web/src/pages/Settings.tsx` — Settings page to extend
  - `apps/web/src/components/ItemPanel.tsx` — Item type rendering to add passkey case
  - `apps/web/src/pages/Vault.tsx` — Vault list to support passkey type

  **Acceptance Criteria**:
  - [ ] Travel mode toggle in Settings with confirmation
  - [ ] Per-folder travel_safe setting
  - [ ] Passkey items displayed in vault
  - [ ] Passkey detail view shows WebAuthn fields
  - [ ] Dark mode supported
  - [ ] `cd apps/web && npx vitest run` passes

  **QA Scenarios:**
  ```
  Scenario: Enable travel mode
    Tool: Playwright
    Steps:
      1. Navigate to Settings
      2. Toggle "Enable Travel Mode"
      3. Confirm in dialog
      4. Verify travel mode badge/indicator shown
    Expected Result: Travel mode activated
    Evidence: .sisyphus/evidence/task-24-travel-mode.png
  ```

  **Commit**: YES
  - Message: `feat(web): travel mode settings and passkey management`
  - Files: `apps/web/src/pages/Settings.tsx`, `apps/web/src/components/ItemPanel.tsx`, `apps/web/src/pages/Vault.tsx`
  - Pre-commit: `cd apps/web && npx vitest run`

- [ ] 25. Extension: Passkey Storage + WebAuthn Authenticator Integration

  **What to do**:
  - This is the **most complex extension feature** — the extension acts as a WebAuthn authenticator
  - `apps/extension/lib/webauthn.ts`:
    - Intercept `navigator.credentials.create()` calls: generate key pair client-side, store private key encrypted in vault as PasskeyItem, return PublicKeyCredential response
    - Intercept `navigator.credentials.get()` calls: find matching passkey by rpId, decrypt private key, sign challenge, return assertion
    - Support conditional UI mediation (autofill passkeys)
  - `apps/extension/entrypoints/content.ts`:
    - Inject WebAuthn interceptor script (must run in page context, not content script context)
    - Use `window.postMessage` bridge between page context and content script
  - `apps/extension/entrypoints/background.ts`:
    - Handle passkey creation/retrieval messages
    - Encrypt/decrypt passkey private keys via vault CRUD
  - PRF extension support (if available): Use for key derivation
  - Add comprehensive tests for WebAuthn mock scenarios

  **Must NOT do**:
  - Do NOT break existing page WebAuthn if user has hardware keys (fallback gracefully)
  - Do NOT auto-register passkeys without user confirmation
  - Do NOT expose raw private keys to page context (all crypto in extension context)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Most complex feature — deep browser API integration, page context injection, crypto operations
  - **Skills**: [`playwright`]
    - `playwright`: WebAuthn testing requires browser automation with credential mocking
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: No complex UI, mostly browser API integration

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 23, 24, 26)
  - **Parallel Group**: Wave 3B
  - **Blocks**: None
  - **Blocked By**: T19 (passkey types)

  **References**:
  **Pattern References**:
  - `apps/extension/entrypoints/content.ts:16-19` — Background message passing pattern
  - `apps/extension/entrypoints/content.ts:71-84` — DOM injection pattern
  - `packages/crypto/src/encryption.ts` — AES-256-GCM for passkey private key encryption
  **External References**:
  - WebAuthn API: `navigator.credentials.create()`, `navigator.credentials.get()`
  - W3C WebAuthn spec: `https://www.w3.org/TR/webauthn-3/`
  - Chrome extension WebAuthn examples for interceptor pattern

  **Acceptance Criteria**:
  - [ ] Extension intercepts navigator.credentials.create() on websites
  - [ ] Passkey created and stored encrypted in vault
  - [ ] navigator.credentials.get() finds matching passkey and signs challenge
  - [ ] Conditional UI mediation works (passkey autofill)
  - [ ] Existing hardware key WebAuthn not broken
  - [ ] `cd apps/extension && npx vitest run` passes

  **QA Scenarios:**
  ```
  Scenario: Passkey creation and authentication
    Tool: Playwright + extension
    Steps:
      1. Navigate to a WebAuthn test site (e.g., webauthn.io)
      2. Register a new passkey via the extension
      3. Verify passkey item appears in vault
      4. Log out of test site
      5. Authenticate using the stored passkey
      6. Verify successful authentication
    Expected Result: Full passkey lifecycle via extension
    Evidence: .sisyphus/evidence/task-25-passkey.png
  ```

  **Commit**: YES
  - Message: `feat(ext): passkey storage and WebAuthn authenticator`
  - Files: `apps/extension/lib/webauthn.ts`, `apps/extension/entrypoints/content.ts`, `apps/extension/entrypoints/background.ts`
  - Pre-commit: `cd apps/extension && npx vitest run`

- [ ] 26. Mobile: Emergency Access + Travel Mode + Passkeys (Android Credential Manager)

  **What to do**:
  - Emergency access: Port web UI to mobile (grantor/grantee views, status tracking)
  - Travel mode: Settings toggle, per-folder travel_safe, sync filtering respects travel mode
  - Passkeys via Android Credential Manager:
    - New Kotlin plugin `apps/mobile/android/.../plugins/CredentialManagerPlugin.kt`
    - Implement `CredentialProviderService` for Android 14+ Credential Manager API
    - Store/retrieve passkeys from vault
    - TS bridge: `apps/mobile/src/plugins/credential-manager.ts`
  - Add tests

  **Must NOT do**:
  - Do NOT break existing biometric plugin
  - Do NOT store passkey private keys outside encrypted vault

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Android Credential Manager API (native Kotlin), multi-feature mobile task
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 23, 24, 25)
  - **Parallel Group**: Wave 3B
  - **Blocks**: None
  - **Blocked By**: T20 (emergency API), T21 (travel API)

  **References**:
  **Pattern References**:
  - `apps/mobile/src/plugins/biometric.ts` — Kotlin plugin bridge pattern
  - `apps/mobile/src/plugins/autofill.ts` — Android service integration pattern
  - `apps/mobile/android/` — Android project structure
  **External References**:
  - Android Credential Manager: `https://developer.android.com/identity/sign-in/credential-manager`

  **Acceptance Criteria**:
  - [ ] Emergency access grantor/grantee views on mobile
  - [ ] Travel mode toggle in mobile Settings
  - [ ] Android Credential Manager registers Lockbox as passkey provider
  - [ ] `cd apps/mobile && npx vitest run` passes

  **QA Scenarios:**
  ```
  Scenario: Mobile build with Credential Manager
    Tool: tmux
    Steps:
      1. cd apps/mobile && npx cap sync android
      2. cd apps/mobile/android && ./gradlew assembleDebug
      3. Verify build succeeds with CredentialManagerPlugin
    Expected Result: Build succeeds
    Evidence: .sisyphus/evidence/task-26-mobile-passkey.txt
  ```

  **Commit**: YES
  - Message: `feat(mobile): emergency access, travel mode, and passkeys`
  - Files: `apps/mobile/src/**/*`, `apps/mobile/android/.../plugins/CredentialManagerPlugin.kt`
  - Pre-commit: `cd apps/mobile && npx vitest run`


### 🟦 Wave 4 — Moonshots (Tasks 27-34)

- [ ] 27. Types + Crypto: Document Type + Hardware Key Types + ECDH for QR Sync

  **What to do**:
  - `packages/types/src/vault.ts`:
    - `DocumentItem` interface: type 'document', name, encryptedFileKey, mimeType, size, description?, tags
    - Extend `VaultItemType`: add 'document' (now: 'login' | 'note' | 'card' | 'identity' | 'passkey' | 'document')
    - Add `isDocumentItem` type guard to guards.ts
  - `packages/types/src/hardware-key.ts`:
    - `HardwareKeyConfig` interface: keyId, type ('yubikey-piv' | 'fido2'), publicKey, wrappedMasterKey, createdAt
    - `HardwareKeySetupRequest`, `HardwareKeyUnlockRequest` types
  - `packages/types/src/device-sync.ts`:
    - `QRSyncPayload` interface: ephemeralPublicKey, encryptedSessionKey, nonce, expiresAt
    - `DeviceSyncRequest`, `DeviceSyncResponse` types
  - `packages/crypto/src/ecdh.ts`:
    - `generateEcdhKeyPair()`: Generate P-256 ECDH key pair
    - `deriveSharedSecret(privateKey, publicKey)`: ECDH key agreement
    - `encryptWithSharedSecret(data, sharedSecret)`: AES-256-GCM encrypt for QR sync
    - `decryptWithSharedSecret(data, sharedSecret)`: AES-256-GCM decrypt for QR sync
  - Update barrel exports

  **Must NOT do**:
  - Do NOT implement full QR sync flow — just types + crypto primitives

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Crypto primitives + type definitions with security implications
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (first in Wave 4A)
  - **Parallel Group**: Wave 4A
  - **Blocks**: T28, T30, T32
  - **Blocked By**: Wave 3 complete

  **References**:
  **Pattern References**:
  - `packages/types/src/vault.ts:7` — VaultItemType union to extend
  - `packages/crypto/src/rsa.ts` — Key generation pattern (replicate for ECDH)
  - `packages/crypto/src/encryption.ts` — AES-256-GCM pattern for shared secret encryption
  **External References**:
  - WebCrypto ECDH: `crypto.subtle.generateKey({name: 'ECDH', namedCurve: 'P-256'})`
  - WebCrypto ECDH deriveBits: `crypto.subtle.deriveBits({name: 'ECDH', public: ...})`

  **Acceptance Criteria**:
  - [ ] DocumentItem type exported with all fields
  - [ ] HardwareKeyConfig type exported
  - [ ] QRSyncPayload type exported
  - [ ] ECDH key pair generation works
  - [ ] Shared secret derivation produces correct key material
  - [ ] `bun run typecheck` passes
  - [ ] `cd packages/crypto && npx vitest run` passes

  **QA Scenarios:**
  ```
  Scenario: ECDH key exchange crypto
    Tool: Bash
    Steps:
      1. Run crypto tests: `cd packages/crypto && npx vitest run`
      2. Verify ECDH-specific tests pass (key gen, derive, encrypt/decrypt round-trip)
    Expected Result: All crypto tests pass
    Evidence: .sisyphus/evidence/task-27-ecdh-crypto.txt
  ```

  **Commit**: YES
  - Message: `feat(types,crypto): document, HW key, and ECDH types`
  - Files: `packages/types/src/vault.ts`, `packages/types/src/hardware-key.ts`, `packages/types/src/device-sync.ts`, `packages/crypto/src/ecdh.ts`, `packages/types/src/guards.ts`, `packages/types/src/index.ts`
  - Pre-commit: `bun run typecheck`

- [ ] 28. API: Document Vault + Hardware Key Endpoints

  **What to do**:
  - Document Vault:
    - Reuse R2 bucket from T10 for document storage
    - Document items are vault items with `type: 'document'` — existing CRUD handles this
    - Document file upload: POST `/api/vault/items/:itemId/document` (similar to attachments but for the primary file)
    - Per-user storage quota tracking (configurable, default 500MB for documents)
  - Hardware Key:
    - `hardware_keys` table: `id`, `user_id` (FK), `key_type`, `public_key`, `wrapped_master_key`, `created_at`
    - POST `/api/auth/hardware-key/setup`: Register hardware key, store wrapped master key
    - POST `/api/auth/hardware-key/challenge`: Generate challenge for unlock
    - POST `/api/auth/hardware-key/verify`: Verify signature, return session
    - DELETE `/api/auth/hardware-key/:id`: Remove hardware key
  - Migration for hardware_keys table
  - Wire routes, add tests

  **Must NOT do**:
  - Do NOT store unwrapped master keys
  - Do NOT allow hardware key as sole auth factor (always master password backup)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Schema + endpoints for two distinct features
  - **Skills**: [`cloudflare-deploy`]
    - `cloudflare-deploy`: R2 quota management, wrangler config

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 29)
  - **Parallel Group**: Wave 4A
  - **Blocks**: T30, T33
  - **Blocked By**: T27 (types)

  **References**:
  **Pattern References**:
  - `apps/api/src/routes/attachments.ts` (from T10) — R2 upload pattern to reuse
  - `apps/api/src/routes/auth.ts` — Auth endpoint pattern for hardware key flow
  - `apps/api/src/routes/vault.ts:49-75` — Item creation (documents use same pattern)
  **External References**:
  - WebAuthn server-side verification: `https://www.w3.org/TR/webauthn-3/#sctn-verifying-assertion`

  **Acceptance Criteria**:
  - [ ] Document items stored with encrypted file in R2
  - [ ] Hardware key registration stores wrapped master key
  - [ ] Hardware key challenge/verify flow works
  - [ ] Storage quota enforced for documents
  - [ ] `cd apps/api && npx vitest run` passes

  **QA Scenarios:**
  ```
  Scenario: Document upload and retrieval
    Tool: Bash (curl)
    Steps:
      1. Create vault item type='document'
      2. POST /api/vault/items/:id/document with encrypted file body
      3. GET /api/vault/items/:id/document → expect encrypted blob
    Expected Result: Document stored and retrievable
    Evidence: .sisyphus/evidence/task-28-document.txt
  ```

  **Commit**: YES
  - Message: `feat(api): document vault and HW key endpoints`
  - Files: `apps/api/src/routes/documents.ts`, `apps/api/src/routes/hardware-key.ts`, `apps/api/src/db/schema.ts`, `apps/api/drizzle/0005_*.sql`
  - Pre-commit: `cd apps/api && npx vitest run`

- [ ] 29. Infrastructure: Self-Hosted Relay via Cloudflare Tunnel

  **What to do**:
  - Create `apps/relay/` package:
    - Cloudflare Tunnel configuration for LAN-only API access
    - `cloudflared` tunnel setup script
    - mDNS/DNS-SD advertisement for local API discovery
    - Configuration file format for relay settings
  - Client-side discovery:
    - Add API URL fallback logic: try local relay → fall back to public Worker URL
    - `packages/types/src/config.ts`: `RelayConfig` interface (localUrl, publicUrl, tunnelId)
  - Setup guide in docs/
  - Extension: manifest.json permission for local network access
  - Mobile: Capacitor local network discovery
  - One-click Tunnel provisioning script in `scripts/`
  - Add configuration tests

  **Must NOT do**:
  - Do NOT make relay a hard requirement (always optional)
  - Do NOT skip TLS for local relay (Tunnel handles TLS)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Infrastructure setup, networking, multi-platform discovery
  - **Skills**: [`cloudflare-deploy`]
    - `cloudflare-deploy`: Cloudflare Tunnel setup and cloudflared configuration

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 27, 28)
  - **Parallel Group**: Wave 4A
  - **Blocks**: None
  - **Blocked By**: Wave 3 complete

  **References**:
  **Pattern References**:
  - `apps/api/wrangler.toml` — Worker configuration reference
  - `scripts/` — Existing deploy scripts pattern
  **External References**:
  - Cloudflare Tunnel docs: `https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/`
  - `cloudflared tunnel create`, `cloudflared tunnel route`

  **Acceptance Criteria**:
  - [ ] Tunnel setup script works
  - [ ] Local API discoverable via mDNS
  - [ ] Clients fall back to public URL when tunnel unavailable
  - [ ] Configuration documented

  **QA Scenarios:**
  ```
  Scenario: Tunnel configuration
    Tool: Bash
    Steps:
      1. Verify setup script exists and is executable
      2. Verify config file format is valid
      3. Run typecheck on relay package
    Expected Result: Configuration valid, types compile
    Evidence: .sisyphus/evidence/task-29-relay.txt
  ```

  **Commit**: YES
  - Message: `feat(infra): self-hosted relay via Cloudflare Tunnel`
  - Files: `apps/relay/**/*`, `scripts/setup-tunnel.sh`, `packages/types/src/config.ts`
  - Pre-commit: `bun run typecheck`

- [ ] 30. Web: Document Vault UI + Hardware Key Setup + Multi-Device QR Sync

  **What to do**:
  - Document Vault:
    - Document items in vault list with 📄 icon
    - Document detail view: name, description, file preview (PDF.js for PDF, inline for images), metadata
    - Document upload: file picker + drag-drop, encrypt with item key, upload to API
    - Storage quota indicator in sidebar or settings
  - Hardware Security Key Setup in Settings:
    - "Register Hardware Key" button
    - WebUSB/CTAP2 flow: prompt tap → generate hardware-bound key → wrap master key → register via API
    - "Unlock with Hardware Key" option on Unlock page
    - List registered keys with revoke button
  - Multi-Device QR Sync:
    - "Add Device" button in Settings
    - Trusted device flow: generate ephemeral ECDH key pair, encode public key + encrypted session data into QR code
    - Display QR code with 30-second countdown
    - New device flow: scan QR (or file input for webcam), derive shared secret, decrypt session key
    - After sync: new device has session + decrypted user key in memory
  - All with full dark mode

  **Must NOT do**:
  - Do NOT render untrusted document content without sandboxing (use iframe sandbox for PDFs)
  - Do NOT extend QR validity beyond 30 seconds
  - Do NOT persist session key from QR sync to storage

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Three distinct UI features with complex interactive flows (QR display, WebUSB prompts, file preview)
  - **Skills**: [`frontend-ui-ux`, `playwright`]
    - `frontend-ui-ux`: Document preview, HW key setup wizard, QR code display all need polished UX
    - `playwright`: QA scenarios for all three features

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 31, 32)
  - **Parallel Group**: Wave 4B
  - **Blocks**: None
  - **Blocked By**: T28 (document + HW key APIs)

  **References**:
  **Pattern References**:
  - `apps/web/src/components/ItemPanel.tsx` — Item type rendering to add document case
  - `apps/web/src/components/AttachmentSection.tsx` (from T13) — File upload pattern to reuse
  - `apps/web/src/pages/Settings.tsx` — Settings page for HW key and QR sync sections
  - `packages/crypto/src/ecdh.ts` (from T27) — ECDH for QR sync crypto
  **External References**:
  - WebUSB API: `navigator.usb.requestDevice()`
  - CTAP2/FIDO2 via WebAuthn API
  - QR code generation: `qrcode` npm package (already used in T7 for TOTP)

  **Acceptance Criteria**:
  - [ ] Document items viewable with file preview
  - [ ] Document upload encrypts and stores file
  - [ ] HW key setup registers key via WebUSB
  - [ ] HW key unlock works from Unlock page
  - [ ] QR code displayed with 30s countdown for device sync
  - [ ] Dark mode on all new UI
  - [ ] `cd apps/web && npx vitest run` passes

  **QA Scenarios:**
  ```
  Scenario: Document upload and preview
    Tool: Playwright
    Steps:
      1. Create new item type=document
      2. Upload test PDF file
      3. Save item
      4. Open item → verify PDF preview renders in sandboxed iframe
    Expected Result: Document stored and previewable
    Evidence: .sisyphus/evidence/task-30-document-ui.png

  Scenario: Multi-device QR display
    Tool: Playwright
    Steps:
      1. Navigate to Settings → "Add Device"
      2. Verify QR code displayed
      3. Verify 30-second countdown visible
      4. Wait 30 seconds → verify QR code expires and new one can be generated
    Expected Result: QR code with time limit
    Evidence: .sisyphus/evidence/task-30-qr-sync.png
  ```

  **Commit**: YES
  - Message: `feat(web): document vault, HW key setup, and QR sync`
  - Files: `apps/web/src/components/ItemPanel.tsx`, `apps/web/src/pages/Settings.tsx`, `apps/web/src/pages/Unlock.tsx`, `apps/web/src/pages/Vault.tsx`
  - Pre-commit: `cd apps/web && npx vitest run`

- [ ] 31. AI: Password Rotation Agent with Site Adapters

  **What to do**:
  - Extend `packages/ai/` with password rotation module:
    - `packages/ai/src/rotation-agent.ts`: Agent loop that takes a vault item and attempts autonomous password rotation
    - Agent workflow: navigate to site → log in with old credentials → find change password page → enter old password → generate new password → enter new password → submit → update vault
  - Site adapter system:
    - `packages/ai/src/rotation-adapters/base.ts`: Base adapter interface
    - `packages/ai/src/rotation-adapters/google.ts`: Google account adapter
    - `packages/ai/src/rotation-adapters/github.ts`: GitHub adapter
    - `packages/ai/src/rotation-adapters/amazon.ts`: Amazon adapter
    - `packages/ai/src/rotation-adapters/generic.ts`: Generic adapter (best-effort for unknown sites)
  - Confirmation flow: Agent presents plan to user before executing ("I will change your GitHub password")
  - Fallback: If automation fails, generate new password + provide step-by-step instructions
  - Web UI: "Rotate Password" button on login items → opens rotation agent modal
  - **NOTE**: Browser automation runs CLIENT-SIDE via iframe or Playwright in extension context, NOT on server
  - Add tests for adapter logic (mocked DOM)

  **Must NOT do**:
  - Do NOT execute rotation without user confirmation
  - Do NOT run browser automation server-side (privacy violation)
  - Do NOT expose credentials to third-party services
  - Do NOT assume any site's password change flow is stable (always fallback)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex agent system with browser automation, site-specific adapters, fallback handling
  - **Skills**: [`playwright`]
    - `playwright`: Browser automation patterns for site adapters

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 30, 32)
  - **Parallel Group**: Wave 4B
  - **Blocks**: None
  - **Blocked By**: Wave 3 complete

  **References**:
  **Pattern References**:
  - `packages/ai/` — Existing AI package structure
  - `apps/web/src/pages/Chat.tsx` — AI chat integration pattern (for rotation modal)
  - `packages/generator/` — Password generation for new passwords
  **External References**:
  - Playwright automation patterns for form interaction

  **Acceptance Criteria**:
  - [ ] Rotation agent module exists in packages/ai
  - [ ] At least 3 site adapters (Google, GitHub, Amazon)
  - [ ] Generic fallback adapter generates password + shows instructions
  - [ ] Confirmation required before rotation
  - [ ] Web UI has "Rotate Password" button
  - [ ] Tests pass for adapter logic

  **QA Scenarios:**
  ```
  Scenario: Fallback rotation (generic adapter)
    Tool: Playwright
    Steps:
      1. Open a login item for an unsupported site
      2. Click "Rotate Password"
      3. Confirm rotation intent
      4. Verify: new password generated, step-by-step instructions shown
      5. After user confirms completion, verify vault updated with new password
    Expected Result: Graceful fallback with new password + instructions
    Evidence: .sisyphus/evidence/task-31-rotation-fallback.png
  ```

  **Commit**: YES
  - Message: `feat(ai): password rotation agent with site adapters`
  - Files: `packages/ai/src/rotation-agent.ts`, `packages/ai/src/rotation-adapters/**/*`, `apps/web/src/components/ItemPanel.tsx`
  - Pre-commit: `bun run test`

- [ ] 32. Extension: Hardware Key WebUSB + Multi-Device QR Sync

  **What to do**:
  - Hardware Key:
    - WebUSB/CTAP2 integration in extension for hardware key unlock
    - Extension can prompt for hardware key tap during unlock flow
    - Sign challenge with hardware key → send to API for verification
  - Multi-Device QR Sync:
    - Extension as QR SENDER: Generate QR code in popup (same ECDH flow as web)
    - Extension as QR RECEIVER: File input or webcam capture to scan QR from trusted device
    - After scan: derive shared secret, decrypt session key, bootstrap vault access
  - Add tests

  **Must NOT do**:
  - Do NOT persist ephemeral ECDH keys
  - Do NOT allow QR sync without user-initiated action

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: WebUSB browser API + ECDH crypto + QR code generation in extension context
  - **Skills**: [`playwright`]
    - `playwright`: Testing extension WebUSB interactions

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 30, 31)
  - **Parallel Group**: Wave 4B
  - **Blocks**: None
  - **Blocked By**: T27 (ECDH crypto)

  **References**:
  **Pattern References**:
  - `apps/extension/entrypoints/popup/` — Popup UI to extend
  - `packages/crypto/src/ecdh.ts` (from T27) — ECDH key exchange
  **External References**:
  - WebUSB API in extension context
  - QR code scanning: `jsQR` or similar library

  **Acceptance Criteria**:
  - [ ] Hardware key unlock works from extension
  - [ ] QR sync sends QR from extension
  - [ ] QR sync receives/scans QR in extension
  - [ ] `cd apps/extension && npx vitest run` passes

  **QA Scenarios:**
  ```
  Scenario: QR sync from extension
    Tool: Playwright + extension
    Steps:
      1. Open extension popup
      2. Navigate to "Add Device" section
      3. Verify QR code generated and displayed
      4. Verify 30-second countdown
    Expected Result: QR code displayed for device pairing
    Evidence: .sisyphus/evidence/task-32-ext-qr.png
  ```

  **Commit**: YES
  - Message: `feat(ext): HW key WebUSB and QR sync`
  - Files: `apps/extension/lib/hardware-key.ts`, `apps/extension/lib/qr-sync.ts`, `apps/extension/entrypoints/**/*`
  - Pre-commit: `cd apps/extension && npx vitest run`

- [ ] 33. Mobile: Hardware Key FIDO2 + QR Sync + Document Vault

  **What to do**:
  - Hardware Key:
    - New Kotlin plugin `apps/mobile/android/.../plugins/Fido2Plugin.kt`
    - Android FIDO2 API for hardware key registration and authentication
    - TS bridge: `apps/mobile/src/plugins/fido2.ts`
    - Unlock flow: prompt for hardware key → sign challenge → verify via API
  - QR Sync:
    - Reuse QR scanner plugin (from T17) for receiving QR codes
    - Add QR generation for sending (trusted device sends QR to new device)
    - ECDH key exchange via QR → decrypt session key → bootstrap vault
  - Document Vault:
    - Document items in mobile vault list
    - Document detail with preview (Android built-in PDF/image viewers via intent)
    - Document upload via file picker
  - Add tests

  **Must NOT do**:
  - Do NOT require Google Play Services for FIDO2 (use FIDO2 API directly)
  - Do NOT persist QR sync ephemeral keys

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Native Kotlin FIDO2 plugin + QR sync + document handling
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 34)
  - **Parallel Group**: Wave 4C
  - **Blocks**: None
  - **Blocked By**: T28 (document/HW key APIs)

  **References**:
  **Pattern References**:
  - `apps/mobile/src/plugins/biometric.ts` — Kotlin plugin bridge
  - `apps/mobile/src/plugins/qr-scanner.ts` (from T17) — QR scanning to reuse
  - `packages/crypto/src/ecdh.ts` (from T27) — ECDH for QR sync
  **External References**:
  - Android FIDO2: `com.google.android.gms.fido.fido2`

  **Acceptance Criteria**:
  - [ ] FIDO2 hardware key registration works on Android
  - [ ] QR sync send/receive works on mobile
  - [ ] Document items viewable with native preview
  - [ ] `cd apps/mobile && npx vitest run` passes

  **QA Scenarios:**
  ```
  Scenario: Mobile build with FIDO2 + QR sync
    Tool: tmux
    Steps:
      1. cd apps/mobile && npx cap sync android
      2. cd apps/mobile/android && ./gradlew assembleDebug
      3. Verify build succeeds with Fido2Plugin
    Expected Result: Build succeeds
    Evidence: .sisyphus/evidence/task-33-mobile-fido2.txt
  ```

  **Commit**: YES
  - Message: `feat(mobile): HW key FIDO2, QR sync, and document vault`
  - Files: `apps/mobile/src/plugins/fido2.ts`, `apps/mobile/android/.../plugins/Fido2Plugin.kt`, `apps/mobile/src/**/*`
  - Pre-commit: `cd apps/mobile && npx vitest run`

- [ ] 34. Integration: Cross-Feature End-to-End Testing

  **What to do**:
  - Create comprehensive integration test suite in `packages/test-utils/` or `apps/api/src/__tests__/integration/`
  - Test cross-feature interactions:
    - Identity item with custom fields + file attachment + version history
    - 2FA-enabled user login → vault access → sync
    - Travel mode + sync filtering → disable → full restore
    - Emergency access grant → request → approve → vault read-only access
    - Share link with new item types (identity, document)
    - Team sharing with new item types
  - Verify no regressions in existing 295 tests
  - Run full `bun run test` across all apps
  - Run `bun run typecheck` and `bun run lint`

  **Must NOT do**:
  - Do NOT skip any existing test file
  - Do NOT mock what can be tested directly

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Cross-cutting integration tests requiring deep understanding of all features
  - **Skills**: [`playwright`]
    - `playwright`: E2E testing for web UI integration

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 33)
  - **Parallel Group**: Wave 4C
  - **Blocks**: None
  - **Blocked By**: All previous tasks

  **References**:
  **Pattern References**:
  - `apps/api/src/__tests__/` — Existing API test patterns
  - `apps/web/src/__tests__/` — Existing web test patterns
  - `packages/test-utils/` — Shared test utilities

  **Acceptance Criteria**:
  - [ ] All existing 295+ tests still pass
  - [ ] Cross-feature integration tests pass
  - [ ] `bun run test` → all pass
  - [ ] `bun run typecheck` → zero errors
  - [ ] `bun run lint` → zero errors

  **QA Scenarios:**
  ```
  Scenario: Full test suite
    Tool: Bash
    Steps:
      1. bun run typecheck
      2. bun run lint
      3. bun run test
    Expected Result: All commands succeed with zero errors/failures
    Evidence: .sisyphus/evidence/task-34-integration.txt
  ```

  **Commit**: YES
  - Message: `test: cross-feature integration tests`
  - Files: `apps/*/src/__tests__/**/*`
  - Pre-commit: `bun run test`

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `oracle`
      Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
      Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
      Run `bun run typecheck` + `bun run lint` + `bun run test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names. Verify `.js` extensions on all local imports. Verify Tailwind dark mode variants on all new UI.
      Output: `Typecheck [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Full QA Re-Run** — `unspecified-high` (+ `playwright` skill)
      Start from clean state (fresh login). Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-feature integration (e.g., identity item with custom fields and file attachment). Test edge cases: empty vault, max file size, expired 2FA code, travel mode + sync. Save to `.sisyphus/evidence/final-qa/`.
      Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
      For each task: read "What to do", read actual diff. Verify 1:1 — everything specified was built, nothing beyond spec was built. Check "Must NOT do" compliance per task. Detect cross-task contamination. Flag unaccounted file changes. Verify ALL 19 features are present across ALL required surfaces.
      Output: `Tasks [N/N compliant] | Features [19/19] | Surfaces [web/ext/mobile/api] | VERDICT`

---

## Commit Strategy

Each task gets its own commit. Larger tasks may split into 2 commits (backend + frontend).

| Task(s) | Commit Message                                                     | Pre-commit                            |
| ------- | ------------------------------------------------------------------ | ------------------------------------- |
| T1      | `feat(types): add identity, custom fields, and 2FA types`          | `bun run typecheck`                   |
| T2      | `feat(api): migration for identity, custom fields, 2FA tables`     | `cd apps/api && npx vitest run`       |
| T3      | `feat(api): vault routes for identity type and custom fields`      | `cd apps/api && npx vitest run`       |
| T4      | `feat(api): account TOTP 2FA setup, verify, and login challenge`   | `cd apps/api && npx vitest run`       |
| T5      | `feat(api): trash auto-purge scheduled worker`                     | `cd apps/api && npx vitest run`       |
| T6      | `feat(web): identity item type and custom fields in ItemPanel`     | `cd apps/web && npx vitest run`       |
| T7      | `feat(web): trash view and account 2FA setup flow`                 | `cd apps/web && npx vitest run`       |
| T8      | `feat(ext): identity autofill and save-on-submit detection`        | `cd apps/extension && npx vitest run` |
| T9      | `feat(mobile): identity items, custom fields, and 2FA login`       | `cd apps/mobile && npx vitest run`    |
| T10     | `feat(api): R2 file attachment endpoints`                          | `cd apps/api && npx vitest run`       |
| T11     | `feat(api): version history table and endpoints`                   | `cd apps/api && npx vitest run`       |
| T12     | `feat(types): attachment, version, 2FA-directory, and alias types` | `bun run typecheck`                   |
| T13     | `feat(web): file attachments UI with drag-drop and preview`        | `cd apps/web && npx vitest run`       |
| T14     | `feat(web): version history viewer and 2FA detection dashboard`    | `cd apps/web && npx vitest run`       |
| T15     | `feat(api,web): email alias integration`                           | `bun run test`                        |
| T16     | `feat(ext): file view, 2FA detection, and email alias`             | `cd apps/extension && npx vitest run` |
| T17     | `feat(mobile): QR scanner plugin and file attachments`             | `cd apps/mobile && npx vitest run`    |
| T18     | `feat(mobile): version history, 2FA detection, and aliases`        | `cd apps/mobile && npx vitest run`    |
| T19     | `feat(types,crypto): emergency access, passkey, and travel types`  | `bun run typecheck`                   |
| T20     | `feat(api): emergency access endpoints and email notifications`    | `cd apps/api && npx vitest run`       |
| T21     | `feat(api): travel mode endpoints`                                 | `cd apps/api && npx vitest run`       |
| T22     | `feat(cli): lockbox CLI scaffold with auth and core commands`      | `cd apps/cli && npx vitest run`       |
| T23     | `feat(web): emergency access grantor and grantee UI`               | `cd apps/web && npx vitest run`       |
| T24     | `feat(web): travel mode settings and passkey management`           | `cd apps/web && npx vitest run`       |
| T25     | `feat(ext): passkey storage and WebAuthn authenticator`            | `cd apps/extension && npx vitest run` |
| T26     | `feat(mobile): emergency access, travel mode, and passkeys`        | `cd apps/mobile && npx vitest run`    |
| T27     | `feat(types,crypto): document, HW key, and ECDH types`             | `bun run typecheck`                   |
| T28     | `feat(api): document vault and HW key endpoints`                   | `cd apps/api && npx vitest run`       |
| T29     | `feat(infra): self-hosted relay via Cloudflare Tunnel`             | `bun run typecheck`                   |
| T30     | `feat(web): document vault, HW key setup, and QR sync`             | `cd apps/web && npx vitest run`       |
| T31     | `feat(ai): password rotation agent with site adapters`             | `bun run test`                        |
| T32     | `feat(ext): HW key WebUSB and QR sync`                             | `cd apps/extension && npx vitest run` |
| T33     | `feat(mobile): HW key FIDO2, QR sync, and document vault`          | `cd apps/mobile && npx vitest run`    |
| T34     | `test: cross-feature integration tests`                            | `bun run test`                        |

---

## Success Criteria

### Verification Commands

```bash
bun run typecheck          # Expected: zero errors
bun run lint               # Expected: zero errors
bun run test               # Expected: all tests pass (existing 295 + new)
cd apps/api && npx vitest run    # Expected: 108+ tests pass
cd apps/web && npx vitest run    # Expected: 52+ tests pass
cd apps/extension && npx vitest run  # Expected: 51+ tests pass
cd apps/mobile && npx vitest run     # Expected: 84+ tests pass
```

### Final Checklist

- [ ] All 19 features functional
- [ ] All "Must Have" present (AAD contract, encryption format, cross-surface)
- [ ] All "Must NOT Have" absent (no server decryption, no key persistence, no `as any`)
- [ ] All tests pass across all 4 apps
- [ ] Typecheck passes with zero errors
- [ ] All QA evidence captured in `.sisyphus/evidence/`
- [ ] All commits follow conventional format
- [ ] Dark mode support on all new UI
