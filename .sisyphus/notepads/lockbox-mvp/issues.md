
## F2: Code Quality Review Issues (2026-02-26)

### Typecheck Failure: @lockbox/api
- 15 TS errors: Missing CF Workers types (D1Database, DurableObjectState, DurableObjectNamespace, RateLimit, WebSocketPair)
- Likely fix: Add `@cloudflare/workers-types` to api package tsconfig or devDependencies

### Crypto Build (tsc emit) Errors
- `@lockbox/crypto:build` fails with Uint8Array<ArrayBufferLike> not assignable to BufferSource
- Affects: encryption.ts, hkdf.ts, kdf.ts, keys.ts, crypto.test.ts
- Root cause: TS 5.x stricter ArrayBuffer vs ArrayBufferLike typing in WebCrypto API
- Note: `@lockbox/crypto:typecheck` (tsc --noEmit) PASSES — emit mode only
- Also: kdf.ts has rootDir violation importing from @lockbox/types source

### Web Build Warning
- index.js chunk is 738 kB (exceeds 500 kB warning threshold)
- Consider code splitting or manual chunks
