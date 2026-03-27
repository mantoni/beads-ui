# AGENTS.md — ScannedDoc RAG Platform

> Read this before writing any code. Keep it short; details live in `docs/`.

**Scope of this file:** project-wide policy only — what the project is, architecture invariants, trivial/non-trivial classification, validation rules, skill compliance. Procedure for a specific task type (how to add a provider, how to run git, how to track issues) belongs in the matching skill, not here. If you are about to add more than two bullets on a topic that has a matching skill, put it in that skill instead. Target: ≤150 lines.

---

## What this project is

Local-first document intelligence: users upload scanned PDFs, two OCR providers process each page, an LLM arbitrator picks the better result, and the output is indexed for natural-language RAG search with page-level citations.

## Where things live

```
app/
  api/            FastAPI routes
  models/         SQLAlchemy ORM models
  schemas/        Pydantic request/response schemas
  providers/      ALL provider implementations (OCR, LLM, embedding, vector store, storage)
  pipeline/       Normalizer, Arbitrator, Chunker, HybridSearch, ContextBuilder
  tasks/          Celery tasks
  registry.py     ONLY place that maps env vars → concrete provider instances
  config.py       ONLY place that reads env vars (Pydantic BaseSettings)
docs/
  tech_diz.md     Source-of-truth design document
  schema.md       Database schema + indexes
  runbook.md      How to run the project
  tasks/
    tasks.md      Celery task graph, queue names, naming conventions
CONTRIBUTING.md   Testing conventions
.env.example      All environment variables with defaults
```

## Provider abstraction — never bypass this

Every swappable component (OCR, LLM, embeddings, vector store, file storage) implements an ABC from `app/providers/base.py`. The registry (`app/registry.py`) is the **only** place that instantiates concrete classes.

```python
# WRONG — imports concrete class anywhere outside registry.py
from app.providers.ocr.marker import MarkerOcrProvider

# CORRECT — always go through the registry
from app.registry import get_ocr_provider_1
provider = get_ocr_provider_1()
```

Swapping providers requires only an env var change. If a swap requires a code change outside `app/providers/` or `app/registry.py`, the abstraction is broken.

## Core Rules

- Read relevant code and docs before changing behavior.
- Prefer small, local changes over speculative refactors.
- Preserve existing behavior unless the task explicitly requires a change.
- Do not add dependencies unless current dependencies are insufficient.
- Update docs when public usage, extension points, or workflow expectations change.
- For framework refactoring, use a TDD approach: add or adjust the protecting test first, confirm it fails for the expected reason, then change production code and re-run the smallest relevant checks.

## Trivial vs Non-Trivial Tasks

### Trivial

Usually trivial if most are true:

- One file or a very small related set
- Docs/comments/naming/formatting only
- Narrow low-risk bug fix
- No API, config, pipeline, provider, or task change
- No migration path or cross-module coordination needed

Examples: typo fix, broken doc link, local rename, log wording cleanup.

### Non-Trivial

Treat as non-trivial if any are true:

- Adds a feature, abstraction, or extension point
- Changes shared pipeline behavior or defaults
- Changes public methods, config keys, schema, or task signatures
- Touches multiple packages or both code and docs/tests
- Needs new tests, design tradeoffs, or migration guidance
- May affect Celery task fan-out, idempotency, provider swapping, or the vector index

Examples: new provider implementation, Alembic migration, pipeline stage change, new Celery task, embedding model swap.

## Validation

- Run the smallest meaningful verification first.
- For non-trivial work, run relevant checks before claiming completion.
- If you cannot run full validation, say what was skipped.
- For refactoring, do not treat the work as complete unless the new or updated protecting test is part of the validation story.

## Scope and Communication

- Do not mix unrelated cleanup into task work unless asked.
- If you see a broader issue, note it separately instead of expanding scope silently.
- For non-trivial work, summarize the plan before broad edits.
- State assumptions, risks, and unverified areas plainly.

## UI Work

UI tasks are either design-only (Pencil, no code) or implementation (code only after explicit approval). Never mix them silently. If ambiguous, ask one clarifying question. Full rules in the `designer` skill.

## Skill Compliance

- If a task matches a local skill, use that skill and follow its workflow. Treat matched skills as binding procedure, not optional reference material.
- Do not replace a required skill stage, tool, or discovery method with a different one unless the prescribed option is unavailable or blocked.
- If you must deviate from a matched skill, state the blocker before proceeding and get user approval for the fallback.
- Before substantial work, declare the triggered skills, why they apply, the required stages/tools you will execute, and any stage you expect to skip.
- Before considering the task complete, state which selected skill stages were completed, skipped, or blocked.

## Skills

Project skills live in `.claude/skills/<name>/SKILL.md`. Each skill has a `description` frontmatter field that drives automatic matching — the agent recognizes a task, reads the skill, and follows its procedure without requiring explicit invocation. See Skill Compliance below.

| Skill | Description (from frontmatter) |
|---|---|
| `add-provider` | Adding any new OCR, LLM, embedding, vector store, or storage implementation |
| `add-task` | Adding or scaffolding a new Celery task in any `app/tasks/` module |
| `beads-work` | Task and issue tracking using Beads (bd CLI). Use for substantive work tracking, status updates, session management, and work discovery. Replaces TodoWrite, TaskCreate, and markdown task lists. |
| `check-abstractions` | Before any substantial commit; also auto-runs after adding a provider, task, or pipeline module |
| `debug-page` | Investigating a stuck, failed, or anomalous page in the OCR pipeline |
| `designer` | Creating, updating, or editing UI/UX designs using the Pencil MCP. Use when the user asks to design, redesign, rework, or update screens, pages, or UI components in a .pen file. |
| `explain-code` | Explaining implemented code or design flow across FastAPI, Celery, pipeline, provider, or schema boundaries |
| `new-migration` | Creating any Alembic migration |
| `playwright-cli` | Browser automation for local frontend verification or external-site browsing |
| `refactor-code` | Non-trivial refactors that affect shared behavior, interfaces, or cross-module structure |
| `validate` | Select and run the right verification steps based on what changed |
| `work-with-docs` | Creating and maintaining plans, reviews, runbooks, schema docs, design docs, or workflow instructions |
| `work-with-git` | Branch strategy and git safety rules — creating branches, preparing commits, structuring git work |
| `write-test` | Writing and placing unit or integration tests for the FastAPI, Celery, pipeline, provider, or schema layers |

## What NOT to do

- **Hardcode a provider, model name, or URL** outside `config.py`
- **Import a concrete provider** outside `registry.py`
- **Skip the Normalizer** — all raw OCR output must pass through `app/pipeline/normalizer.py` before reaching anything downstream
- **Change `EMBEDDING_MODEL`** without a full vector index rebuild — silent wrong results otherwise
- **Write to `ocr_raw_1`/`ocr_raw_2` after the OCR step** — these are write-once debug records
- **Call `os.environ`/`os.getenv`** outside `app/config.py`
- **Fan out Celery tasks without an idempotency guard** — every task checks Postgres status before doing work

## Session End

Close finished Beads issues, then push. Full procedure in the `work-with-git` skill (Session End) and `beads-work` skill. Work is not complete until `git push` succeeds.
