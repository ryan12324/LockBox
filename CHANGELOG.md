# Changelog

## 1.0.0 — 2026-07-31

Initial release-ready v1 baseline.

- Zero-knowledge web vault with six item types, folders, trash, version history, encrypted attachments/documents, import/export, generator, security health, and TOTP account 2FA.
- Chrome/Firefox extension with autofill, save/update prompts, TOTP, manual breach checks, shared items, attachments, and passkey WebAuthn support with native fallback.
- Android application with production HTTPS policy, protected screens, native Autofill, biometric-bound credential index, Credential Provider passkeys, and release build/lint configuration.
- Cloudflare Workers backend with D1 migrations, R2 storage lifecycle, delta sync, travel-mode filtering, teams/shared folders, limited share links, strict CORS, rate limiting, request-size enforcement, and cleanup jobs.
- CLI session, list, get, create, generate, and export commands.
- Security hardening for pre-auth 2FA challenges, authorization boundaries, share redemption, folder membership, key validation, item metadata/version integrity, atomic registration, duplicate races, and storage cleanup.
- Release metadata, product icons, privacy/security notices, Firefox data-consent metadata, deployment automation, and a refreshed dependency lockfile with documented upstream audit exceptions.
- Hardware-key login, recovery kits, emergency access, QR onboarding/scanning, simulated AI assistant surfaces, automatic breach monitoring, real-time sync notifications, and hash-only URL reputation were deferred from v1 and scoped in `V2_SCOPE.md`.
