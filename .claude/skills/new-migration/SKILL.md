---
name: new-migration
description: Use when creating a new Alembic database migration. Handles generation, correction of common autogenerate mistakes, and round-trip testing.
argument-hint: "<description>  (e.g. add_blocks_table)"
---

If no description was provided, ask for one in snake_case before proceeding.

## Stage 1 — Check current migration state
Run:
```bash
alembic current
```
Confirm the DB is reachable and at a known revision. If not, stop and report — do not generate against an unknown base.

## Stage 2 — Generate the migration
Run:
```bash
alembic revision --autogenerate -m "<description>"
```
Note the generated file path from stdout.

## Stage 3 — Read and correct the generated file
Read the full generated file. Fix these common autogenerate mistakes, checking against `docs/schema.md`:

- **UUID PKs** — must use `sa.dialects.postgresql.UUID(as_uuid=True)` with `server_default=sa.text("gen_random_uuid()")`
- **JSONB columns** — autogenerate emits `JSON`; correct to `JSONB` for `ocr_raw_1`, `ocr_raw_2`, `ocr_result`, `content`, `bbox`
- **ENUM types** — verify `create_type=True` and values match the schema doc exactly
- **GIN FTS index** — never emitted automatically; add manually if the migration touches `blocks.content`:
  ```python
  op.execute("CREATE INDEX idx_blocks_fts ON blocks USING gin(to_tsvector('english', content->>'text'))")
  ```
- **Denormalized columns on `blocks`** — verify `document_id` and `page_number` are present if creating that table

## Stage 4 — Annotate manual edits
Add a comment at the top of `upgrade()`:
```python
def upgrade() -> None:
    # Manual: JSONB corrected from JSON, GIN index added
    ...
```

## Stage 5 — Test the round-trip
Run:
```bash
alembic upgrade head && alembic downgrade -1 && alembic upgrade head
```
Fix any failures before declaring complete.

## Completion checklist
- [ ] `alembic current` confirmed before generation
- [ ] UUID, JSONB, and ENUM types verified against `docs/schema.md`
- [ ] GIN FTS index added if `blocks.content` is involved
- [ ] Manual edits annotated in `upgrade()`
- [ ] Round-trip passes
