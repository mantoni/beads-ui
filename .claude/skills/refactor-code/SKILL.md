---
name: refactor-code
description:
  Rules and practices for safely handling non-trivial refactors in this
  repository. Use when restructuring shared server, client, WebSocket,
  view, or protocol behavior; changing public interfaces or defaults; or
  moving code across modules with cross-cutting impact.
---

Use for any change that:

- Restructures shared code in `server/`, `app/data/`, `app/utils/`,
  `app/views/`, `app/ws.js`, `app/state.js`, `app/router.js`, or
  `app/protocol.js`
- Changes the WebSocket message schema, subscription model, or push protocol
- Changes public view state shape, URL routing, or cross-view coordination
- Moves or renames modules used across multiple files
- Requires coordination between code, tests, and docs

Do not use for: doc-only changes, typo fixes, or narrow single-file edits with
no shared-behavior risk.

## TDD-First Rule

Before changing any production code:

1. Write or update a test that describes the behavior being preserved (or the
   bug being fixed).
2. Run it and confirm it passes (behavior preservation) or fails for the
   expected reason (bug fix).
3. Change production code.
4. Rerun the protecting test. It must pass before the refactor is considered
   complete.

Name protecting tests by behavior, not by implementation:

- Good: `filters reset when switching views`
- Good: `server pushes full issue list on new subscription`
- Avoid: `test_refactor_state`

## Plan First

For non-trivial refactors, write a brief plan before broad edits. The plan
should:

- Name the protecting test
- List affected files and public APIs
- Specify execution order with risk levels
- Note call sites, docs that must stay aligned, and any migration steps

## High-Risk Areas

Extra care is required in these areas because they have hidden coupling:

| Area                                    | Risk                                                                        |
| --------------------------------------- | --------------------------------------------------------------------------- |
| `app/protocol.js` and `app/ws.js`       | Protocol changes must stay in sync between server and client                |
| `server/subscriptions.js`               | Subscription model changes affect all active client connections             |
| `app/state.js` and `app/router.js`      | View state shape and URL routing are tightly coupled across all views       |
| `app/data/` stores                      | Per-subscription stores feed every view; shape changes ripple broadly       |
| `server/bd.js`                          | CLI bridge is the sole data source; interface changes affect all endpoints  |

## Step Size

- Prefer many small steps over one large refactor.
- Each step should leave the build and all tests passing.
- If a step cannot be completed atomically, stop and clarify scope before
  continuing.

## Scope Discipline

- Do not mix refactoring with feature work in the same branch.
- Do not opportunistically clean up unrelated code while refactoring.
- If you discover a separate issue, note it separately instead of silently
  expanding scope.

## Public API Changes

If the refactor changes a WebSocket message type, subscription event, view
state key, URL shape, or exported function signature:

- Check all call sites before renaming.
- Prefer adding the new form and deprecating the old one if call sites are
  numerous.
- Document the migration path in the plan and update `docs/protocol/` or
  `docs/architecture.md` as needed.

## Validation After Refactoring

Run in this order:

1. Run the protecting test first.
2. Run the narrowest relevant `npm test` target for the changed area.
3. If shared protocol, subscription, or view state changed, run `npm test`
   (full suite — these changes ripple across both sides).
4. If protocol or architecture docs need updating, update them.
5. If frontend-visible behavior changed and the app is runnable, open the
   browser and verify the affected view.

Do not call the refactor complete if the protecting test story, validation, and
docs are out of sync.
