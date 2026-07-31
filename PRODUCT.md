# Lockbox Product Context

## Register

Product application. Lockbox is a security-sensitive, multi-surface password manager rather than a marketing site. Interfaces should favor legibility, predictable workflows, explicit state, and restrained density over spectacle.

## Product Purpose

Lockbox gives people a self-hosted vault they can operate on infrastructure they control. It combines a web vault, browser extension, Android client, command-line client, and Cloudflare backend while keeping vault contents end-to-end encrypted. The v1 promise is dependable password storage, retrieval, autofill, sync, import/export, TOTP, attachments/documents, and carefully bounded sharing—not a collection of experimental security claims.

## Users

The primary v1 user is a technically comfortable, security-conscious self-hoster who can deploy a Cloudflare project and install an unpacked or packaged client. They value auditability and control, but should not need to understand cryptographic implementation details to complete ordinary tasks. Secondary users are invited family or team members who need a straightforward vault experience after the owner has deployed the service.

## Brand Personality

- Calm: never amplify anxiety or dramatize routine security work.
- Trustworthy: explain irreversible or security-sensitive consequences before action.
- Precise: use concrete nouns, honest status language, and specific recovery guidance.
- Private: make local processing, encryption boundaries, and outbound requests visible where relevant.
- Capable: advanced controls may exist, but progressive disclosure should protect the primary path.

The voice is direct, human, and reassuring without being cute. Prefer “Your vault is locked” to cryptic status codes, and “Try again in 30 seconds” to generic failure copy.

## Strategic Design Principles

1. Security state must be understandable without relying on color. Pair icons, labels, and concise explanations with every important state.
2. The main task on each surface wins. The extension prioritizes unlock, search, fill, and save; the web app prioritizes vault management; Android prioritizes unlock, sync, autofill, and credential-provider flows.
3. Fail closed while remaining actionable. When a feature is unavailable or intentionally deferred, remove it from primary navigation instead of exposing a dead control.
4. Destructive and cryptographic transitions need explicit scope and recovery consequences. Never imply that deleting ciphertext, rotating keys, or changing a master password is trivially reversible.
5. Accessibility is a release requirement: WCAG 2.2 AA contrast, keyboard-visible focus, semantic controls, reduced-motion support, practical touch targets, and screen-reader labels.
6. Keep dense vault data scannable through hierarchy and alignment, not ornamental cards or excessive chrome.
7. Prefer honest capability boundaries over roadmap theater. UI and documentation must describe only flows that work across their claimed surfaces.

## Anti-References

- Consumer-fintech gradients, glowing “secure” effects, glassmorphism, and decorative lock imagery that substitute for evidence.
- Fear-based breach language, celebratory security scores, or gamification that encourages rushed changes.
- Developer-console jargon in end-user errors.
- Hidden network activity, silent key rotation, or controls whose effect differs by platform without explanation.
- Large dashboards of vanity metrics, repetitive card grids, and AI-first framing that displaces essential vault tasks.

## v1 Scope Boundary

Ship flows only when their protocol and user recovery story are complete. Hardware-key login, emergency-access recovery, and QR-based cross-device secret transfer remain out of v1 unless their cryptographic protocols and all participating clients are fully interoperable. They should be absent from normal navigation and documented as deferred rather than presented as partially working security features.
