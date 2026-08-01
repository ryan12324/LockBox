# Lockbox v2 scope backlog

This backlog records every user-facing capability deliberately removed or disabled while making v1 release-ready. It was derived from the v1 code diff, deleted clients and plugins, disabled API routes, and release documentation on 2026-07-31.

The removed prototypes are evidence of product intent, not safe implementation plans. Each feature below must start with a protocol and threat-model review rather than restoring the old code.

## Confirmed product decisions

- **WebAuthn credential storage stays in the product.** Website passkey creation, encrypted vault storage, assertion signing, browser-extension interception with native fallback, and Android Credential Provider integration already ship in v1. This is distinct from using a hardware authenticator to unlock the Lockbox vault.
- **Real recovery key and emergency kit is committed v2 scope.** It is the first cryptographic v2 delivery priority and must provide an actual client-side recovery envelope rather than a printable but unrelated random value.
- Hardware-backed vault unlock and trusted-contact emergency access remain separate candidates. Selecting recovery does not implicitly select either feature.

## Inventory

| Status       | Candidate                               | What was removed from v1                                                                                                 | What v1 keeps                                                                                                            |
| ------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Candidate    | Hardware-backed vault unlock            | Web, extension, and Android registration/unlock UI; FIDO2/PRF bridge; setup, challenge, and verify API flows             | Master-password unlock, account TOTP 2FA, website passkey storage/use, and cleanup of legacy key records                 |
| **Committed** | **Real recovery key and emergency kit** | Registration-time recovery-key generation and a downloadable PDF that claimed to support recovery                       | An explicit no-recovery model and second-factor backup codes                                                             |
| Candidate    | Cryptographic emergency access          | Trusted contacts, grants, requests, wait periods, approval/rejection/revocation, automatic approval, and vault retrieval | No emergency grant or request can be created in v1                                                                       |
| Candidate    | QR onboarding and native scanning       | QR session transfer in web/extension/Android, camera scanner plugin, and Android QR TOTP import helpers                  | Normal password/2FA login, encrypted sync after login, and manual TOTP entry                                             |
| Candidate    | AI assistant and BYOK controls          | Web/extension chat, provider configuration, advanced AI feature controls, and advertised vault-agent actions             | On-device health analysis, semantic search, phishing heuristics, categorization primitives, and security-copilot scoring |
| Candidate    | Automatic background breach monitoring | The extension's nominal 24-hour background breach alarm                                                                  | User-initiated HIBP k-anonymity checks with explicit failure reporting                                                   |
| Candidate    | Real-time sync notifications            | Cloudflare Durable Object WebSocket hub, authenticated upgrade route, and deployment binding                             | Durable REST delta sync, polling, conflict detection, and travel-mode filtering                                          |
| Candidate    | Private server-side URL reputation      | The hash-only reputation path that previously treated missing reputation evidence as safe                               | Local phishing heuristics and authenticated plaintext-URL heuristic analysis                                             |
| Candidate    | Additional password-manager imports     | The multi-provider selector for Bitwarden, Chrome, Firefox, 1Password, and KeePass plus unsafe generic auto-detection     | A production LastPass adapter/review flow and Bitwarden-compatible Lockbox export                                        |

## 1. Hardware-backed vault unlock

### Removed surface

- Web and extension hardware-key registration, listing, revocation, and alternate-unlock controls.
- Android cross-platform FIDO2 security-key plugin and PRF-based key-wrapping helpers.
- API setup, challenge, and assertion-verification flows. They now fail closed with `501`; authenticated owners can only list and delete legacy records.
- Advertised YubiKey/FIDO2 passwordless unlock.

### Why it missed v1

The prototype derived wrapping material from public data in some clients, did not consistently verify the complete WebAuthn assertion context, and used process-local challenges. A valid assertion alone also does not provide the secret needed to unwrap the vault unless a supported PRF/hmac-secret or a separately protected device key is part of the design.

### Prerequisites and decisions

- Write a protocol specifying whether this is a second unlock method, an authentication factor, or both.
- Choose a hardware-bound secret mechanism and publish the authenticator/platform support matrix.
- Define RP IDs and allowed origins for hosted web vaults, extensions, and Android.
- Define multiple-key enrollment, lost-key fallback, revocation, sign-counter policy, 2FA interaction, and account-recovery behavior.
- Decide whether PIV is supported as a distinct protocol; do not label generic WebAuthn as PIV.

### Acceptance criteria

- Registration and authentication verify challenge, origin, RP ID hash, credential ID, flags, algorithm, signature, user verification, expiry, and replay protection.
- Challenges are random, server-persisted, one-time, short-lived, and bound to one user and purpose.
- Vault-key wrapping depends on hardware-held secret material; public keys alone cannot unwrap it.
- Failed, cancelled, replayed, cross-origin, cloned-counter, and revoked-key attempts never issue a session or release wrapped key material.
- Users can enroll, name, list, revoke, and test multiple keys without losing master-password access.
- Chrome, Firefox, Android, and backend interoperability is covered by end-to-end tests and documented recovery drills.

## 2. Real recovery key and emergency kit

### Removed surface

Registration generated an unrelated random string, downloaded it in a PDF, and described a recovery route that did not exist. The PDF generator, dependency, tests, and registration promise were removed.

### Why it missed v1

The displayed value was not cryptographically connected to the encrypted user key, so it could never recover the vault. Keeping it would have given users false confidence.

### Prerequisites and decisions

- Decide whether recovery is opt-in or required, and whether it bypasses only the master password or also affects 2FA.
- Specify recovery-secret generation, key derivation, encrypted recovery envelope storage, confirmation, rotation, and revocation.
- Define rate limits, account-enumeration resistance, password-reset semantics, and the effect of changing the master password.

### Acceptance criteria

- A recovery secret generated on the client can actually decrypt a versioned recovery envelope for the user key; the server never receives the plaintext secret or user key.
- Registration cannot claim recovery until the user confirms that the kit was saved.
- Rotating or revoking a kit invalidates all older kits atomically and does not corrupt the current vault.
- Recovery succeeds on a clean browser and Android installation and requires the intended second-factor checks.
- Invalid, truncated, old, brute-forced, or cross-account kits fail without leaking account state.
- The kit clearly states its sensitivity, storage guidance, scope, and revocation date.

## 3. Cryptographic emergency access

### Removed surface

- Trusted-contact invitations and confirmation.
- Grantor/grantee lists in web, extension, and Android.
- Access requests, waiting periods, manual approval/rejection, revocation, scheduled automatic approval, and encrypted-vault retrieval.
- The API now returns `501` without creating any grant or request.

### Why it missed v1

The server stored placeholder key data and had no interoperable way for the grantee to decrypt the grantor's vault. Its scheduled job could mark an impossible recovery path approved, creating both a security risk and a misleading promise.

### Prerequisites and decisions

- Build on validated per-user public keys and a versioned recovery-envelope design.
- Specify exactly which vault key is wrapped for the grantee, when it becomes retrievable, and how key rotation affects outstanding grants.
- Define invitation identity proof, notification delivery, wait-period authority, cancellation, revocation, grant expiry, and audit history.
- Decide whether timed release is automatic, grantor-approved, or supports both modes.

### Acceptance criteria

- Only the intended grantee can unwrap an approved grant, and the backend never receives plaintext vault keys.
- Creating, confirming, requesting, approving, rejecting, expiring, and revoking a grant are atomic, authorized state transitions.
- Revocation prevents all future retrieval and invalidates unretrieved envelopes; key rotation cannot leave silently usable stale grants.
- Wait periods remain correct across retries, clock skew, duplicate jobs, and deployment restarts.
- Both parties receive clear notifications and an immutable, privacy-conscious audit trail.
- The complete flow works across web and Android, including a lost-device and compromised-contact drill.

## 4. QR onboarding and native scanning

### Removed surface

- Extension and web QR generation, paste/scan receiver flows, countdown UI, and QR alternate login.
- Android CameraX/ML Kit scanner bridge, camera permission, QR device-pairing helpers, and `otpauth://` QR parsing helpers.
- Direct transfer of a session token and user key in a short-lived payload.

### Why it missed v1

The sender performed a self-derived ECDH operation without a real receiver handshake, while different clients expected incompatible payloads. The static QR could carry bearer/session material and lacked a complete single-use replay-resistant pairing protocol.

### Prerequisites and decisions

- Separate device onboarding from generic QR capture and TOTP import.
- Define an authenticated two-party handshake with receiver-generated ephemeral key material, explicit user confirmation, expiry, cancellation, and one-time redemption.
- Decide whether a server relay is used and what minimal metadata it may observe.
- Define device naming, session scope, post-pair revocation, and compromised-QR behavior.

### Acceptance criteria

- A static QR never contains a reusable session token, plaintext user key, or all material needed by an unconfirmed scanner.
- Pairing binds both ephemeral keys, both device identities, one account, one nonce, one purpose, and one short expiry.
- Replays, screenshots used after confirmation, concurrent redemptions, altered payloads, and cross-account scans fail closed.
- Users see matching confirmation information on both devices before access is granted and can revoke the new device afterward.
- Chrome/Firefox-to-Android and web-to-Android pairing have end-to-end tests, including offline, expiry, cancellation, and clock-skew cases.
- Native QR TOTP import requests camera permission just in time, validates the complete `otpauth://` payload, previews issuer/account/algorithm/digits/period, and saves only after confirmation.

## 5. AI assistant and BYOK controls

### Removed surface

- Web and extension assistant screens that returned a canned provider-required message.
- Provider settings for OpenRouter, OpenAI, Anthropic, Google, Ollama, Vercel/AI gateways, and Workers AI.
- UI controls that implied chat, provider-backed copilot actions, and other advanced features were connected when they were not.
- Confirmation UI for proposed vault-agent tool calls.

### What was not removed

Local password health, semantic search, phishing heuristics, categorization code, lifecycle analysis, and security-copilot scoring remain available to v1 clients. V2 should extend these working local capabilities instead of replacing them.

### Prerequisites and decisions

- Define which providers are supported and whether calls are direct from clients or proxied.
- Store BYOK credentials only as authenticated ciphertext bound to the user and provider; define rotation and deletion.
- Publish what vault data each capability can send, require explicit opt-in, and design defenses against prompt injection from vault and webpage content.
- Give every agent tool a least-privilege schema, confirmation policy, audit record, cancellation path, and deterministic non-LLM authorization check.

### Acceptance criteria

- A configured provider produces a real streamed response with cancellation, timeout, rate-limit, and provider-error handling; no canned success path remains.
- API keys never appear in logs, analytics, error messages, exports, extension storage, or server plaintext.
- Read-only queries disclose only the minimum selected data, and every create/edit/delete/share/rotate action requires a clear preview and explicit approval.
- Malicious vault text or webpage text cannot silently invoke tools, change authorization, exfiltrate unrelated items, or suppress confirmation.
- Provider removal erases its encrypted configuration and cached provider-derived data.
- Web and extension behavior, privacy copy, model/provider attribution, and safety tests are consistent.

## 6. Automatic background breach monitoring

### Removed surface

The extension scheduled a nominal 24-hour breach-check alarm even though a restarted service worker normally has no decrypted vault key or passwords. V1 keeps a deliberate user-initiated check instead.

### Prerequisites and decisions

- Decide whether monitoring runs only while an unlocked client is active or uses a separately consented local background capability.
- Define encrypted result caching, notification policy, retry/backoff, cross-client deduplication, and stale-result labeling.
- Preserve HIBP k-anonymity: no plaintext password or full password hash may leave the client.

### Acceptance criteria

- Scheduling survives browser restarts without persisting vault plaintext, the master key, user key, or passwords.
- Network errors and partial failures produce an explicit unknown/stale state, never a clean score.
- Notifications identify affected vault items only after unlock and do not expose secrets on the lock screen.
- Users can opt in/out, run immediately, inspect last-success time, and clear cached results.
- Tests cover locked state, service-worker suspension, rate limits, offline recovery, partial HIBP failures, and duplicate alarms.

## 7. Real-time sync notifications

### Removed surface

The `VaultSyncHub` Durable Object, WebSocket upgrade route, binding, and tests were removed. The prototype accepted authenticated sockets but was not integrated with vault mutations to provide a reliable end-to-end notification path.

### Prerequisites and decisions

- Define whether events contain only invalidation/cursor data or include item metadata, and document the privacy impact.
- Specify socket authentication/expiry, reconnect/backoff, missed-event recovery, fan-out limits, and Cloudflare cost controls.
- Keep REST delta sync authoritative; WebSocket delivery must be an optimization, not a correctness dependency.

### Acceptance criteria

- Every relevant committed mutation emits an event only after the transaction succeeds.
- Events contain no plaintext, keys, auth hashes, share secrets, or unnecessary item metadata.
- Expired/revoked sessions cannot connect or continue receiving events.
- Disconnects, duplicates, out-of-order events, sleeping mobile clients, and Durable Object restarts converge through the delta cursor without data loss.
- Travel mode and membership revocation invalidate access immediately and do not leak filtered-folder activity.
- Deployment docs include the binding, migration/rollback, observability, quotas, and expected cost.

## 8. Private server-side URL reputation

### Removed surface

The hash-only reputation path no longer returns `safe: true` when no reputation database exists; it returns `501`. V1 still provides local heuristics and an authenticated full-URL heuristic endpoint.

### Prerequisites and decisions

- Select a maintained reputation source and determine whether it supports hashed prefixes, k-anonymity, private set intersection, or only full URLs.
- Define `safe`, `suspicious`, `known malicious`, and `unknown` semantics, update cadence, false-positive appeals, and provider outage behavior.
- Document exactly what is disclosed to Lockbox infrastructure and any upstream provider.

### Acceptance criteria

- Unknown, stale, unavailable, and clean verdicts are distinct; missing evidence never becomes a reassuring safe result.
- Requests reveal no more URL information than the chosen privacy design permits and are rate-limited without user enumeration.
- Feed updates are authenticated, versioned, observable, and roll back safely.
- Client warnings cite the reason and freshness, allow a deliberate override, and do not block native browser protections.
- Tests include hash collisions/prefix ambiguity, provider outage, stale feeds, malicious redirects, Unicode domains, and false positives.

## 9. Additional password-manager import adapters

### Removed or deferred surface

The v1 import screen previously advertised Bitwarden, Chrome, Firefox, 1Password, and KeePass through small format-specific CSV helpers and a generic fallback. Those paths did not provide the LastPass flow's schema verification, row-level diagnostics, folder mapping, TOTP validation, duplicate decisions, encrypted batch workflow, or lossless handling guarantees, so they are not exposed as production imports in v1. The compatibility helpers remain covered internally while v1 presents only the production LastPass adapter.

### Prerequisites and decisions

- Prioritize providers from real migration demand: Bitwarden, 1Password, Google Password Manager/Chrome, Firefox, KeePass, Dashlane, and Safari/iCloud Keychain.
- Collect versioned, synthetic export fixtures for every supported provider and format; never use customer vault exports as test fixtures.
- Decide per provider whether to support CSV, JSON, encrypted archives, or native bundles such as 1PUX, and publish any fields that the source format cannot represent.
- Map logins, secure notes, cards, identities, passkeys, folders/collections, tags, favourites, custom fields, multiple URLs, attachments, and TOTP explicitly rather than forcing everything into login rows.
- Keep format detection deterministic. Unknown or ambiguous files must stop with an actionable error instead of falling back to another provider parser.

### Acceptance criteria

- Every adapter uses the shared provider contract and the same local preview, selection, duplicate, folder, progress, failure, and encrypted-write workflow as LastPass.
- Supported source fields are preserved losslessly or called out before import; secrets never appear in diagnostics, logs, analytics, screenshots, or network request metadata.
- Malformed quoting, duplicate/missing headers, oversized files, invalid TOTP, unexpected columns, empty records, Unicode, multiline fields, and provider-version changes have fixture-backed tests.
- Automatic duplicate handling is conservative: ambiguous records are imported rather than silently skipped, and users can choose skip or keep-both for safe matches.
- Web, extension entry points, and Android/foldable layouts expose the same provider availability and privacy copy, with production builds and migration smoke tests for each adapter.

## Suggested sequence

1. Specify, threat-model, and externally review the committed recovery-key protocol and versioned envelope format.
2. Implement the real recovery flow and emergency kit across web, extension, Android, CLI, and API; verify recovery on clean installations before release.
3. Evaluate hardware-backed vault unlock separately; if selected, specify its hardware-held secret and recovery interaction before implementation.
4. Add the native QR scanner/TOTP import, then build authenticated QR device onboarding on top of a separately reviewed pairing protocol.
5. Add real-time invalidation after REST sync correctness and observability are stable in production.
6. Add opt-in background breach monitoring and private reputation only when their privacy and unknown-state UX are complete.
7. Add BYOK/provider storage, then ship a read-only assistant before enabling any mutating vault tools.
8. Add password-manager adapters one provider at a time through the shared LastPass workflow; do not restore the generic fallback selector.

## Definition of done for every v2 candidate

- A written threat model and versioned protocol/data-format document are reviewed before implementation.
- Server authorization and client cryptography fail closed; error, cancellation, replay, concurrency, recovery, and offline paths are tested.
- Existing v1 ciphertext and clients migrate or fail with an actionable version error; rollback is documented.
- Web, Chrome, Firefox, and Android surfaces are accessible, consistent, and absent where the platform cannot support the feature safely.
- Logs, analytics, notifications, exports, screenshots, and crash reports are checked for secret leakage.
- Deployment, privacy, recovery, and operator-cost documentation is complete.
- Lint, type checks, unit/integration tests, production builds, browser packages, Android release lint, and a focused manual security test all pass.

## Deliberate replacements that are not v2 backlog

- Website passkeys still ship. The deleted standalone Android `passkey-sync` bridge was replaced by encrypted vault sync plus the Room-backed Credential Provider index.
- Passkey interception still ships. The old interceptor entrypoint was renamed to a packaged main-world content script; the removed Chrome `webAuthenticationProxy` approach is a remote-desktop API and should not return.
- Local security analysis still ships. Removing fake chat/provider screens did not remove health scoring, semantic search, phishing heuristics, or copilot recommendations.
- `package-lock.json` was removed because Bun's `bun.lock` is the canonical lockfile; this is not a product feature.
