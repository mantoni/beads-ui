---
name: work-with-docs
description: Rules for creating and maintaining project documentation. Use when writing or editing plans, reviews, runbooks, schema docs, design docs, or workflow instructions.
---

## Folder Conventions

| Path | What goes there |
|---|---|
| `docs/plans/` | Implementation plans and scoped design plans |
| `docs/reviews/` | Code review reports with findings and recommended actions |
| `docs/runbook.md` | Local setup and operational workflow |
| `docs/schema.md` | Database schema and index expectations |
| `docs/tasks/tasks.md` | Celery task graph, queues, triggers, retries |
| `docs/tech_diz.md` | High-level design and architecture intent |
| `AGENTS.md` | Project-wide policy only: architecture invariants, trivial/non-trivial rules, skill compliance. Procedure for a specific task type belongs in the matching skill, not here. Target: ≤150 lines. |
| `CONTRIBUTING.md` | Testing conventions |
| `ORCHESTRATION.md` | Main-agent delegation policy |

Never create plan or review files at the `docs/` root.

## Plan Naming

Use:

`docs/plans/yyyy-MM-dd-<author>-<plan-name>.md`

Examples:
- `docs/plans/2026-03-26-codex-provider-swap.md`
- `docs/plans/2026-03-26-architect-page-pipeline-refactor.md`

## Review Naming

Use:

`docs/reviews/yyyy-MM-dd-review-<topic>.md`

## Plan Template

```markdown
# <Plan Title>

**Status:** draft | in-progress | done
**Date:** yyyy-MM-dd
**Scope:** <one sentence>

---

## Overview

<1-2 sentences>

## Steps

### Step N - <Title> (Risk: Low/Medium/High)

**Files:** `path/to/file.py`
**Problem:** <what is wrong>
**Change:** <what to do>
**Validation:** `<command>`
```

## Format Rules

- Keep docs concise and split them if they grow unwieldy.
- Prefer bullets, tables, and compact examples over long prose.
- Use absolute dates, never relative dates.
- Do not duplicate content already documented elsewhere; link to it instead.
- Verify every path, env var, command, task name, and status value against the current repo before writing.
- If the repo is still design-heavy and code paths are not implemented yet, label design intent clearly instead of implying the behavior already exists.

## What Not To Put In Docs

- Credentials, API keys, tokens, or auth-bearing URLs
- Code-level implementation detail that belongs in source comments
- Duplicate content that should instead reference an existing doc
