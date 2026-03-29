---
name: frontend-implementation
description:
  Implementing or updating browser UI code under app/ and app/views/ for this
  project. Use when changing rendered markup, interactive controls, dialogs,
  view composition, or frontend-facing behavior in the Beads UI. Do not use
  for Pencil design-only work.
---

## Scope

Use this skill for code changes in:

- `app/views/**`
- `app/main.js`
- `app/router.js`
- `app/state.js`
- `app/ws.js`
- closely related `app/utils/**` helpers that directly support rendered UI

Do not use it for:

- Pencil-only design work; use `designer`
- non-trivial shared refactors without also using `refactor-code`
- test-only work without frontend code changes

## Workflow

1. Read the existing view/module and the nearest colocated tests before editing.
2. Preserve existing lit-html, vanilla JS, and view composition patterns unless
   the task explicitly changes them.
3. Keep changes local to the affected view or shared renderer when possible.
4. If the change is non-trivial, also use `refactor-code`.
5. If tests are added or updated, also use `write-test`.
6. After edits, use `validate` to pick the narrowest meaningful checks.

## Test IDs

Add stable `data-testid` attributes to significant rendered elements and
primary controls in any frontend code you add or materially change.

Use these rules:

- Use `data-testid`, never `testid`, `test-id`, or new alternate forms.
- Prefer view-scoped kebab-case names such as `list-view`,
  `detail-status-select`, `board-column-ready`.
- For repeated or dynamic entities, include the entity id in the value, such as
  `issue-row-UI-12`, `board-card-UI-12`, `epic-group-UI-12`.
- Cover significant structure and user-facing controls:
  view roots, tables, headers, rows/cards, dialogs, forms, key inputs, primary
  actions, sort/filter controls, and expandable sections.
- Do not add IDs to every decorative wrapper. Favor stable test surfaces over
  noisy markup.
- When touching an older area that uses `testid` or `test-id`, prefer moving
  the changed code toward `data-testid` instead of extending the older pattern.

## Accessibility And Interaction

- Preserve existing keyboard and focus behavior.
- Keep ARIA labels and roles aligned with visible controls.
- Avoid introducing test IDs in a way that changes semantics or event flow.

## Tests

- Update existing view tests when new `data-testid` hooks are intended to be
  stable test surfaces.
- Prefer assertions against the new stable hooks over brittle selector chains
  when the element is a primary interaction point.

## Coordination

- `designer`: design-only work in Pencil; no code.
- `refactor-code`: required for non-trivial shared frontend changes.
- `write-test`: how to structure and place tests.
- `validate`: what checks to run.
- `playwright-cli`: browser verification when needed.
