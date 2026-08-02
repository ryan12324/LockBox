<p align="center">
  <img src="assets/branding/authwell/authwell-logo-horizontal.png" alt="Authwell" width="420" />
</p>

# Authwell

Authwell is a self-hosted, zero-knowledge password manager for technically comfortable users who want to run their own backend. Vault plaintext and encryption keys stay on the client; the Cloudflare backend stores ciphertext and synchronization metadata.

Version 1.0.0 includes a marketing site, web vault, Chrome/Firefox extension, Android and iOS apps, CLI, and Cloudflare Workers API.

> Authwell has not received an independent security audit. Review the code and threat model before trusting it with critical credentials. Self-hosting transfers operational responsibility to you, including Cloudflare access, backups, updates, and cost controls.

## What ships in v1

- Login, secure-note, card, identity, passkey, and encrypted-document vault items
- Folders, tags, favorites, trash retention, version history, import, and encrypted export
- Client-side Argon2id/PBKDF2 key derivation and AES-256-GCM encryption with AAD binding
- Account TOTP two-factor authentication with one-time backup codes
- Password/passphrase generation and manual HIBP k-anonymity breach checks
- Encrypted attachments and document blobs in Cloudflare R2
- Team membership, per-member RSA-OAEP folder-key wrapping, shared folders, and limited share links
- Chrome/Firefox autofill, save/update prompts, TOTP, and passkey WebAuthn support with native fallback
- Android and iOS AutoFill/Credential Provider integration with a biometric-bound local index
- Opt-in device unlock: Face ID/Touch ID, Android BiometricPrompt + Keystore, and desktop WebAuthn PRF vault-key unwrapping
- Delta sync, travel mode, and soft-delete cleanup

The product deliberately does not expose hardware-key login, emergency-access recovery, QR secret transfer, or an AI chat assistant in v1. Those flows require complete interoperable protocols before they can be presented as security features.

The complete inventory of v1 removals, prerequisites, sequencing, and acceptance criteria is maintained in [V2_SCOPE.md](V2_SCOPE.md).

## Security model

1. The master password is stretched on the client and never sent to the server.
2. A random user key encrypts vault items; the user key is itself encrypted by the derived master key.
3. Each item is bound to its ID and revision through AES-GCM additional authenticated data.
4. The API authenticates a derived auth hash and stores only encrypted vault payloads.
5. Shared folders use a random folder key wrapped separately to each member's validated RSA-OAEP public key.
6. Share-link secrets live in the URL fragment. The server receives a derived bearer token and stores only its SHA-256 hash.
7. HIBP checks are manual. Only the first five characters of a password's SHA-1 hash are sent to the Pwned Passwords range API.
8. Device unlock never stores the master password. Each enabled device keeps only an account-scoped wrapped user key; a live matching session is required before biometric or WebAuthn PRF release.

There is no master-password recovery in v1. Losing the master password means losing access to the vault. Two-factor backup codes recover only the second factor; they do not replace the master password.

## Architecture

| Component | Path             | Runtime                                 |
| --------- | ---------------- | --------------------------------------- |
| Marketing | `apps/marketing` | vinext on Cloudflare                    |
| API       | `apps/api`       | Cloudflare Workers, Hono, D1, and R2    |
| Web vault | `apps/web`       | React, Vite, Cloudflare Pages           |
| Extension | `apps/extension` | WXT, React, Chrome/Firefox              |
| Mobile    | `apps/mobile`    | Capacitor plus native Kotlin/Swift services |
| CLI       | `apps/cli`       | Bun/Node-compatible command line client |

Shared packages under `packages/` provide cryptography, types, TOTP, password generation, local security analysis, and design components.

### Hosted Authwell domains

- `https://authwell.app` is the public product and download site.
- `https://vault.authwell.app` is the first-party web vault and extension discovery origin.
- `https://api.authwell.app` is the first-party API used by hosted web, mobile, extension, and CLI clients.

Self-hosted clients can continue to override the vault and API origins. The hosted API controls new account creation with the `REGISTRATION_ENABLED` Worker variable; existing accounts can sign in while registration is closed.

### Android app URIs

Login items can target native Android applications with the standard package URI form:

```text
androidapp://android.octopusenergy.octopus.energy
```

Use **Add Android app** in the login editor and enter the package name shown in the app's Play Store URL. Existing HTTPS-shaped package entries such as `https://android.octopusenergy.octopus.energy/` remain compatible with Android autofill, but `androidapp://` is preferred because it is explicitly isolated from browser matching.

Cloudflare resource usage may incur charges depending on your plan and traffic. Consult the current Cloudflare pricing and limits for Workers, D1, R2, and rate limiting.

## Quick start

Prerequisites:

- Bun 1.3.10 or newer
- A Cloudflare account
- Wrangler authentication (`bunx wrangler login`)

Clone and deploy the backend:

```bash
git clone https://github.com/ryan12324/LockBox.git
cd LockBox
bun run deploy:api
```

The script installs dependencies, creates or locates `lockbox-vault` and `lockbox-attachments`, writes the D1 ID into the local Wrangler config, applies all migrations, and deploys the Worker.

Then deploy the web vault using the Worker URL printed by the first command:

```bash
VITE_API_URL=https://lockbox-api.YOUR_SUBDOMAIN.workers.dev bun run deploy:web
```

If the default Pages project name is unavailable, provide your own:

```bash
LOCKBOX_PAGES_PROJECT=my-lockbox-web \
VITE_API_URL=https://lockbox-api.YOUR_SUBDOMAIN.workers.dev \
bun run deploy:web
```

After deployment, configure the API's `CORS_ORIGINS` for the exact web origin and `EXTENSION_IDS` for any installed browser-extension IDs, then redeploy. The default configuration includes the default Pages URL, Vite development, and the Android WebView origin. See [DEPLOYING.md](DEPLOYING.md) for CI, extension, Android/iOS signing, CORS, and store-release instructions.

On first run, give the extension the web-vault URL. The web deployment publishes
versioned discovery metadata so the extension can locate and verify the Worker
without asking the user for an API URL.

## Local development

```bash
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run test
bun run build
```

Run individual clients:

```bash
bun run --filter @lockbox/web dev
bun run --filter @lockbox/extension dev
bun run --filter @lockbox/cli dev -- --help
bun run android:run
bun run ios:simulator
```

Build release clients:

```bash
bun run --filter @lockbox/extension build
bun run --filter @lockbox/extension build:firefox
bun run --filter @lockbox/mobile build:android
bun run --filter @lockbox/mobile build:ios
```

The Android build additionally requires JDK 17 and Android SDK 36. Release signing uses the `LOCKBOX_KEYSTORE_FILE`, `LOCKBOX_KEYSTORE_PASSWORD`, `LOCKBOX_KEY_ALIAS`, and `LOCKBOX_KEY_PASSWORD` environment variables. The iOS build requires macOS, Xcode 15 or newer, CocoaPods, and an Apple development team configured for the app and AutoFill extension targets.

## Deployment configuration

The committed `apps/api/wrangler.toml` contains an all-zero D1 placeholder so a clone is not tied to another account. Use one of these paths:

- `bun run deploy:api` discovers or creates the database and patches the local config.
- GitHub Actions reads the database ID from the `CLOUDFLARE_D1_DATABASE_ID` repository variable.

Do not commit account credentials, API tokens, extension-store credentials, signing keys, or decrypted vault exports. API keys for email-alias providers are encrypted client-side before server storage.

## Release gates

CI runs lint, TypeScript checks, Vitest and Swift contract suites, production builds, Chrome/Firefox extension builds, Android debug/release gates, and an unsigned iOS archive. Before publishing either mobile client, run the signed Android or iOS release checks described in [DEPLOYING.md](DEPLOYING.md).

## License

See the [privacy notice](PRIVACY.md) and [security policy](SECURITY.md). Authwell is licensed under the [MIT License](LICENSE).
