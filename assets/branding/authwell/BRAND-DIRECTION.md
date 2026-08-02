# Authwell brand direction

## Positioning

Authwell is the trusted access layer for a person's digital life: passwords,
passkeys, authenticator codes, recovery, and trusted access across devices.
The identity should feel capable and technically credible without becoming cold,
corporate, or fear-driven.

## Core idea: the trusted portal

The mark uses nested, rounded portal forms to suggest secure passage, continuity,
and layers of protection. Its silhouette subtly combines an **A** and **W** while
remaining recognisable at app-icon and browser-extension sizes.

Avoid literal padlocks, keys, shields, fingerprints, flames, and hacker imagery.

## Colour palette

| Role                      | Colour          | Hex       |
| ------------------------- | --------------- | --------- |
| Foundation                | Deep Ink        | `#10162F` |
| Primary                   | Electric Indigo | `#5A54FC` |
| Passkeys / success        | Vivid Aqua      | `#1DD2C7` |
| Recovery / attention      | Coral           | `#FE5D5A` |
| Authenticator / highlight | Warm Yellow     | `#F5C84C` |
| Canvas                    | Soft White      | `#F7F8FC` |

Deep Ink anchors the interface. Indigo is the primary brand colour. Aqua, coral,
and yellow should communicate product areas and important states rather than act
as decoration everywhere.

## Typography

Use a contemporary rounded geometric sans serif with open counters, friendly
curves, and excellent small-screen legibility. The wordmark should be confident
and compact rather than futuristic or monospaced.

## Product expression

- Use colour to distinguish passwords, passkeys, authenticator codes, recovery,
  people, and security insights.
- Use the portal geometry as a crop, frame, motion path, and background pattern.
- Keep dense product surfaces grounded in Deep Ink or Soft White.
- Reserve gradients for large brand moments; keep functional UI and the primary
  logo flat and reproducible.
- Motion should feel like layers opening, aligning, and settling into place.

## Voice

Clear, calm, direct, and reassuring. Explain what Authwell did and what the user
should do next. Avoid alarmist security copy, military metaphors, and jargon.

## Production masters

The precise production artwork is stored in:

- `authwell-logo-horizontal.svg`
- `authwell-logo-horizontal-dark.svg`
- `authwell-mark.svg`
- `authwell-app-icon.svg`

Run `bun run brand:authwell` to rebuild every derived raster asset. A replacement
source can be imported with `bun run brand:authwell --source /path/to/logo.svg`.
`authwell-brand-concept-v1.png` remains an archived exploratory board and must not
be used as production artwork.
