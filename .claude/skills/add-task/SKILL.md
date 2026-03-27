---
name: add-task
description: Use when adding or scaffolding a new Celery task in any app/tasks/ module.
argument-hint: "<task_name>"
---

Before writing any code, confirm:
- **Task name:** snake_case (e.g. `reprocess_page`)
- **What it does and what triggers it**
- **Queue:** `high` (OCR/splitting) or `default` (indexing/finalization)
- **Max retries:** 3 for most tasks, 5 for vector index tasks, `None` for finalization
- **Postgres pre-condition:** which status value the idempotency guard checks

If any of these are unclear, ask the user.

## Stage 1 — Identify the target module
- Document lifecycle → `app/tasks/document_tasks.py`
- Per-page OCR steps → `app/tasks/page_tasks.py`
- Embedding and indexing → `app/tasks/index_tasks.py`

If none fit, ask the user before creating a new module.

## Stage 2 — Read the target module
Read the full target file to match the Celery app instance name, import style, and session handling pattern.

## Stage 3 — Write the task
Use this exact structure:

```python
@celery_app.task(
    name="<task_name>",
    bind=True,
    max_retries=<n>,
    queue="<high|default>",
)
def <task_name>(self, <primary_id>: str) -> None:
    """<one-line description>. Triggered by: <trigger>."""
    with get_db_session() as db:
        record = db.get(<Model>, <primary_id>)
        if record is None or record.status != <ExpectedStatus>.<pre_condition>:
            return  # idempotency guard — safe to retry

        record.status = <ExpectedStatus>.<in_progress_status>
        db.commit()

    try:
        # --- task logic here ---
        pass
    except Exception as exc:
        raise self.retry(exc=exc)
```

Rules:
- The idempotency guard must be the first DB operation
- The function name must exactly match the `name=` string

## Stage 4 — Update the task graph doc
Read `docs/tasks/tasks.md` and add a row for the new task: name, module, queue, trigger, on-failure behaviour.

## Completion checklist
- [ ] Task placed in the correct module
- [ ] Idempotency guard is the first operation after DB fetch
- [ ] Queue and retry count match conventions
- [ ] Task name string matches function name exactly
- [ ] `docs/tasks/tasks.md` updated
