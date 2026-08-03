# Deploying Lockbox v1

This guide covers a self-hosted production deployment of the API, web vault, browser extension, and Android/iOS apps. Cloudflare and app-store limits, pricing, and review rules can change; verify them with each provider before release.

## Prerequisites

- Bun 1.3.10 or newer
- A Cloudflare account with Wrangler authenticated
- JDK 17 and Android SDK 36 for Android builds
- macOS, Xcode 15 or newer, and CocoaPods for iOS builds
- Chrome/Firefox developer accounts only if publishing to their stores
- A Google Play developer account and signing key only if publishing Android
- An Apple Developer account only if installing on devices or publishing iOS

Install the repository dependencies with the committed Bun lockfile:

```bash
bun install --frozen-lockfile
```

## 1. Deploy the API

The API uses these Cloudflare resources:

- Workers for the Hono API and nightly cleanup job
- D1 database `lockbox-vault`
- R2 bucket `lockbox-attachments`
- Workers rate-limit binding `AUTH_LIMITER`
- Worker secret `TOTP_ENCRYPTION_KEY` for account TOTP seed encryption

The repository does not contain a real D1 ID. `apps/api/wrangler.toml` intentionally uses an all-zero placeholder.

### Assisted deployment

Generate the TOTP encryption key once for the first deployment. It must remain
stable; losing or replacing it without the rotation procedure makes existing
authenticator codes unavailable.

```bash
export LOCKBOX_TOTP_ENCRYPTION_KEY="$(openssl rand -base64 32)"
bun run deploy:api
unset LOCKBOX_TOTP_ENCRYPTION_KEY
```

The script uploads the value as an encrypted Worker secret. On later deploys it
reuses the remote secret, so the shell variable is not required.

```bash
bun run deploy:api
```

The script:

1. authenticates Wrangler;
2. installs and builds the monorepo;
3. locates or creates `lockbox-vault`;
4. writes its ID to your local `apps/api/wrangler.toml`;
5. locates or creates the `lockbox-attachments` R2 bucket;
6. applies every migration in `apps/api/drizzle`;
7. deploys the Worker.

The default CORS list supports the default Pages URL, Vite on port 5173, and the Android WebView origin. Override it for a custom web origin:

```bash
LOCKBOX_CORS_ORIGINS=https://vault.example.com,https://localhost \
bun run deploy:api
```

The first-party deployment uses `https://api.authwell.app`. Its Worker custom domain is declared in `apps/api/wrangler.toml`. Control whether new hosted accounts can be created without affecting existing sign-ins:

```bash
LOCKBOX_REGISTRATION_ENABLED=false bun run deploy:api
```

Accepted disabled values are `false`, `0`, `off`, and `disabled`. Any other value, or an omitted value, leaves registration enabled.

If a browser build requires explicit extension-origin CORS, pass comma-separated IDs without a URI scheme:

```bash
LOCKBOX_EXTENSION_IDS=abcdefghijklmnopabcdefghijklmnop \
bun run deploy:api
```

The API fails closed for unknown browser origins. Requests without an `Origin` header, such as CLI or native HTTP requests, do not depend on CORS.

### Manual deployment

```bash
bunx wrangler d1 create lockbox-vault
bunx wrangler r2 bucket create lockbox-attachments
```

Copy the resulting ID into the local `database_id` field in `apps/api/wrangler.toml`, then run:

```bash
cd apps/api
export TOTP_ENCRYPTION_KEY="$(openssl rand -base64 32)"
printf '%s' "$TOTP_ENCRYPTION_KEY" | bunx wrangler secret put TOTP_ENCRYPTION_KEY
unset TOTP_ENCRYPTION_KEY
bunx wrangler d1 migrations apply lockbox-vault --remote
bunx wrangler deploy
```

For local Worker development, place the same format of key in
`apps/api/.dev.vars` as `TOTP_ENCRYPTION_KEY=...`. The repository ignores
`.dev.vars*`; never commit this value.

To rotate the key without immediately invalidating existing TOTP factors, keep
the old value in the `TOTP_ENCRYPTION_KEY_PREVIOUS` Worker secret while setting
the new value as `TOTP_ENCRYPTION_KEY`. Each successful TOTP operation rewraps
that account under the new key. Do not remove the previous key until every
active account has migrated or reset its factor.

Confirm the deployed health endpoint:

```bash
curl https://lockbox-api.YOUR_SUBDOMAIN.workers.dev/health
```

Do not expose the API through plain HTTP. Strict transport security and client configuration assume HTTPS.

## 2. Deploy the web vault

The API URL is compiled into the Vite bundle:

```bash
VITE_API_URL=https://lockbox-api.YOUR_SUBDOMAIN.workers.dev bun run deploy:web
```

The same build emits `/.well-known/lockbox.json`. The browser extension uses this
document to discover the Worker from the normal web-vault URL, then verifies the
Worker's Lockbox identity and protocol version through `/health`. Do not edit the
discovery document by hand; `VITE_API_URL` is its source of truth.

The deploy script creates or reuses a Cloudflare Pages project named `lockbox-web`. Override the name if it is unavailable:

```bash
LOCKBOX_PAGES_PROJECT=my-lockbox-web \
VITE_API_URL=https://lockbox-api.YOUR_SUBDOMAIN.workers.dev \
bun run deploy:web
```

After the Pages URL is known, make sure its exact origin appears in `CORS_ORIGINS` and redeploy the API. Origins are comma-separated and contain no trailing slash. The first-party Pages project uses `https://vault.authwell.app`; `https://authwell.app` is the separate marketing site.

For a manual build:

```bash
VITE_API_URL=https://lockbox-api.YOUR_SUBDOMAIN.workers.dev \
bun run --filter @lockbox/web build

cd apps/web
bunx wrangler pages deploy dist --project-name lockbox-web --commit-dirty=true
```

## 3. Build the browser extension

The extension asks for the normal web-vault URL on first run. It fetches the
well-known discovery document, verifies the discovered Worker, and stores both
origins locally. A direct Worker URL remains a compatibility fallback only when
its `/health` response positively identifies it as Lockbox. Build both targets:

```bash
bun run --filter @lockbox/extension build
bun run --filter @lockbox/extension build:firefox
```

Outputs:

- Chrome: `apps/extension/.output/chrome-mv3/`
- Firefox: `apps/extension/.output/firefox-mv2/`

For local Chrome testing, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the Chrome output directory. For Firefox, open `about:debugging#/runtime/this-firefox` and load the Firefox manifest as a temporary add-on.

The extension requests broad host access because password-field discovery, save prompts, autofill, phishing heuristics, and passkey interception must run on arbitrary sites. It does not request Chrome's remote-desktop-oriented `webAuthenticationProxy` permission. Store submissions should explain each permission and link to [PRIVACY.md](PRIVACY.md). The Firefox package declares the encrypted personal-data categories it can synchronize and requires Firefox 140 or newer so installation uses Firefox's built-in data-consent prompt.

### Store automation

`.github/workflows/deploy-extension.yml` runs for `v*` tags or manual dispatch. Configure these repository secrets before enabling submission:

| Secret                 | Purpose                           |
| ---------------------- | --------------------------------- |
| `CHROME_EXTENSION_ID`  | Existing Chrome Web Store item ID |
| `CHROME_PUBLISHER_ID`  | Chrome Web Store publisher ID     |
| `CHROME_CLIENT_ID`     | Chrome Web Store OAuth client     |
| `CHROME_CLIENT_SECRET` | Chrome Web Store OAuth secret     |
| `CHROME_REFRESH_TOKEN` | Chrome Web Store refresh token    |
| `FIREFOX_JWT_ISSUER`   | AMO API issuer                    |
| `FIREFOX_JWT_SECRET`   | AMO API secret                    |

The Firefox add-on ID is fixed in the manifest as `lockbox-password-manager@ryan12324.github.io`; register the AMO listing with that same ID. The workflow uploads a `git archive` of the tagged source alongside the bundled extension for AMO review. The manifest and package version must match the release tag. v1 uses `1.0.0`.

## 4. Build mobile clients

### Android

The Android app wraps the production web vault and adds native Autofill and Credential Provider services. Build the web assets with the API URL before syncing Capacitor:

```bash
VITE_API_URL=https://lockbox-api.YOUR_SUBDOMAIN.workers.dev \
bun run --filter @lockbox/web build

bun run --filter @lockbox/mobile build:android
```

Build and lint locally:

```bash
cd apps/mobile/android
./gradlew :app:assembleDebug :app:bundleRelease :app:lintRelease --no-daemon
```

Unsigned release bundles are useful only for verification. For a signed bundle, set:

```bash
export LOCKBOX_KEYSTORE_FILE=lockbox-release.jks
export LOCKBOX_KEYSTORE_PASSWORD=...
export LOCKBOX_KEY_ALIAS=lockbox
export LOCKBOX_KEY_PASSWORD=...
```

Then run `./gradlew :app:bundleRelease`. The output is:

```text
apps/mobile/android/app/build/outputs/bundle/release/app-release.aab
```

Never commit the keystore or its passwords. Back up the signing key independently; losing it can prevent future Play Store updates. Increment `versionCode` for every Play release and keep `versionName` aligned with the tag.

### Google Play automation

`.github/workflows/deploy-mobile.yml` builds and publishes on a `v*` tag or manual dispatch. It requires:

| Secret or variable          | Purpose                                     |
| --------------------------- | ------------------------------------------- |
| `ANDROID_KEYSTORE`          | Base64-encoded JKS file                     |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password                           |
| `ANDROID_KEY_ALIAS`         | Signing alias                               |
| `ANDROID_KEY_PASSWORD`      | Key password                                |
| `PLAY_SERVICE_ACCOUNT_JSON` | Base64-encoded Play service-account JSON    |
| `vars.VITE_API_URL`         | API URL compiled into the mobile web assets |

### iOS

The iOS app packages the same web vault and adds native encrypted offline storage, Face ID/Touch ID unlock, password AutoFill, and an iOS 17 passkey credential-provider extension. Build the production web assets before syncing Capacitor:

```bash
VITE_API_URL=https://lockbox-api.YOUR_SUBDOMAIN.workers.dev \
bun run --filter @lockbox/web build

bun run --filter @lockbox/mobile build:ios
```

Open the CocoaPods workspace and select an Apple development team for both `App` and `CredentialProvider`:

```bash
open apps/mobile/ios/App/App.xcworkspace
```

Run the iOS Simulator AutoFill form matrix before archiving:

```bash
bun run ios:test:autofill
```

The suite covers all 12 `/test` form contracts in the real Capacitor app. The
AuthenticationServices provider still uses the Simulator's normal Password
AutoFill enablement setting; no release code or test bypass enables it silently.

The committed targets use these identifiers:

| Target or capability | Identifier                 |
| -------------------- | -------------------------- |
| App                  | `dev.lockbox.app`          |
| AutoFill extension   | `dev.lockbox.app.autofill` |
| Shared App Group     | `group.dev.lockbox.app`    |

Enable the AutoFill Credential Provider capability and App Group for both App IDs in the Apple Developer portal. The shared Keychain group in the committed entitlements is expanded with your team prefix at signing time. If these identifiers belong to another team, replace them consistently in the Xcode project, both entitlement files, both Info plists, `AuthwellShared.swift`, and `scripts/configure-ios-project.rb`.

For a local signed and structurally verified archive, run:

```bash
IOS_DEVELOPMENT_TEAM=YOUR_TEAM_ID \
IOS_ALLOW_PROVISIONING_UPDATES=1 \
bun run build:ios:release
```

Alternatively, choose a Generic iOS Device in Xcode and use **Product → Archive**. Before App Store submission, verify password AutoFill, passkey registration/assertion, biometric cancellation, offline edits, relaunch persistence, logout index clearing, and pending-passkey upload on a physical iOS 17+ device. Simulator builds do not exercise Secure Enclave behavior.

Authwell implements and uses encryption, so the App Store Connect account owner must complete Apple's export-compliance determination before TestFlight or App Store distribution. The repository intentionally does not guess `ITSAppUsesNonExemptEncryption` or commit an `ITSEncryptionExportComplianceCode`: answer the App Store Connect questions for the intended distribution regions, upload any required documentation, then add the values Apple provides to the app Info plist. Do not mark the app exempt without that determination.

## 5. Configure GitHub Actions

The required Cloudflare repository secrets are:

| Secret                         | Purpose                                       |
| ------------------------------ | --------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`         | Worker, D1, R2, and Pages deployment          |
| `CLOUDFLARE_ACCOUNT_ID`        | Target Cloudflare account                     |
| `TOTP_ENCRYPTION_KEY`          | Stable 32-byte Base64 account TOTP key        |
| `TOTP_ENCRYPTION_KEY_PREVIOUS` | Optional old key during a controlled rotation |

The API deployment also requires these repository variables:

| Variable                    | Required    | Purpose                                       |
| --------------------------- | ----------- | --------------------------------------------- |
| `CLOUDFLARE_D1_DATABASE_ID` | Yes         | Real UUID for `lockbox-vault`                 |
| `CORS_ORIGINS`              | Recommended | Exact comma-separated web/mobile origins      |
| `EXTENSION_IDS`             | Optional    | Comma-separated extension origin IDs          |
| `REGISTRATION_ENABLED`      | Optional    | Set `false` to pause creation of new accounts |

Web and mobile workflows require:

| Variable       | Purpose                   |
| -------------- | ------------------------- |
| `VITE_API_URL` | Deployed HTTPS Worker URL |

The API workflow patches only its ephemeral checkout; the repository keeps the all-zero placeholder. It applies D1 migrations before deploying the Worker.

## 6. Upgrade and rollback discipline

Before upgrading a production instance:

1. export or back up D1 and R2 using your Cloudflare account tooling;
2. run the full local/CI release gates;
3. apply migrations before deploying clients that depend on them;
4. deploy the API, then web, extension, and Android/iOS clients;
5. verify registration, login with and without 2FA, vault CRUD, sync, attachment upload/download, share redemption, and logout;
6. retain the previous client artifacts until the new release is verified.

Migrations are forward-only. Do not manually delete migration history or reorder SQL files. A source rollback may not reverse a schema migration, so test restores from backups before relying on them.

## 7. Release checklist

```bash
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run test
bun run build
bun run --filter @lockbox/extension build:firefox
```

Also verify:

- all package, extension, CLI, Android `versionName`, and iOS marketing versions match;
- Android `versionCode` is higher than the last published bundle;
- iOS `CURRENT_PROJECT_VERSION` is higher than the last published build;
- the D1 migration journal includes every numbered migration;
- `CORS_ORIGINS` contains the production Pages/custom-domain and Android origins;
- production builds contain the intended `VITE_API_URL`;
- both signed iOS targets carry the same App Group and Keychain access groups;
- no decrypted exports, API tokens, store credentials, or keystores are tracked;
- the no-recovery warning and 2FA backup-code flow have been tested;
- deferred v1 features are absent from normal navigation.

Create the release tag only after those checks:

```bash
git tag v1.0.0
git push origin v1.0.0
```

## Troubleshooting

### D1 database not found

Run `bun run deploy:api` once, or create `lockbox-vault` manually and set the local Wrangler `database_id`. In CI, set `CLOUDFLARE_D1_DATABASE_ID`; committing a personal account ID is not required.

### Browser reports a CORS error

Use the exact origin shown in the browser console, without a path or trailing slash. Add it to the comma-separated `CORS_ORIGINS` value and redeploy the API. Never use `*` for authenticated vault responses.

### Extension cannot reach the API

Enter the web-vault URL, not the Worker URL. Confirm the web deployment returns
valid JSON from `/.well-known/lockbox.json`, and that its `apiBaseUrl` returns a
Lockbox-identified `/health` response. Redeploy the API first and the web vault
second when upgrading this protocol. If the browser enforces extension-origin
CORS for the request path, add its actual origin ID through `EXTENSION_IDS` and
redeploy.

### Android app cannot reach the API

Confirm `VITE_API_URL` was present during the web build that Capacitor copied, the URL is HTTPS, and `https://localhost` is allowed by API CORS. Production Android forbids cleartext traffic.

### Android release is unsigned

All four `LOCKBOX_*` signing variables must be present. The keystore path is resolved from `apps/mobile/android/app`; use an absolute path locally if in doubt.

### iOS AutoFill extension shows no credentials

Enable Authwell under **Settings → General → AutoFill & Passwords**, then unlock the vault once so the app can publish its biometric-gated index. Confirm that both signed targets use the same `group.dev.lockbox.app` App Group and shared Keychain access group. A provisioning-profile mismatch prevents the extension from reading the shared encrypted database.

### Share links open but do not decrypt

The complete URL fragment after `#` must be preserved. Fragments are intentionally unavailable to the server. Expired or exhausted links return HTTP 410 and cannot be revived.
