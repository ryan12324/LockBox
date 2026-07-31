# Lockbox privacy notice

Effective: 2026-07-31

Lockbox is self-hosted software. The Lockbox project does not operate a shared vault service, receive production vault data, include advertising, or include product analytics or crash-reporting SDKs. The person or organization that deploys a Lockbox backend controls that deployment and is responsible for its privacy obligations.

## Data processed by Lockbox

Lockbox clients may process account email addresses, usernames, passwords, passkeys, TOTP secrets, payment-card details, identities, secure notes, documents, attachments, login URLs, team membership, and other content a user chooses to save. Clients also inspect login forms and the current site URL locally to provide autofill, save prompts, passkey support, and phishing heuristics.

Vault contents, attachments, documents, provider credentials, and sensitive configuration are encrypted on the client before they are sent to the configured Lockbox backend. The backend stores ciphertext plus the metadata required for authentication, authorization, synchronization, quotas, sharing, retention, and abuse prevention. Metadata can include an account email, opaque record identifiers, item types, timestamps, sizes, folder/team relationships, KDF configuration, salts, derived authentication verifiers, session records, and IP-based rate-limit state.

The browser extension declares transmission of personally identifying, financial/payment, authentication, personal-communication, and browsing-activity data because a user's encrypted vault can contain those categories and is synchronized outside the browser to the user's configured backend. The extension does not transmit arbitrary page content, keystrokes, or browsing history to the Lockbox project.

## Where data goes

- The configured Cloudflare deployment receives encrypted vault data and operational metadata. Its operator chooses the Cloudflare account, region options, logs, backups, retention, and access controls.
- A manual Pwned Passwords check sends only the first five hexadecimal characters of a password's SHA-1 hash to Have I Been Pwned's range API. Lockbox does not send the plaintext password or full hash.
- The extension may download the public 2FA Directory dataset to identify sites that support two-factor authentication. It does not send the current site to that service.
- If a user configures SimpleLogin or Addy.io alias generation, the chosen provider receives the data required by its API under that provider's privacy terms. Its API key is encrypted before storage on the Lockbox backend.
- The browser, extension store, operating system, Android platform, and any hosting/build provider process data according to their own terms.

Lockbox v1 has no enabled AI chat provider and does not send vault content to an LLM.

## Local storage and permissions

Clients store encrypted records, session state, settings, and a minimum local credential index needed for autofill. Decrypted vault material and keys are intended to remain in memory only while unlocked. Android protects its autofill index with biometric-bound platform cryptography. Browser host access is used for local form detection, autofill, save prompts, phishing heuristics, and passkey interception on sites the user visits.

## Retention and deletion

Vault trash is retained for the configured cleanup period before deletion. Item versions and stored blobs follow the limits and cleanup jobs described in the deployment documentation. Deleting an account-level deployment, Cloudflare resources, logs, or backups is the responsibility of the self-hosting operator. Browser and Android local data can be removed by signing out, clearing application data, or uninstalling the client; platform backups are disabled for the Android app.

## Security and limitations

Lockbox's zero-knowledge design reduces what a correctly operating backend can read, but it does not hide all metadata and cannot protect data on a compromised or malicious client, browser, extension, operating system, build, or deployment. Lockbox v1 has not received an independent security audit. See [SECURITY.md](SECURITY.md) for the threat model and vulnerability-reporting process.

## Changes and contact

Material privacy changes should be documented in the repository changelog and release notes. Questions can be opened as a GitHub discussion or non-sensitive issue. Report security or privacy vulnerabilities through GitHub's private vulnerability-reporting channel rather than a public issue.
