---
name: write-test
description:
  Rules for writing and placing tests in this project. Use when creating or
  updating unit or integration tests for the FastAPI, Celery, pipeline,
  provider, or schema layers.
---

## Test Locations

| Type              | Location             |
| ----------------- | -------------------- |
| Unit tests        | `tests/unit/`        |
| Integration tests | `tests/integration/` |

## Default Placement

- Pure logic in `app/pipeline/`, scoring, normalization, arbitration, or
  helpers: `tests/unit/`
- Code that touches Postgres sessions, Celery task flow, ORM models, or provider
  wiring: `tests/integration/`
- If a change crosses both boundaries, prefer a small unit test first, then add
  the narrowest integration test that proves wiring or state transitions

## Rules

- Use `pytest`.
- Name files `test_<module>.py`.
- Name tests `test_<behavior>_<expected_outcome>`.
- Keep one test focused on one behavior. Avoid broad scenario piles in a single
  test.
- Integration tests must hit a real PostgreSQL database. Do not mock the
  database.
- Provider-dependent integration tests may use lightweight fakes that still
  implement the same ABC from `app/providers/base.py`.
- Keep secrets, tokens, and credentials out of test code. Read required values
  from config or test fixtures.
- For non-trivial refactors, follow the `refactor-code` skill and add the
  protecting test before changing production code.
- If the code under discussion does not exist yet and only design docs changed,
  do not fabricate tests; describe the protecting test that should be added when
  implementation lands.

## Review Checklist

- The test is in the right layer: unit vs integration
- The name describes behavior, not implementation
- The assertion checks the contract that matters
- Setup is minimal and local to the test unless a shared fixture is clearly
  warranted
- Integration coverage is added when status transitions, DB writes, task
  orchestration, or provider wiring changed
