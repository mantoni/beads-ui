# AGENTS.md — Beads Enhanced UI

> Read this before writing any code. Keep it short; details live in `docs/`.

**Scope of this file:** project-wide policy only — what the project is,
architecture invariants, trivial/non-trivial classification, validation rules,
and skill compliance. Procedure for a specific task type belongs in the matching
skill, not here. If a topic already has a skill, keep the details there.
Target: ≤150 lines.

---

## What this project is

`beads-enhanced-ui` is the local web UI for the `bd` CLI ([Beads](https://github.com/steveyegge/beads)
issue tracker). Run with `bdui start`. It provides:

- **Issues view** — filterable list, inline editing
- **Epics view** — epic progress, expandable rows
- **Board view** — Blocked / Ready / In Progress / Closed columns
- **Detail view** — full issue detail, notes, dependencies, design
- **Multi-workspace** — switch projects via dropdown

Tech: Node.js / Express server, vanilla-JS browser frontend, WebSocket for
live updates, Vitest for tests.

## Where things live

- `server/` — Express HTTP + WebSocket server, Beads CLI bridge (`bd.js`), DB watcher, workspace registry
- `app/` — Browser-side entry (`main.js`), state (`state.js`), router (`router.js`), WebSocket client (`ws.js`), styles (`styles.css`)
- `app/views/` — View modules: `list.js`, `epics.js`, `board.js`, `detail.js`,
  `nav.js`, dialogs
- `app/data/` — Data utilities
- `app/utils/` — Shared utilities
- `types/` — TypeScript interface/type definitions (no runtime code)
- `test/` — Test infrastructure and helpers
- `docs/` — Project documentation
- `bin/` — CLI entry points (`bdui`)
- `scripts/` — Build and tooling scripts
- `.pencil/` — Pencil design files (`.pen`); access via Pencil MCP only

## Core Rules

- Read relevant code and docs before changing behavior.
- Prefer small, local changes over speculative refactors.
- Preserve existing behavior unless the task explicitly requires a change.
- Do not add dependencies unless current dependencies are insufficient.
- Update docs when public usage, extension points, or workflow expectations
  change.
- For framework refactoring, use a TDD approach: add or adjust the protecting
  test first, confirm it fails for the expected reason, then change production
  code and re-run the smallest relevant checks.

## Trivial vs Non-Trivial Tasks

### Trivial

Usually trivial if most are true:

- One file or a very small related set
- Docs/comments/naming/formatting only
- Narrow low-risk bug fix
- No protocol, routing, subscription, or shared state change
- No migration path or cross-module coordination needed

Examples: typo fix, broken doc link, local rename, log wording cleanup.

### Non-Trivial

Treat as non-trivial if any are true:

- Adds a feature, abstraction, or extension point
- Changes shared server/client behavior or defaults
- Changes public methods, config keys, protocol schema, or CLI signatures
- Touches multiple packages or both code and docs/tests
- Needs new tests, design tradeoffs, or migration guidance
- May affect the server/client protocol, WebSocket message schema, or
  subscription model
- Changes the URL routing, view state shape, or cross-view coordination

Examples: new view, protocol message type, workspace registry change, breaking
state shape change.

## Validation

- Run the smallest meaningful verification first.
- For non-trivial work, run relevant checks before claiming completion.
- If you cannot run full validation, say what was skipped.
- For refactoring, do not treat the work as complete unless the protecting test
  is part of the validation story.

## Scope and Communication

- Do not mix unrelated cleanup into task work unless asked.
- If you see a broader issue, note it separately instead of expanding scope
  silently.
- For non-trivial work, summarize the plan before broad edits.
- State assumptions, risks, and unverified areas plainly.

## UI Work

UI tasks are either design-only (Pencil, no code) or implementation (code only
after explicit approval). Never mix them silently. If ambiguous, ask one
clarifying question. Full rules live in the `designer` skill.

## Skill Compliance

- If a task matches a local skill, use that skill and follow its workflow. Treat
  matched skills as binding procedure, not optional reference material.
- Do not replace a required skill stage, tool, or discovery method with a
  different one unless the prescribed option is unavailable or blocked.
- If you must deviate from a matched skill, state the blocker before proceeding
  and get user approval for the fallback.
- Before substantial work, declare the triggered skills, why they apply, the
  required stages/tools you will execute, and any stage you expect to skip.
- Before considering the task complete, state which selected skill stages were
  completed, skipped, or blocked.

## Skills

Project skills live in `.claude/skills/<name>/SKILL.md`. Each skill has a
`description` frontmatter field that drives automatic matching. See Skill
Compliance above.

| Skill            | Description (from frontmatter)                                                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `beads-work`     | Task and issue tracking using Beads (bd CLI). Use when the user asks for tracking or when implementation work is substantive enough to need multi-step or cross-session coordination. Replaces TodoWrite, TaskCreate, and markdown task lists. |
| `designer`       | Creating, updating, or editing UI/UX designs using the Pencil MCP. Use when the user asks to design, redesign, rework, or update screens, pages, or UI components in a .pen file.                 |
| `explain-code`   | Explaining implemented code or design flow across server, client, WebSocket, and view boundaries                                                                                                  |
| `playwright-cli` | Browser automation for local frontend verification or external-site browsing                                                                                                                      |
| `refactor-code`  | Non-trivial refactors affecting shared server, client, WebSocket, view, or protocol behavior                                                                                                      |
| `validate`       | Select and run the right verification steps based on what changed. Use after making code, docs, config, or skill changes to confirm the result is coherent.                                       |
| `work-with-docs` | Creating and maintaining plans, reviews, architecture docs, ADRs, and protocol docs                                                                                                               |
| `work-with-git`  | Branch strategy and git safety rules — creating branches, preparing commits, structuring git work                                                                                                 |
| `write-test`     | Writing and placing unit or integration tests for the server, client, view, or protocol layers                                                                                                    |

## What NOT to do

- Never read or write `.pen` files with `Read`, `Write`, `Grep`, `Glob`, or
  shell commands — use Pencil MCP tools exclusively.
- Never mix design work and implementation in the same task without explicit
  approval (see UI Work).
- Never update `CHANGES.md`.
- Never add dependencies without checking that existing ones are insufficient.
- Never invent Pencil node IDs — always derive them from tool output.

## Session End

If the task used Beads, sync and close the relevant issues before handoff. If the user explicitly asked for commit/push work or approved it, follow the `work-with-git` Session End procedure. Do not assume every task requires Beads.
