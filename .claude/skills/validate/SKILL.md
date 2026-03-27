---
name: validate
description: Select and run the right verification steps based on what changed. Use after making code, docs, config, migration, or skill changes to confirm the result is coherent.
---

Inspect what changed first, then run the smallest meaningful verification and broaden only when the change surface requires it.

## Decision Table

| What changed | Commands to run |
|---|---|
| `tests/unit/**` only | `pytest tests/unit/` or the narrowest file target |
| `tests/integration/**` only | Narrowest relevant `pytest tests/integration/...` target |
| Pure pipeline or helper logic in `app/` | Protecting unit test first, then narrow `pytest tests/unit/...` |
| Task, ORM, provider wiring, API, or config behavior | Narrowest relevant integration test, then broaden as needed |
| Migrations in `alembic/` | Smallest Alembic validation that proves upgrade path plus any affected integration test |
| `.claude/**` or `ORCHESTRATION.md` only | No app test run required; verify referenced paths, commands, and repo conventions |
| Docs only (`docs/**`, `AGENTS.md`, `CONTRIBUTING.md`, `.env.example`) | Review for accuracy and path/command consistency |
| Mixed code + tests | Protecting test first, then the narrowest affected `pytest` target, then `pytest tests/` if shared behavior changed |

## Common Commands

```powershell
pytest tests/unit/
pytest tests/integration/
pytest tests/
alembic current
alembic upgrade head
```

## Rules

- Run the smallest protecting test first whenever behavior is changing.
- Prefer targeted `pytest` invocations over full-suite runs unless the change is broad.
- If provider, task, schema, or config behavior changed, make sure the validation covers the changed contract, not just importability.
- For `.claude/**` and `ORCHESTRATION.md` changes, verify that referenced paths, commands, and role boundaries exist in the repo before calling the work complete.
- If the target code does not exist yet and the change is documentation or orchestration only, do not invent runtime validation; state that the verification was a consistency review.
- If full validation cannot run, say exactly what was skipped and why.
