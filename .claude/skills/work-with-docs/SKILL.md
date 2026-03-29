---
name: work-with-docs
description:
  Rules for creating and maintaining project documentation. Use when writing or
  editing plans, reviews, architecture docs, ADRs, or protocol docs.
---

## Folder Conventions

| Path                  | What goes there                                                                                                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/plans/`         | Implementation plans and scoped design plans                                                                                                                                                    |
| `docs/reviews/`       | Code review reports with findings and recommended actions                                                                                                                                       |
| `docs/architecture.md` | High-level design and architecture intent                                                                                                                                                      |
| `docs/adr/`           | Architectural Decision Records (ADRs) for significant decisions                                                                                                                                 |
| `docs/protocol/`      | WebSocket message protocol specs and subscription model docs                                                                                                                                    |
| `app/protocol.md`     | Human-readable protocol reference alongside the JS definition                                                                                                                                   |
| `AGENTS.md`           | Project-wide policy only: architecture invariants, trivial/non-trivial rules, skill compliance. Procedure for a specific task type belongs in the matching skill, not here. Target: ≤150 lines. |

Never create plan or review files at the `docs/` root.

## Plan Naming

Use:

`docs/plans/yyyy-MM-dd-<author>-<plan-name>.md`

Examples:

- `docs/plans/2026-03-28-codex-ws-protocol-refactor.md`
- `docs/plans/2026-03-28-codex-subscription-store.md`

## Review Naming

Use:

`docs/reviews/yyyy-MM-dd-review-<topic>.md`

## ADR Naming

Use sequential numbering:

`docs/adr/NNN-<short-title>.md`

## Plan Template

```markdown
# <Plan Title>

**Status:** draft | in-progress | done **Date:** yyyy-MM-dd **Scope:**
<one sentence>

---

## Overview

<1-2 sentences>

## Steps

### Step N - <Title> (Risk: Low/Medium/High)

**Files:** `path/to/file.js` **Problem:** <what is wrong> **Change:**
<what to do> **Validation:** `<command>`
```

## Format Rules

- Keep docs concise and split them if they grow unwieldy.
- Prefer bullets, tables, and compact examples over long prose.
- Use absolute dates, never relative dates.
- Do not duplicate content already documented elsewhere; link to it instead.
- Verify every path, command, and behavior against the current repo before
  writing.
- If behavior is not yet implemented, label design intent clearly instead of
  implying it exists.

## What Not To Put In Docs

- Credentials, API keys, tokens, or auth-bearing URLs
- Code-level implementation detail that belongs in source comments
- Duplicate content that should instead reference an existing doc
