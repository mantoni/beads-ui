---
name: refactor-code
description:
  Rules and practices for safely handling non-trivial refactors in this
  repository. Use when restructuring shared FastAPI, Celery, pipeline, provider,
  config, schema, or indexing behavior; changing public interfaces or defaults;
  or moving code across modules with cross-cutting impact.
---

Use for any change that:

- Restructures shared code in `app/api/`, `app/tasks/`, `app/pipeline/`,
  `app/providers/`, `app/registry.py`, or `app/config.py`
- Changes public request/response schemas, task signatures, config keys,
  defaults, or status transitions
- Moves or renames modules used across multiple packages
- Changes hybrid search, chunking, arbitration, provider selection, or indexing
  behavior
- Requires coordination between code, tests, and docs

Do not use for: doc-only changes, typo fixes, or narrow single-file edits with
no shared-behavior risk.

## TDD-First Rule

Before changing any production code:

1. Write or update a unit test that describes the behavior being preserved (or
   the bug being fixed).
2. Run it and confirm it passes (behavior preservation) or fails for the
   expected reason (bug fix).
3. Change production code.
4. Rerun the protecting test. It must pass before the refactor is considered
   complete.

Name protecting tests by behavior, not by implementation:

- Good: `test_arbitrator_prefers_higher_confidence_text`
- Good: `test_process_page_skips_when_status_is_not_queued`
- Avoid: `test_refactor_pipeline`

## Plan First

For non-trivial refactors, write a brief plan before broad edits. The plan
should:

- Name the protecting test
- List affected files and public APIs
- Specify execution order with risk levels
- Note call sites, docs that must stay aligned, and any migration steps

## High-Risk Areas

Extra care is required in these areas because they have hidden coupling across
the system:

| Area                                               | Risk                                                                          |
| -------------------------------------------------- | ----------------------------------------------------------------------------- |
| `app/registry.py` and `app/config.py`              | Provider swaps and config loading must stay centralized                       |
| `app/pipeline/normalizer.py` and downstream stages | Bypassing normalization silently corrupts later stages                        |
| `app/tasks/`                                       | Task fan-out, idempotency guards, and status transitions can regress silently |
| Search and indexing code                           | `EMBEDDING_MODEL`, vector-store behavior, and chunk IDs must stay compatible  |
| API routes and schemas                             | Frontend, tests, and docs can drift if contracts change                       |
| Schema or migration changes                        | Reprocessing, indexing, and task assumptions can break across the pipeline    |

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

If the refactor changes a public method signature, schema, task name, status
value, or config key:

- Check all call sites before renaming.
- Prefer adding the new form and deprecating the old one if call sites are
  numerous.
- Document the migration path in the plan and update docs in `docs/` or
  `.env.example` as needed.

## Repo-Specific Safety Rules

- Do not import a concrete provider outside `app/registry.py`.
- Do not read `os.environ` or `os.getenv` outside `app/config.py`.
- Do not bypass the Normalizer before arbitration, chunking, or indexing.
- Do not change embedding defaults or vector metadata assumptions without
  accounting for full reindex requirements.
- Do not remove task pre-condition checks; idempotency guards are part of
  behavior, not incidental implementation.

## Validation After Refactoring

Run in this order:

1. Run the smallest protecting test first.
2. Run the narrowest relevant `pytest` target for the changed area.
3. If shared pipeline or task behavior changed, run `pytest tests/`.
4. If API, config, or workflow expectations changed, update the relevant docs
   and `.env.example`.
5. If frontend-visible behavior changed and the app is runnable, run the
   narrowest relevant browser check.

Do not call the refactor complete if the protecting test story, validation, and
docs are out of sync.
