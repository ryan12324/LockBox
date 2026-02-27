# Deploying Lockbox

Lockbox is designed to be self-hosted. This guide walks through deploying every component — from a quick 1-click backend deploy to the full CI/CD pipeline with automated store submissions.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Quick Start: 1-Click Backend Deploy](#quick-start-1-click-backend-deploy)
- [GitHub Actions CI/CD](#github-actions-cicd)
  - [CI (Automated Testing)](#ci-automated-testing)
  - [Deploy API (Cloudflare Workers)](#deploy-api-cloudflare-workers)
  - [Deploy Web Vault (Cloudflare Pages)](#deploy-web-vault-cloudflare-pages)
  - [Deploy Browser Extension (Chrome + Firefox)](#deploy-browser-extension-chrome--firefox)
  - [Deploy Mobile App (Google Play)](#deploy-mobile-app-google-play)
- [Connecting Clients to Your Backend](#connecting-clients-to-your-backend)
- [Secrets Reference](#secrets-reference)
- [Troubleshooting](#troubleshooting)

---

## Architecture Overview

| Component | Directory        | Stack                              | Deploy Target                 |
| --------- | ---------------- | ---------------------------------- | ----------------------------- |
| API       | `apps/api`       | Hono, Drizzle, D1, Durable Objects | Cloudflare Workers            |
| Web Vault | `apps/web`       | React, Vite, Tailwind              | Cloudflare Pages              |
| Extension | `apps/extension` | WXT, React                         | Chrome Web Store, Firefox AMO |
| Mobile    | `apps/mobile`    | Capacitor, Android                 | Google Play Store             |

The API is the only server-side component. Everything else is a client that talks to it. Deploy the API first, then point the clients at it.

---

## Prerequisites

- [bun](https://bun.sh) v1.3.10+
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
- [wrangler](https://developers.cloudflare.com/workers/wrangler/) — installed globally or via `bunx`

---

## Quick Start: 1-Click Deploy

The fastest way to get the API running on your own Cloudflare account:

```bash
git clone https://github.com/YOUR_USER/lockbox.git
cd lockbox
bun run deploy:api
```

This runs `scripts/deploy-backend.sh`, which will:

1. Prompt you to log in to Cloudflare (if not already authenticated)
2. Install dependencies and build all packages
3. Create a D1 database called `lockbox-vault` (skipped if it already exists)
4. Patch `apps/api/wrangler.toml` with the real database ID
5. Apply D1 schema migrations
6. Deploy the Worker

When it finishes, you'll see your API URL:

```
✓ Worker deployed

  API URL: https://lockbox-api.YOUR_SUBDOMAIN.workers.dev

  Next steps:
  Set this as your API URL when building the web vault or extension:
  VITE_API_URL=https://lockbox-api.YOUR_SUBDOMAIN.workers.dev bun run build
```

Save that URL — you'll need it for every client.

### 1-Click Web Vault Deploy

Once the API is running, deploy the web vault with one command:

```bash
bun run deploy:web
```

This runs `scripts/deploy-web.sh`, which will:

1. Prompt you to log in to Cloudflare (if not already authenticated)
2. Ask for your API URL (or read it from `VITE_API_URL` env var / `.env.local`)
3. Install dependencies and build all packages
4. Deploy the web vault to Cloudflare Pages

When it finishes, you'll see your Pages URL:

```
✓ Deployed to Cloudflare Pages

  Web Vault: https://lockbox-web.pages.dev
  API:       https://lockbox-api.YOUR_SUBDOMAIN.workers.dev
```

**Tip:** Save the API URL so you don't have to enter it every time:

```bash
echo "VITE_API_URL=https://lockbox-api.YOUR_SUBDOMAIN.workers.dev" > .env.local
```

You can also pass the API URL directly:

```bash
VITE_API_URL=https://lockbox-api.YOUR_SUBDOMAIN.workers.dev bun run deploy:web
```
---

## GitHub Actions CI/CD

For automated deployments, the repo includes 5 workflows in `.github/workflows/`.

### CI (Automated Testing)

**File:** `.github/workflows/ci.yml`
**Triggers:** Every push to `main`, every pull request

Runs the full check suite across the entire monorepo via Turborepo:

- Lint (`eslint`)
- Typecheck (`tsc --noEmit`)
- Test (`vitest`)
- Build (all apps + packages)

No secrets required. This works out of the box once you push to GitHub.

---

### Deploy API (Cloudflare Workers)

**File:** `.github/workflows/deploy-api.yml`
**Triggers:**

- Automatically on push to `main` when `apps/api/**`, `packages/**`, or `bun.lock` change
- Manually via Actions tab → "Deploy API" → "Run workflow"

#### Setup

1. **Create a Cloudflare API token:**
   - Go to [Cloudflare Dashboard → API Tokens](https://dash.cloudflare.com/profile/api-tokens)
   - Click "Create Token"
   - Use the **"Edit Cloudflare Workers"** template
   - Scope it to your account and the zone you want (or all zones)
   - Copy the token

2. **Get your Account ID:**
   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
   - Select any domain (or Workers & Pages)
   - Your Account ID is in the right sidebar, or in the URL: `dash.cloudflare.com/<ACCOUNT_ID>/...`

3. **Create the D1 database** (one-time, before first deploy):

   ```bash
   bunx wrangler d1 create lockbox-vault
   ```

   Copy the `database_id` from the output and update `apps/api/wrangler.toml`:

   ```toml
   database_id = "your-actual-database-id"
   ```

   Commit this change. (Or use the 1-click script, which does this automatically.)

4. **Add GitHub secrets:**

   Go to your repo → Settings → Secrets and variables → Actions → "New repository secret":

   | Secret                  | Value                       |
   | ----------------------- | --------------------------- |
   | `CLOUDFLARE_API_TOKEN`  | The API token from step 1   |
   | `CLOUDFLARE_ACCOUNT_ID` | Your account ID from step 2 |

That's it. Push to `main` and the API deploys automatically.

---

### Deploy Web Vault (Cloudflare Pages)

**File:** `.github/workflows/deploy-web.yml`
**Triggers:**

- Automatically on push to `main` when `apps/web/**`, `packages/**`, or `bun.lock` change
- Manually via Actions tab → "Deploy Web Vault" → "Run workflow"

#### Setup

1. **Same Cloudflare secrets as the API** — `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (already set if you configured the API deploy).

2. **Set the API URL variable:**

   Go to your repo → Settings → Secrets and variables → Actions → **Variables** tab → "New repository variable":

   | Variable       | Value                                                                      |
   | -------------- | -------------------------------------------------------------------------- |
   | `VITE_API_URL` | Your API Worker URL, e.g. `https://lockbox-api.YOUR_SUBDOMAIN.workers.dev` |

   This gets baked into the web vault at build time.

3. **First deploy creates the Pages project.** Wrangler will create a Cloudflare Pages project called `lockbox-web` automatically on the first deploy. No manual setup needed.

After setup, any change to the web vault or shared packages auto-deploys to `https://lockbox-web.pages.dev` (or your custom domain).

---

### Deploy Browser Extension (Chrome + Firefox)

**File:** `.github/workflows/deploy-extension.yml`
**Triggers:**

- Pushing a version tag (`v*`, e.g. `v0.1.0`)
- Manually via Actions tab → "Deploy Extension" → "Run workflow" (with target: `all`, `chrome`, or `firefox`)

Store submissions are intentionally manual/tag-triggered — reviews take time, and you don't want to submit on every commit.

#### Chrome Web Store Setup

1. **Register as a Chrome Web Store developer** at [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) ($5 one-time fee).

2. **Upload the extension manually the first time** to establish the listing. You can build it locally:

   ```bash
   cd apps/extension
   bun run build
   cd .output/chrome-mv3
   zip -r ../../chrome-extension.zip .
   ```

   Upload `chrome-extension.zip` through the developer dashboard.

3. **Get your Extension ID** from the dashboard URL or listing page. It looks like: `abcdefghijklmnopabcdefghijklmnop`.

4. **Create OAuth credentials** for the Chrome Web Store API:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a project (or use an existing one)
   - Enable the **Chrome Web Store API**
   - Go to Credentials → Create OAuth 2.0 Client ID (Desktop app)
   - Note the **Client ID** and **Client Secret**

5. **Get a refresh token:**

   ```bash
   npx chrome-webstore-upload-cli init \
     --client-id YOUR_CLIENT_ID \
     --client-secret YOUR_CLIENT_SECRET
   ```

   Follow the browser flow. It will print a **refresh token**.

6. **Add GitHub secrets:**

   | Secret                 | Value                           |
   | ---------------------- | ------------------------------- |
   | `CHROME_EXTENSION_ID`  | Your extension ID from step 3   |
   | `CHROME_CLIENT_ID`     | OAuth client ID from step 4     |
   | `CHROME_CLIENT_SECRET` | OAuth client secret from step 4 |
   | `CHROME_REFRESH_TOKEN` | Refresh token from step 5       |

#### Firefox AMO Setup

1. **Create a developer account** at [Firefox Add-on Developer Hub](https://addons.mozilla.org/developers/).

2. **Submit the extension manually the first time** to create the listing. Build it locally:

   ```bash
   cd apps/extension
   bun run build:firefox
   cd .output/firefox-mv2
   zip -r ../../firefox-extension.zip .
   ```

   Upload `firefox-extension.zip` at [Submit a New Add-on](https://addons.mozilla.org/developers/addon/submit/).

3. **Generate API credentials:**
   - Go to [AMO API Keys](https://addons.mozilla.org/developers/addon/api/key/)
   - Note the **JWT issuer** and **JWT secret**

4. **Choose an extension ID** — this is an email-style identifier, e.g. `lockbox@lockbox.dev`. Set it in the AMO listing settings.

5. **Add GitHub secrets:**

   | Secret                 | Value                                                |
   | ---------------------- | ---------------------------------------------------- |
   | `FIREFOX_JWT_ISSUER`   | JWT issuer from step 3                               |
   | `FIREFOX_JWT_SECRET`   | JWT secret from step 3                               |
   | `FIREFOX_EXTENSION_ID` | Extension ID from step 4, e.g. `lockbox@lockbox.dev` |

#### Publishing a New Extension Version

```bash
# Tag a release — triggers both Chrome and Firefox deploys
git tag v0.1.0
git push origin v0.1.0
```

Or go to Actions → "Deploy Extension" → "Run workflow" and select which store to target.

---

### Deploy Mobile App (Google Play)

**File:** `.github/workflows/deploy-mobile.yml`
**Triggers:**

- Pushing a version tag (`v*`, e.g. `v0.1.0`)
- Manually via Actions tab → "Deploy Mobile" → "Run workflow" (with track: `internal`, `alpha`, `beta`, or `production`)

Default track is `internal` (internal testing). Promote to production when ready.

#### Android Signing Setup

1. **Generate a signing keystore** (one-time):

   ```bash
   keytool -genkeypair \
     -v \
     -storetype JKS \
     -keyalg RSA \
     -keysize 2048 \
     -validity 10000 \
     -storepass YOUR_STORE_PASSWORD \
     -keypass YOUR_KEY_PASSWORD \
     -alias lockbox \
     -keystore lockbox-release.jks \
     -dname "CN=Lockbox, O=Lockbox, L=Unknown, ST=Unknown, C=US"
   ```

2. **Base64-encode the keystore:**

   ```bash
   base64 -w 0 lockbox-release.jks
   ```

   Copy the full output string.

3. **Add GitHub secrets:**

   | Secret                      | Value                                   |
   | --------------------------- | --------------------------------------- |
   | `ANDROID_KEYSTORE`          | Base64-encoded keystore from step 2     |
   | `ANDROID_KEYSTORE_PASSWORD` | The `YOUR_STORE_PASSWORD` you used      |
   | `ANDROID_KEY_ALIAS`         | `lockbox` (or whatever alias you chose) |
   | `ANDROID_KEY_PASSWORD`      | The `YOUR_KEY_PASSWORD` you used        |

   > Keep the original `lockbox-release.jks` file somewhere safe. If you lose it, you can never update the app on Google Play.

#### Google Play Setup

1. **Register as a Google Play developer** at [Google Play Console](https://play.google.com/console/) ($25 one-time fee).

2. **Create your app listing** in the Play Console. You need to complete the store listing, content rating, and pricing before you can upload builds.

3. **Upload the first AAB manually:**
   Build locally:

   ```bash
   # Build web assets first (the mobile app wraps them)
   bun run build

   # Sync and build Android
   cd apps/mobile
   npx cap sync android
   cd android
   ./gradlew :app:bundleRelease
   ```
cd 
   Upload the AAB from `apps/mobile/android/app/build/outputs/bundle/release/app-release.aab` through the Play Console → Internal testing track.

4. **Create a Google Cloud service account** for automated uploads:
   - Go to [Google Cloud Console](https://console.cloud.google.com/) → IAM & Admin → Service Accounts
   - Create a service account
   - Grant no roles (Play Console handles permissions)
   - Create a JSON key and download it

5. **Link the service account to Play Console:**
   - Go to [Play Console](https://play.google.com/console/) → Settings → API access
   - Link your Google Cloud project
   - Grant the service account **"Release manager"** permission for your app

6. **Base64-encode the service account JSON:**

   ```bash
   base64 -w 0 service-account.json
   ```

7. **Add the GitHub secret:**

   | Secret                      | Value                                           |
   | --------------------------- | ----------------------------------------------- |
   | `PLAY_SERVICE_ACCOUNT_JSON` | Base64-encoded service account JSON from step 6 |

8. **Set the API URL** (same variable as the web vault):

   | Variable       | Value                                                          |
   | -------------- | -------------------------------------------------------------- |
   | `VITE_API_URL` | Your API Worker URL (already set if you configured web deploy) |

#### Publishing a New Mobile Version

Before tagging a release, bump the version in `apps/mobile/android/app/build.gradle`:

```groovy
versionCode 2        // Increment this every release (Play Store requires it)
versionName "0.1.0"  // Human-readable version
```

Then tag and push:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Or use Actions → "Deploy Mobile" → "Run workflow" and pick a track.

---

## Connecting Clients to Your Backend

Every client needs to know the API URL. After deploying the API, set this wherever you build clients:

| Client        | How to configure                                                                            |
| ------------- | ------------------------------------------------------------------------------------------- |
| **Web Vault** | Set `VITE_API_URL` environment variable at build time                                       |
| **Extension** | Set `VITE_API_URL` environment variable at build time                                       |
| **Mobile**    | Set `VITE_API_URL` environment variable at build time (baked into web assets via Capacitor) |

For local development:

```bash
# Create a .env.local at the repo root (gitignored)
echo "VITE_API_URL=https://lockbox-api.YOUR_SUBDOMAIN.workers.dev" > .env.local
```

For CI, this is handled by the `VITE_API_URL` repository variable — set it once and all deploy workflows use it.

---

## Secrets Reference

Complete list of every secret and variable used across all workflows.

### Repository Secrets

| Secret                      | Used by   | How to get it                                                                                                |
| --------------------------- | --------- | ------------------------------------------------------------------------------------------------------------ |
| `CLOUDFLARE_API_TOKEN`      | API, Web  | [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens) — "Edit Cloudflare Workers" template |
| `CLOUDFLARE_ACCOUNT_ID`     | API, Web  | [Cloudflare Dashboard](https://dash.cloudflare.com) sidebar                                                  |
| `CHROME_EXTENSION_ID`       | Extension | Chrome Web Store Developer Dashboard                                                                         |
| `CHROME_CLIENT_ID`          | Extension | [Google Cloud Console](https://console.cloud.google.com/) OAuth 2.0 credentials                              |
| `CHROME_CLIENT_SECRET`      | Extension | Same as above                                                                                                |
| `CHROME_REFRESH_TOKEN`      | Extension | `npx chrome-webstore-upload-cli init`                                                                        |
| `FIREFOX_JWT_ISSUER`        | Extension | [AMO API Keys](https://addons.mozilla.org/developers/addon/api/key/)                                         |
| `FIREFOX_JWT_SECRET`        | Extension | Same as above                                                                                                |
| `FIREFOX_EXTENSION_ID`      | Extension | Your chosen ID, e.g. `lockbox@lockbox.dev`                                                                   |
| `ANDROID_KEYSTORE`          | Mobile    | `base64 -w 0 lockbox-release.jks`                                                                            |
| `ANDROID_KEYSTORE_PASSWORD` | Mobile    | Password you set when generating the keystore                                                                |
| `ANDROID_KEY_ALIAS`         | Mobile    | Alias you set (e.g. `lockbox`)                                                                               |
| `ANDROID_KEY_PASSWORD`      | Mobile    | Key password you set                                                                                         |
| `PLAY_SERVICE_ACCOUNT_JSON` | Mobile    | `base64 -w 0 service-account.json` from Google Cloud                                                         |

### Repository Variables

| Variable       | Used by     | Value                                                                        |
| -------------- | ----------- | ---------------------------------------------------------------------------- |
| `VITE_API_URL` | Web, Mobile | Your deployed API URL, e.g. `https://lockbox-api.YOUR_SUBDOMAIN.workers.dev` |

---

## Troubleshooting

### "D1 database not found" during API deploy

The D1 database must be created before the first CI deploy. Either:

- Run `bun run deploy:api` locally once (creates it automatically), or
- Run `bunx wrangler d1 create lockbox-vault` and update `apps/api/wrangler.toml` with the real `database_id`

### "placeholder-replace-at-deploy" error

You haven't replaced the placeholder database ID in `apps/api/wrangler.toml`. The 1-click script does this automatically. If deploying via CI, create the database first and commit the real ID.

### Web vault shows "network error" or can't reach API

Check that `VITE_API_URL` is set correctly. This is baked in at build time — changing it requires a rebuild. Verify with:

```bash
# After building
grep -r "workers.dev" apps/web/dist/
```

### Chrome Web Store upload fails with 401

Your refresh token may have expired. Re-run:

```bash
npx chrome-webstore-upload-cli init \
  --client-id YOUR_CLIENT_ID \
  --client-secret YOUR_CLIENT_SECRET
```

And update the `CHROME_REFRESH_TOKEN` secret.

### Android build fails with "No signing config"

The signing config is only applied when the `LOCKBOX_KEYSTORE_FILE` environment variable is set. Locally, builds produce unsigned debug APKs. In CI, the workflow sets this automatically from secrets.

### Play Store rejects the upload

Common reasons:

- **versionCode not incremented** — Play Store requires a higher `versionCode` on every upload. Bump it in `apps/mobile/android/app/build.gradle`.
- **Missing store listing** — Complete all required fields in the Play Console before uploading.
- **Service account permissions** — Make sure the service account has "Release manager" permission in Play Console → Settings → API access.
