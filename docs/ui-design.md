# Beads UI Design Guide For AI Agents

**Status:** draft **Date:** 2026-03-28 **Scope:** Practical rules for creating
or editing Beads UI designs.

---

## Read First

Use this guide for AI-driven UI design work in this repo. The product already
has a stable shell, explicit light/dark theme support, and implemented view
families. Extend or refine that system; do not replace it casually.

Read [brand-book.md](/d:/coding/beads-enhanced-ui/docs/brand-book.md) before
inventing new patterns.

## Product Surfaces

Design work should align with these surfaces:

- Header and app shell
- Issues view
- Epics view
- Board view
- Issue detail dialog
- New issue dialog
- Fatal error dialog

## Default Assumptions

Unless the task explicitly says otherwise:

- Preserve the existing information architecture
- Keep one light and one dark version
- Keep current semantic mappings for status, type, and priority
- Prefer editing existing components over creating parallel ones
- Keep the product feeling local, operational, and dense

## Required Output For Any Design Task

Every design proposal must define:

1. Light theme behavior
2. Dark theme behavior
3. Relevant hover, focus, selected, disabled, and error states
4. Narrow-width behavior when the surface can collapse or stack

If one of those is unchanged, say so explicitly.

## Screen Rules

- Header: keep it sticky, compact, and operational; do not turn it into a hero.
- Issues view: optimize for scanning rows quickly; title first, metadata second.
- Epics view: make progress and hierarchy obvious without extra noise.
- Board view: preserve the workflow columns and make cards draggable without
  looking playful.
- Detail dialog: keep title/identity prominent and maintain a clear split
  between narrative content and sidebar properties.
- Dialogs: keep new-issue flows efficient and fatal-error flows serious and
  high-signal.

## Theme Rules

- Design both themes deliberately; do not treat dark mode as an afterthought.
- Keep semantic meaning stable across themes even when contrast treatment
  changes.
- Light theme should feel paper-like and clear.
- Dark theme should use layered navy/slate surfaces rather than pure black.
- Preserve separation between page background, panel background, and controls in
  both themes.

## Semantic Color Rules

Use the existing semantic families consistently:

- Open: green
- In progress: neutral gray
- Closed: violet
- Bug / P0: deep red
- Epic / P1: orange
- Task / P2: amber
- Feature / P3: green
- Chore / P4: gray

Do not assign new meanings to these colors without explicit approval. Prefer
badge/chip treatment over full-panel fills.

## Layout and Component Rules

- Favor compact, high-utility layouts and stable alignment.
- Keep whitespace purposeful; do not lower information density for style alone.
- Use sans for main text and monospace for IDs/technical metadata.
- Neutral buttons should recede; primary actions should stand out without being
  loud; danger actions should be rare and distinct.
- Inputs and selects need visible boundaries and focus states in both themes.
- Badges should stay compact, pill-shaped, and semantic.
- Board cards may use light elevation; standard rows should rely more on
  structure than shadow.

## Editing Existing Designs

When editing an existing design:

1. Identify the adjacent pattern already in use.
2. Reuse existing spacing, semantic colors, and component behavior.
3. Change the smallest coherent surface first.
4. Confirm the result still works in light and dark themes.
5. Document intentional deviations from current patterns.

## Creating New Designs

When creating a new surface:

1. Start from the existing shell and token model.
2. Map the surface to an existing family: list, board, detail, or dialog.
3. Reuse established semantic colors, component shapes, and density rules.
4. Produce both theme variants in the initial concept.
5. Keep the design compatible with the current vanilla-JS, CSS-variable-based
   implementation.

## What To Avoid

- Marketing-site layouts
- Empty whitespace that reduces information density
- Theme-specific structure changes that make light and dark feel like different
  products
- Purple-heavy redesigns that blur the closed-state meaning
- Decorative color replacing semantic badge language
- Overdesigned shadows, gradients, or card treatments on routine screens

## Review Checklist

Before calling a design complete, check:

- Does it still look like Beads?
- Does it work in both light and dark themes?
- Is the hierarchy clear at a glance?
- Are status, type, and priority still semantically consistent?
- Can it be implemented with the current architecture and CSS-token model?
- Did the change improve task flow rather than just alter aesthetics?

## If The Request Is Ambiguous

Ask one concise question only if it is unclear whether you should design a new
surface, refine an existing one, do Pencil work, or implement code.
