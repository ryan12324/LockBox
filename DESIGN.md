---
name: Authwell
description: A colourful, calm access platform built around the trusted portal.
colors:
  canvas: 'oklch(0.972 0.009 278)'
  canvas-subtle: 'oklch(0.944 0.017 278)'
  surface: 'oklch(0.986 0.006 278)'
  surface-raised: 'oklch(0.995 0.004 278)'
  line: 'oklch(0.86 0.022 278)'
  line-strong: 'oklch(0.7 0.045 278)'
  ink: 'oklch(0.24 0.055 274)'
  ink-muted: 'oklch(0.43 0.045 274)'
  ink-quiet: 'oklch(0.56 0.035 274)'
  indigo: 'oklch(0.62 0.24 282)'
  indigo-hover: 'oklch(0.56 0.25 282)'
  indigo-active: 'oklch(0.5 0.23 282)'
  aqua: 'oklch(0.8 0.16 178)'
  coral: 'oklch(0.71 0.19 25)'
  yellow: 'oklch(0.84 0.15 90)'
  positive: 'oklch(0.67 0.15 178)'
  caution: 'oklch(0.68 0.14 85)'
  danger: 'oklch(0.64 0.2 25)'
  information: 'oklch(0.62 0.18 250)'
typography:
  display:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1.953rem'
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: '-0.018em'
  headline:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1.5625rem'
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: '-0.018em'
  title:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1.25rem'
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: '-0.018em'
  body:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1rem'
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 'normal'
  label:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.875rem'
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: '0.012em'
rounded:
  sm: '6px'
  md: '10px'
  lg: '14px'
  xl: '18px'
  full: '9999px'
components:
  button-primary:
    backgroundColor: '{colors.indigo}'
    textColor: '{colors.surface}'
    typography: '{typography.body}'
    rounded: '{rounded.md}'
    padding: '0 16px'
    height: '44px'
  button-secondary:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    typography: '{typography.body}'
    rounded: '{rounded.md}'
    padding: '0 16px'
    height: '44px'
  field:
    backgroundColor: '{colors.surface-raised}'
    textColor: '{colors.ink}'
    typography: '{typography.body}'
    rounded: '{rounded.md}'
    padding: '9px 12px'
    height: '44px'
  card:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.lg}'
    padding: '20px'
---

# Design System: Authwell

## Overview

**Creative North Star: "The Trusted Portal"**

Authwell is the trusted access layer for a person's digital life. Its nested portal mark combines an A, a W, and a protected passage without using a lock or shield. Deep ink establishes confidence; electric indigo identifies primary actions; aqua, coral, and yellow create clear product categories and memorable brand moments.

Density follows the task. The web vault is list-first, the extension is site-first, and Android is thumb-first. Layouts adapt by available window width rather than device name: compact windows use one focused pane and bottom navigation, medium windows may introduce a rail, and expanded windows use a side navigation plus a persistent list-detail workspace. Folding and unfolding must preserve selection, scroll, focus, and typed text; no important control, dialog, or reading column may straddle a hinge.

The system uses colour confidently without letting colour carry security meaning alone. Gradients belong only in large identity moments and generated brand artwork. Product controls remain flat, labelled, and predictable. Security confidence comes from legible state, honest copy, and visible recovery consequences.

**Key Characteristics:**

- Deep-ink foundations, cool neutral surfaces, and purposeful category colour.
- List-first information architecture and explicit state labels.
- Symmetric geometry, compact chrome, and 44px minimum controls.
- Capability-based responsive behavior from cover display to unfolded dual pane.
- Local Iconify Tabler icons used consistently and never fetched at runtime.

## Colors

The full brand palette is expressive, while task surfaces remain restrained. Every semantic colour is paired with text or an icon label.

### Primary

- **Electric Indigo:** The action colour for primary buttons, active navigation, focus, and selected vault rows.
- **Vivid Aqua:** Passkeys, successful connection, and trusted-device moments.
- **Coral:** Recovery, urgent attention, and human handoff moments.
- **Warm Yellow:** Authenticator codes, highlights, and non-destructive caution.

### Neutral

- **Soft Canvas:** The cool, lightly indigo-tinted application background.
- **Raised White:** The principal reading and editing surface.
- **Deep Ink:** Primary text, dark mode, and high-value data.
- **Quiet Ink:** Supporting copy, metadata, and field labels.
- **Hairline Rule:** Dividers and container boundaries; use tonal separation before shadow.

### Named Rules

**The Product Restraint Rule.** Indigo leads task surfaces. Aqua, coral, and yellow appear when they communicate category or state, not as arbitrary decoration.

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

Authwell is flat by default. Depth comes from lighter surfaces, hairline borders, and pane boundaries; small shadows identify a truly raised control, while the large shadow is reserved for modal dialogs. Blur, glow, and translucent glass are prohibited.

### Shadow Vocabulary

- **Resting Lift:** A one-pixel, low-opacity shadow for raised cards or floating controls only.
- **Temporary Lift:** A soft medium shadow for toasts and transient menus.
- **Dialog Lift:** The strongest shadow, restricted to blocking modal surfaces over a darkened scrim.

### Named Rules

**The Flat-by-Default Rule.** If a border and tonal step can communicate containment, a shadow is forbidden.

## Components

### Buttons

- **Shape:** Gently squared corners (10px) and a 44px minimum target on every platform.
- **Primary:** Electric Indigo with near-white text, medium weight, and one short imperative label.
- **Hover / Focus:** Hover darkens only; focus uses a three-pixel visible ring; press moves down one pixel without bounce or scale.
- **Secondary / Ghost:** Secondary buttons use a hairline border; ghost buttons appear only in compact toolbars and never substitute for the primary action.

### Chips

- **Style:** Quiet tinted fill, hairline boundary, and sentence-case label. Semantic chips pair color with an icon or explicit state word.
- **State:** Selected filters use indigo text plus a visible selection marker; selection never depends on fill color alone.

### Cards / Containers

- **Corner Style:** Symmetric, restrained rounding (14px).
- **Background:** Raised White or a slightly tinted surface; never transparent glass.
- **Shadow Strategy:** Flat by default; see the Elevation rules.
- **Border:** One-pixel Hairline Rule around discrete cards; adjacent vault rows use dividers instead of individual cards.
- **Internal Padding:** 12px compact, 20px standard, 28px spacious.

### Inputs / Fields

- **Style:** Opaque raised surface, one-pixel boundary, 10px corners, and a 44px minimum height.
- **Focus:** Umber boundary plus a clearly visible three-pixel focus ring.
- **Error / Disabled:** Errors use danger color, `aria-invalid`, and an associated sentence below the field. Disabled fields use a quiet tinted fill and remain legible.

### Navigation

- **Style:** Always labeled Iconify Tabler icons. Active items use weight, icon, and a restrained tonal background—not a colored side stripe.
- **Responsive treatment:** Compact windows use bottom navigation for the three highest-value destinations; medium windows use a rail only when it improves content width; expanded windows use a labeled sidebar. At 840px and above, vault list and detail may coexist. Below 840px, show one pane at a time and preserve the selected item when the window expands again.
- **Foldable treatment:** Android's native Jetpack WindowManager bridge supplies the separating feature's bounds, orientation, and posture to the web shell. Those hinge or fold bounds are exclusion zones. In book posture, place the vault list and detail on separate regions; in tabletop posture, keep content above and actions below when useful. Cover-display mode retains unlock, search, item view, copy, and fill without horizontal scrolling. Treat `360 × 568` CSS pixels as the compact, short cover-display regression baseline and `480 × 752` as the increased-display-area check; capability breakpoints remain authoritative because system display zoom changes the logical window.

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
