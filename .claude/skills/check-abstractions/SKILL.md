---
name: check-abstractions
description: Use before any substantial commit, and automatically after adding a provider, task, or pipeline module. Audits provider abstraction integrity across the codebase.
---

Run all five checks. For each: report every violation with file path and line number. State explicitly when a check is clean.

## Check 1 — Concrete provider imports outside `registry.py`
Grep for imports from `app/providers/` in files other than `app/registry.py`.

Pattern: `from app\.providers\.(ocr|llm|embedding|vector_store|storage)\.`

Exclude `tests/` — ABC-implementing fakes are allowed there.

Any match outside `registry.py` is a **critical violation**.

## Check 2 — Direct env var access outside `config.py`
Grep for `os\.environ` and `os\.getenv` everywhere except `app/config.py`.

All configuration must flow through `app/config.py` (Pydantic `BaseSettings`).

## Check 3 — Hardcoded service URLs
Grep for string literals containing `localhost`, `127\.0\.0\.1`, or `0\.0\.0\.0`, excluding:
- `app/config.py`
- `docker-compose.yml`
- `.env.example`
- `tests/`

## Check 4 — Normalizer bypass
In `app/tasks/`, look for any DB write to `blocks` or call to an arbitration function that does not also call the normalizer from `app/pipeline/normalizer.py`.

## Check 5 — Missing idempotency guards
Read all files in `app/tasks/`. For each `@celery_app.task`-decorated function, confirm the first substantive operation is a status pre-condition check. Flag any task that writes to the DB before checking current status.

## Output format

```
VIOLATIONS FOUND: <n>

[CRITICAL] Check 1 — Concrete provider import outside registry.py
  app/tasks/page_tasks.py:14  from app.providers.ocr.marker import MarkerOcrProvider

[WARNING] Check 2 — Direct env var access
  app/pipeline/arbitrator.py:8  url = os.getenv("OLLAMA_URL")

CLEAN: Check 3 — No hardcoded service URLs
CLEAN: Check 4 — Normalizer not bypassed
CLEAN: Check 5 — All tasks have idempotency guards
```

Close with: `All checks passed.` or `X violation(s) found — fix before committing.`
