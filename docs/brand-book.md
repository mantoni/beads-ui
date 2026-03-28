# Beads UI Brand Book

**Status:** draft **Date:** 2026-03-28 **Scope:** Visual identity and theme
rules for Beads UI.

---

## Purpose

Use this document to keep human and AI-produced UI work aligned with the shipped
product. If a design idea conflicts with implemented structure or UX, follow the
current product first.

## Brand Position

Beads is a local-first issue tracker for people working with coding agents. The
UI should feel:

- Focused, local, fast
- Technical without looking like an IDE clone
- Calm under heavy information density
- Precise enough for triage and editing
- Trustworthy in both light and dark themes

## Core Principles

1. Design for working screens, not showcase screens.
2. Keep the shell stable: header, workspace context, tabs, theme toggle, and
   primary action should feel persistent.
3. Use color semantically, not decoratively.
4. Preserve hierarchy through spacing, typography, and surface contrast before
   adding new boxes or effects.
5. Light and dark themes are separate first-class outputs. Do not design one and
   "convert later".
6. Prefer incremental polish over reinvention.

## Supported Surfaces

- App header with title, workspace picker, tabs, theme toggle, and "New issue"
- Issues view
- Epics view
- Board view
- Issue detail dialog and sidebar property cards
- New issue dialog
- Fatal error dialog
- Toasts, badges, chips, and inline controls

## Theme Model

Both themes share the same semantic structure, spacing scale, and component
hierarchy.

### Light Theme Tokens

| Token            | Value     |
| ---------------- | --------- |
| `--bg`           | `#ffffff` |
| `--panel-bg`     | `#fafafa` |
| `--fg`           | `#222222` |
| `--muted`        | `#666666` |
| `--border`       | `#e5e7eb` |
| `--link`         | `#1d4ed8` |
| `--link-hover`   | `#1e40af` |
| `--link-visited` | `#6d28d9` |
| `--control-bg`   | `#ffffff` |
| `--button-bg`    | `#f3f4f6` |

### Dark Theme Tokens

| Token            | Value     |
| ---------------- | --------- |
| `--bg`           | `#0b1021` |
| `--panel-bg`     | `#0f172a` |
| `--fg`           | `#e5e7eb` |
| `--muted`        | `#9ca3af` |
| `--border`       | `#1f2937` |
| `--link`         | `#93c5fd` |
| `--link-hover`   | `#bfdbfe` |
| `--link-visited` | `#c4b5fd` |
| `--control-bg`   | `#111827` |
| `--button-bg`    | `#1f2937` |

### Semantic Accent Colors

| Semantic     | Base      |
| ------------ | --------- |
| Open         | `#51cb4e` |
| In progress  | `#666666` |
| Closed       | `#5f26c9` |
| Bug / P0     | `#9f2011` |
| Epic / P1    | `#f69842` |
| Task / P2    | `#cd9e33` |
| Feature / P3 | `#51cb43` |
| Chore / P4   | `#666666` |

Rules:

- Use semantic colors mainly in badges, indicators, and selected states.
- Do not flood whole layouts with semantic fills.
- Keep error styling warmer and stronger than normal status styling.

## Typography, Density, and Shape

- Keep the current system sans stack for primary UI text.
- Use monospace for issue IDs and technical metadata.
- Favor compact headings and medium-to-semibold weights over large size jumps.
- Preserve the 2px-based spacing rhythm; prefer 8, 12, 16, 20, and 32px steps.
- Keep the UI dense but breathable; detail views can breathe more than lists.
- Use restrained radii, hairline borders, and soft shadows mainly for dialogs
  and board cards.

## Component Guidance

- Header: sticky, compact, operational rather than decorative.
- Lists: optimize for scanability; title first, metadata second.
- Board: workflow columns should feel stable; cards may feel slightly lifted but
  not gamified.
- Detail dialog: highest information density; main content and sidebar must feel
  coordinated.
- Dialogs: concise, direct, and native-modal in tone.
- Badges/chips: compact, semantic, readable, and never ornamental filler.

## Interaction and Tone

- Focus styles must be visible in both themes.
- Hover and selected states should rely on subtle contrast and border shifts.
- Motion should confirm interaction, not entertain.
- UI copy should be direct, short, operational, and unambiguous.

## Accessibility Baseline

Every design or edit must preserve:

- Clear keyboard focus
- Readable contrast in both themes
- Distinct hover, selected, disabled, and error states
- Legible text in dense layouts

## Non-Goals

This brand book does not authorize:

- A new logo system
- A new font rollout
- Replacing the current semantic color families
- A dashboard-heavy SaaS redesign

## Acceptance Standard

A design is on-brand if it belongs beside the existing screens, works in both
themes, preserves density and task clarity, and keeps semantic colors
meaningful.

For agent execution rules, use
[ui-design.md](/d:/coding/beads-enhanced-ui/docs/ui-design.md).
