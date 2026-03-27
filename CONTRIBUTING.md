# Contributing — ScannedDoc RAG Platform

## Testing

### Unit tests — `tests/unit/`

Test pure logic: Normalizer, Arbitrator heuristics, Chunker, RRF scoring. No external dependencies.

Use an isolated invocation so the repo-level integration fixtures in `tests/conftest.py` do not get pulled into unit runs:

```bash
pytest --confcutdir=tests/unit tests/unit
```

### Integration tests — `tests/integration/`

Hit a real PostgreSQL database. Never mock the database — mock/prod divergence has caused silent failures before. Provider classes may be replaced with lightweight fakes that implement the same ABC from `app/providers/base.py`.

Set a test-specific `DATABASE_URL` in `tests/conftest.py`.

### Naming

- Files: `test_<module>.py`
- Functions: `test_<what>_<expected_outcome>`

### Running

```bash
python -m compileall app tests
python -m pytest --confcutdir=tests/unit tests/unit
python -m pytest tests/integration
```

GitHub Actions runs backend compile/import smoke checks, isolated unit tests, integration tests, and the frontend build for pull requests that touch application-relevant paths.

All tests must pass before merging. Aim for full unit coverage of `app/pipeline/`.
