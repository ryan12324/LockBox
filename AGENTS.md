# AGENTS.md — Lockbox

## Architecture

- `apps/api` — Hono on Cloudflare Workers (D1 SQLite)
- `apps/web` — React 19 + Vite + Tailwind v4 + Zustand
- `apps/extension` — WXT browser extension (Chrome/Firefox)
- `apps/mobile` — Capacitor Android/iOS (Kotlin/Swift native plugins + TS offline sync)
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
- Tailwind v4 with shared `@lockbox/design` OKLCH tokens and the local Iconify Tabler subset
- Auth: `session` → sessionStorage; `userKey`/`masterKey` → memory-only, never persisted
- Every feature must be implemented across all surfaces (web, extension, mobile) — no single-app features
- Commit and push often

## Testing

```bash
bun run test                           # All workspaces
cd apps/web && bun run test
cd apps/api && bun run test
cd apps/extension && bun run test
cd apps/mobile && bun run test
```

## Android Build Environment

- Build `apps/web` before Capacitor sync; Android packages `apps/web/dist`.
- Use a JDK from 17 through 24 for both the Gradle client and daemon. On this machine both the system JDK and Android Studio's bundled JBR are Java 25, which fails with `Unsupported class file major version 69` or during test-task creation. `-Dorg.gradle.java.home` alone is insufficient because the wrapper client may already be running on Java 25.
- In sandboxed Codex sessions, first check `/private/tmp/lockbox-jdk17/jdk-17.0.20+8/Contents/Home`. If it is absent, install a compatible JDK and update the command below; never assume Android Studio's JBR is compatible without checking `bin/java -version`.
- Keep Gradle and Android tool caches in a writable temporary path in sandboxed sessions.
- `local.properties` is ignored by git. Set `sdk.dir=/Users/ryan/Library/Android/sdk` when it is absent.
- API 36.1 is installed as `platforms/android-36.1`; the app module uses AGP's `compileSdk { version = release(36) { minorApiLevel = 1 } }` DSL and targets 36. Capacitor 6 library modules still use the legacy integer DSL, so the root compatibility values remain at installed API 35. Root Gradle also pins all Android library modules to the installed Build Tools 36.1.0 because AGP's default 35.0.0 is absent.

```bash
cd apps/web && bun run build
cd ../mobile && bun run build:android
cd android
JAVA_HOME="/private/tmp/lockbox-jdk17/jdk-17.0.20+8/Contents/Home" \
./gradlew --no-daemon \
  --gradle-user-home /private/tmp/lockbox-gradle-home \
  -Duser.home=/private/tmp/lockbox-android-home \
  -Dorg.gradle.java.home="/private/tmp/lockbox-jdk17/jdk-17.0.20+8/Contents/Home" \
  testDebugUnitTest lintDebug assembleDebug
```

## iOS Build Environment

- Build `apps/web` before Capacitor sync; iOS packages `apps/web/dist`.
- iOS 17 is the minimum deployment target because third-party passkey providers require the iOS 17 AuthenticationServices APIs.
- Install Xcode 26.2 or newer and CocoaPods. The newer SDK compiles password-save requests while the deployment target remains iOS 17. Open `apps/mobile/ios/App/App.xcworkspace`, not the `.xcodeproj`, for signed device and archive builds.
- Both the `App` and `CredentialProvider` targets require the AutoFill Credential Provider capability, the `group.dev.lockbox.app` App Group, and the shared Keychain group from their committed entitlements.
- `scripts/configure-ios-project.rb` idempotently restores native source membership and the embedded credential-provider target after recreating the Capacitor project.

```bash
cd apps/web && bun run build
cd ../mobile && bun run build:ios
cd ../..
open apps/mobile/ios/App/App.xcworkspace
```

## Deployment

- API → `bun run deploy:api` (Cloudflare Workers)
- Web → `bun run deploy:web` (Cloudflare Pages)
- Extension → manual build + Chrome Web Store / Firefox AMO
- Mobile → Capacitor build → Google Play Store / Apple App Store
