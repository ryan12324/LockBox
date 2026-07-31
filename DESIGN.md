---
name: Lockbox
description: A calm, precise vault interface built like a quiet personal ledger.
colors:
  paper: "oklch(0.965 0.008 80)"
  paper-subtle: "oklch(0.935 0.01 78)"
  surface: "oklch(0.985 0.005 80)"
  surface-raised: "oklch(0.997 0.003 80)"
  line: "oklch(0.84 0.014 75)"
  line-strong: "oklch(0.69 0.02 68)"
  ink: "oklch(0.25 0.018 55)"
  ink-muted: "oklch(0.43 0.02 55)"
  ink-quiet: "oklch(0.52 0.018 55)"
  umber: "oklch(0.42 0.055 55)"
  umber-hover: "oklch(0.36 0.052 55)"
  umber-active: "oklch(0.31 0.048 55)"
  positive: "oklch(0.4 0.09 145)"
  caution: "oklch(0.43 0.1 75)"
  danger: "oklch(0.44 0.13 28)"
  information: "oklch(0.43 0.1 250)"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.953rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.018em"
  headline:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5625rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.018em"
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.018em"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "0.012em"
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
  xl: "18px"
  full: "9999px"
components:
  button-primary:
    backgroundColor: "{colors.umber}"
    textColor: "{colors.surface}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "44px"
  field:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "9px 12px"
    height: "44px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "20px"
---

# Design System: Lockbox

## Overview

**Creative North Star: "The Quiet Ledger"**

Lockbox should feel like a well-kept personal ledger: calm enough to trust, structured enough to scan, and precise about every consequential action. Warm paper surfaces and dark ink establish a private, durable atmosphere; restrained umber marks the next action without turning security into spectacle.

Density follows the task. The web vault is list-first, the extension is site-first, and Android is thumb-first. Layouts adapt by available window width rather than device name: compact windows use one focused pane and bottom navigation, medium windows may introduce a rail, and expanded windows use a side navigation plus a persistent list-detail workspace. Folding and unfolding must preserve selection, scroll, focus, and typed text; no important control, dialog, or reading column may straddle a hinge.

The system explicitly rejects consumer-fintech gradients, glowing “secure” effects, glassmorphism, fear-based scores, ornamental card grids, and AI-first framing. Security confidence comes from legible state, honest copy, predictable behavior, and visible recovery consequences.

**Key Characteristics:**

- Warm, private, paper-like surfaces with one restrained accent.
- List-first information architecture and explicit state labels.
- Symmetric geometry, compact chrome, and 44px minimum controls.
- Capability-based responsive behavior from cover display to unfolded dual pane.
- Local Iconify Tabler icons used consistently and never fetched at runtime.

## Colors

The palette is a quiet spectrum of warm paper, umber, and ink, with semantic colors reserved for states that also have text or icon labels.

### Primary

- **Ledger Umber:** The sole action accent for primary buttons, active navigation, focus, and selected vault rows. Its rarity is what gives it authority.

### Neutral

- **Archive Paper:** The application canvas; warm enough to feel personal without reading as beige decoration.
- **Clean Leaf:** The principal reading and editing surface.
- **Ledger Ink:** Primary text and high-value data.
- **Pencil Note:** Supporting copy, metadata, and field labels.
- **Hairline Rule:** Dividers and container boundaries; use tonal separation before shadow.

### Named Rules

**The One-Accent Rule.** Umber is the only routine accent and occupies less than ten percent of a screen; semantic colors never become decoration.

**The Labeled-State Rule.** Color never carries security meaning alone. Pair every important state with an Iconify icon and concise text.

## Typography

**Display Font:** Inter with the system sans-serif fallback
**Body Font:** Inter with the system sans-serif fallback
**Label/Mono Font:** SFMono-Regular with Consolas and Liberation Mono fallbacks for secrets and technical values

**Character:** A single humanist sans keeps the product contemporary and quiet. Weight and spacing create hierarchy; animated typography and ornamental display faces are prohibited.

### Hierarchy

- **Display** (600, 1.953rem, 1.25): Rare authentication or onboarding title; never a dashboard statistic.
- **Headline** (600, 1.5625rem, 1.25): Page title and primary pane heading.
- **Title** (600, 1.25rem, 1.25): Section heading, item title, and dialog title.
- **Body** (400, 1rem, 1.5): Controls, vault values, explanatory copy, and forms; long guidance stays below 70 characters per line.
- **Label** (500, 0.875rem, 0.012em, sentence case): Field labels, metadata, navigation labels, and compact status text.

### Named Rules

**The Stable-Type Rule.** Font weight, width, and letter spacing never animate. Security information must remain visually stable while it is being read.

## Elevation

Lockbox is flat by default. Depth comes from lighter surfaces, hairline borders, and pane boundaries; small shadows identify a truly raised control, while the large shadow is reserved for modal dialogs. Blur, glow, and translucent glass are prohibited.

### Shadow Vocabulary

- **Resting Lift:** A one-pixel, low-opacity shadow for raised cards or floating controls only.
- **Temporary Lift:** A soft medium shadow for toasts and transient menus.
- **Dialog Lift:** The strongest shadow, restricted to blocking modal surfaces over a darkened scrim.

### Named Rules

**The Flat-by-Default Rule.** If a border and tonal step can communicate containment, a shadow is forbidden.

## Components

### Buttons

- **Shape:** Gently squared corners (10px) and a 44px minimum target on every platform.
- **Primary:** Ledger Umber with Clean Leaf text, medium weight, and one short imperative label.
- **Hover / Focus:** Hover darkens only; focus uses a three-pixel visible ring; press moves down one pixel without bounce or scale.
- **Secondary / Ghost:** Secondary buttons use a hairline border; ghost buttons appear only in compact toolbars and never substitute for the primary action.

### Chips

- **Style:** Quiet paper fill, hairline boundary, and sentence-case label. Semantic chips pair color with an icon or explicit state word.
- **State:** Selected filters use umber text plus a visible selection marker; selection never depends on fill color alone.

### Cards / Containers

- **Corner Style:** Symmetric, restrained rounding (14px).
- **Background:** Clean Leaf or a slightly raised leaf; never transparent glass.
- **Shadow Strategy:** Flat by default; see the Elevation rules.
- **Border:** One-pixel Hairline Rule around discrete cards; adjacent vault rows use dividers instead of individual cards.
- **Internal Padding:** 12px compact, 20px standard, 28px spacious.

### Inputs / Fields

- **Style:** Opaque raised surface, one-pixel boundary, 10px corners, and a 44px minimum height.
- **Focus:** Umber boundary plus a clearly visible three-pixel focus ring.
- **Error / Disabled:** Errors use danger color, `aria-invalid`, and an associated sentence below the field. Disabled fields use a quiet paper fill and remain legible.

### Navigation

- **Style:** Always labeled Iconify Tabler icons. Active items use weight, icon, and a restrained tonal background—not a colored side stripe.
- **Responsive treatment:** Compact windows use bottom navigation for the three highest-value destinations; medium windows use a rail only when it improves content width; expanded windows use a labeled sidebar. At 840px and above, vault list and detail may coexist. Below 840px, show one pane at a time and preserve the selected item when the window expands again.
- **Foldable treatment:** Android's native Jetpack WindowManager bridge supplies the separating feature's bounds, orientation, and posture to the web shell. Those hinge or fold bounds are exclusion zones. In book posture, place the vault list and detail on separate regions; in tabletop posture, keep content above and actions below when useful. Cover-display mode retains unlock, search, item view, copy, and fill without horizontal scrolling.

## Do's and Don'ts

### Do:

- **Do** make the primary task on each surface unmistakable: manage on web, fill on extension, unlock/sync/fill on Android.
- **Do** use 44px minimum interactive targets, visible keyboard focus, semantic controls, and WCAG 2.2 AA contrast.
- **Do** preserve scroll, focus, typed text, and selected vault item across resize, rotation, fold, and unfold.
- **Do** use a single locally bundled Iconify Tabler set; label unfamiliar icons and keep security states visible in text.
- **Do** explain irreversible, destructive, and cryptographic consequences before confirmation.
- **Do** remove incomplete capabilities from normal navigation and describe only security flows that actually work.

### Don't:

- **Don't** use consumer-fintech gradients, glowing “secure” effects, glassmorphism, or decorative lock imagery that substitutes for evidence.
- **Don't** use fear-based breach language, celebratory security scores, or gamification that encourages rushed changes.
- **Don't** expose developer-console jargon in end-user errors.
- **Don't** hide network activity, silently rotate keys, or present controls whose effect differs by platform without explanation.
- **Don't** build large dashboards of vanity metrics, repetitive card grids, or AI-first framing that displaces essential vault tasks.
- **Don't** place important content, dialogs, or actions across a fold or hinge.
