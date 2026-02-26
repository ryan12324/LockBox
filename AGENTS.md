# AGENTS.md — Lockbox

## Architecture

- `apps/api` — Hono on Cloudflare Workers (D1 SQLite)
- `apps/web` — React 19 + Vite + Tailwind v4 + Zustand
- `apps/extension` — WXT browser extension (Chrome/Firefox)
- `apps/mobile` — Capacitor Android (Kotlin native plugins + TS offline sync)
- `packages/crypto` — AES-256-GCM + Argon2id
- `packages/generator` — Password/passphrase generation + zxcvbn
- `packages/totp` — TOTP generation
- `packages/types` — Shared TypeScript types

## Encryption AAD Contract (Critical)

- AAD = `utf8(itemId:revisionDate)` — binds ciphertext to context
- `encryptedData` = `base64(iv).base64(ciphertext+tag)` — single opaque string, no separate `iv` column
- Client generates `id` + `revisionDate`, encrypts, sends all three to server
- Server stores client-provided values — NEVER overrides them
- Mismatch = silent decryption failure

## Conventions

- Strict TypeScript, `.js` extensions in all local imports
- No `as any`, `@ts-ignore`, `@ts-expect-error`
- Tailwind v4, indigo-600 primary, full dark mode (`dark:` variants)
- Auth: `session` → sessionStorage; `userKey`/`masterKey` → memory-only, never persisted
- Every feature must be implemented across all surfaces (web, extension, mobile) — no single-app features

## Testing

```bash
bun run test                           # All
cd apps/web && npx vitest run          # 52 tests
cd apps/api && npx vitest run          # 108 tests
cd apps/extension && npx vitest run    # 51 tests
cd apps/mobile && npx vitest run       # 84 tests
```

## Deployment

- API → `bun run deploy:api` (Cloudflare Workers)
- Web → `bun run deploy:web` (Cloudflare Pages)
- Extension → manual build + Chrome Web Store / Firefox AMO
- Mobile → Capacitor build → Google Play Store
