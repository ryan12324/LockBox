# Authwell v1 design and UX pass

Completed 2026-07-31. The design source of truth is [DESIGN.md](DESIGN.md); the complete ledger of capabilities deliberately removed or deferred from v1 is [V2_SCOPE.md](V2_SCOPE.md).

## What changed

- Replaced the old glow, glass, gradient, score-led visual language with **The Quiet Ledger**: warm paper surfaces, dark ink, restrained umber, stable type, symmetric geometry, and state-based motion.
- Added a checked-in Iconify Tabler subset shared by the web vault and extension. Product icons require no network request; browser-injected prompts use the same icon data without React.
- Rebuilt shared buttons, fields, selects, text areas, cards, badges, modals, and toasts around 44px targets, visible focus, associated errors, live regions, keyboard handling, and reduced-motion support.
- Reorganized the web vault around a clear list/detail workspace with honest empty, loading, error, corrupt-item, destructive, and public-share states. Authentication now states the v1 recovery limitation before account creation.
- Reduced the extension to a site-first three-tab structure and aligned setup, lock, vault, item, generator, history, health, trash, save, autofill, phishing, 2FA, and WebAuthn surfaces with the shared system.
- Made CLI commands unlock only for the current process, redact secrets by default, request sensitive input without echo, explain the real lifetime of key material, and adapt list output to narrow terminals.
- Added a native Android Jetpack WindowManager bridge. Separating vertical and horizontal folds become explicit layout exclusion zones; the vault can place list and detail on separate regions from 600px while React state survives resize, rotation, fold, and unfold.
- Kept real website passkey creation, encrypted WebAuthn credential storage, assertion signing, extension interception with native fallback, and Android Credential Provider integration in v1.

## Product concepts deliberately removed from the v1 presentation

These are UX replacements, not missing v2 features:

- Security score rings, celebratory coverage percentages, urgency animation, and fear-based health copy were replaced by calm issue counts, evidence, and next actions.
- Aura/glow decoration, glass surfaces, decorative gradients, bounce/scale feedback, ornamental lock art, and animated typography were removed.
- The extension's five-destination popup navigation was replaced by three site-first destinations.
- CLI commands no longer imply that a standalone `unlock` process can keep another process unlocked, reveal secrets in ordinary item output, or create unusable passkey records without a WebAuthn ceremony.
- Incomplete recovery controls and claims remain absent. A real recovery key and emergency kit is the first committed cryptographic v2 priority.

## Remaining design debt

- Run final hands-on QA on the target Fold 8 and at least one conventional Android phone; emulator and build coverage cannot validate hinge ergonomics, keyboard behavior, or vendor-specific window transitions.
- Exercise browser-injected save, autofill, phishing, 2FA, and WebAuthn prompts against a representative cross-browser site matrix, including hostile page CSS and high zoom.
- Add automated visual-regression snapshots for compact web, expanded web, extension popup, and simulated vertical/horizontal fold states.
- Replace deprecated Android autofill/Slice APIs before the relevant AndroidX removal window and eliminate the remaining Gradle 9 deprecation warnings.
- Validate contrast and screen-reader behavior with physical-device TalkBack, VoiceOver, NVDA, and Firefox accessibility tooling before a public store release.

## Verification completed

- Monorepo type checking, lint, tests, and production builds passed across all 12 workspaces; the root test run reported 1,811 passing tests.
- Chrome MV3 and Firefox MV2 production extension packages both built successfully.
- The final Capacitor web bundle synced into Android, then `testDebugUnitTest`, `lintDebug`, and `assembleDebug` passed with 193 Gradle tasks.
- Compact registration, its no-recovery warning and validation focus, the public-share error state, and the extension setup state were visually inspected in the in-app browser with clean semantic snapshots and no runtime errors.
- The production extension source was scanned for legacy emoji, hand-authored SVG, indigo tokens, and decorative gradients; only the shared Iconify SVG renderer remains.

## Scope handoff

[V2_SCOPE.md](V2_SCOPE.md) records every functional capability deliberately removed or disabled for v1, why it was unsafe or incomplete, its prerequisites, and acceptance criteria. It includes hardware-backed vault unlock, the committed real recovery key and emergency kit, cryptographic emergency access, QR onboarding/native scanning, AI/BYOK, background breach monitoring, real-time sync notifications, and private server-side URL reputation.
