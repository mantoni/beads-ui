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

| Token              | Value     | Notes                                              |
| ------------------ | --------- | -------------------------------------------------- |
| `--bg`             | `#0d1426` | Canvas / page background                           |
| `--panel-bg`       | `#111a2f` | Cards, rows, list items, topbar, header strips     |
| `--surface-raised` | `#141f38` | Active tab, elevated panels                        |
| `--control-bg`     | `#151f35` | Toggle, input backgrounds                          |
| `--button-bg`      | `#2b364a` | Button surface, toggle knob                        |
| `--border`         | `#25304a` | Topbar, header strip borders                       |
| `--border-row`     | `#28334d` | Card / row inside borders                          |
| `--border-tab`     | `#2f3a55` | Active tab border                                  |
| `--button-border`  | `#3b4860` | Button and control inside border                   |
| `--fg-strong`      | `#f4f7fc` | Brand label, button text, active tab text          |
| `--fg`             | `#d9e0ea` | Primary content text (row titles, IDs)             |
| `--fg-mid`         | `#a8b0c0` | Secondary labels (inactive tabs, column headers, progress counts) |
| `--fg-dim`         | `#8794ad` | Tertiary labels (workspace path)                   |
| `--muted`          | `#6b7b99` | Icons, deemphasized text                           |
| `--link`           | `#93c5fd` |                                                    |
| `--link-hover`     | `#bfdbfe` |                                                    |
| `--link-visited`   | `#c4b5fd` |                                                    |

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

- Primary UI font: **Inter**. Use it for all UI text.
- Issue IDs and technical metadata currently use Inter as well; migrate to
  monospace if a monospace token is introduced.
- Weight scale in use: 500 (content), 600 (labels/pills), 700 (tabs/headers),
  800 (brand/buttons/active states).
- Size scale in use: 11px (pills, column headers), 12px (annotations), 13px
  (button labels), 14px (secondary labels), 16px (tabs), 17px (progress
  counts), 18px (row titles and IDs).
- Preserve the 2px-based spacing rhythm; prefer 8, 12, 16, 20, and 32px steps.
- Keep the UI dense but breathable; detail views can breathe more than lists.
- Use restrained radii, hairline borders, and soft shadows mainly for dialogs
  and board cards.
- Row/card radius: 7px. Pill/badge radius: 999px (full round). Button radius:
  6px.

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
