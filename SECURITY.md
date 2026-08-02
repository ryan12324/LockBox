# Security policy

## Reporting a vulnerability

Please use GitHub's private vulnerability-reporting or security-advisory feature for this repository. Do not open a public issue containing exploit details, credentials, tokens, decrypted vault material, or a production endpoint that can be abused.

Include the affected commit or version, component, reproduction steps, impact, and any suggested mitigation. Remove real secrets and personal vault data from logs or screenshots.

## Supported version

Security fixes target the current `1.x` release line. Self-hosters are responsible for monitoring releases and deploying API migrations and updated clients. Older clients may not understand newer security or sync invariants and should not be kept in production indefinitely.

## Threat model

Authwell is designed so the backend stores encrypted vault payloads and does not possess the master password, master key, user key, shared-folder keys, or share-link fragment secret. Client cryptography uses AES-256-GCM with contextual AAD; account secrets are derived with configured Argon2id or PBKDF2 parameters; shared-folder keys are wrapped with validated RSA-OAEP-2048/SHA-256 keys.

Optional device unlock never stores the master password. Android stores an account-scoped vault-key envelope encrypted by a non-exportable, per-use biometric Keystore key. iOS stores an ECIES vault-key envelope whose unwrap key is protected by Secure Enclave/Keychain `biometryCurrentSet`. Desktop web stores a local AES-GCM envelope whose wrapping key is derived from the selected WebAuthn credential's PRF output. A live matching account session is checked before any device wrapper is released; missing credentials, changed biometric enrollment, unavailable PRF output, or revoked sessions fall back to the master-password sign-in path.

The design does not protect against:

- a compromised or malicious client device, browser extension, browser, keyboard, or operating system;
- an attacker who learns the master password or accesses an unlocked vault;
- a malicious build or deployment operator who changes the served client code;
- denial of service, traffic analysis, or encrypted-data deletion by the hosting provider/account owner;
- weak master passwords, insecure Cloudflare credentials, lost signing keys, or inadequate backups;
- vulnerabilities that have not been found through an independent audit.

There is no master-password recovery in v1. Two-factor backup codes recover only the second factor. Hardware-key login, emergency access, and QR-based secret transfer are intentionally unavailable.

## Deployment requirements

- Serve every production client and API endpoint over HTTPS.
- Restrict `CORS_ORIGINS` and `EXTENSION_IDS` to expected clients; never use a wildcard for authenticated responses.
- Protect Cloudflare, GitHub, browser-store, Play Store, and Android signing credentials with strong MFA.
- Back up D1, R2, configuration, and Android signing material independently and test restoration.
- Apply migrations before deploying clients that require them.
- Treat decrypted exports as high-risk secrets and securely remove them after use.
- Review dependency and platform advisories before each release.

## Security status

Authwell v1 has automated unit, integration, authorization-boundary, type, lint, browser-extension, web production-build, and Android release-build checks. These checks reduce regressions but are not a substitute for professional cryptographic and application-security review.

The 2026-07-31 release audit leaves two upstream advisories without a published fixed version:

- `GHSA-qwww-vcr4-c8h2` affects React Router's React Server Components mode. Authwell is a static Vite single-page application and does not enable React Router framework/RSC actions, so the vulnerable path is not reachable in v1.
- `GHSA-4x5r-pxfx-6jf8` affects Babel source-map handling while building untrusted source. Authwell builds only reviewed repository source in CI, and Babel is not shipped as application runtime code.

Recheck both advisories before every release and remove this exception as soon as fixed versions are available. Any introduction of React Server Components or builds of untrusted source invalidates this assessment.
