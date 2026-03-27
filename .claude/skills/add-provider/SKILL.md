---
name: add-provider
description:
  Use when adding, implementing, or scaffolding a new provider — any OCR engine,
  LLM backend, embedding model, vector store, or file storage backend.
argument-hint: '<type> <name>  (e.g. ocr ocrflux)'
---

Before writing any code, confirm:

- **Provider type:** `ocr | llm | embedding | vector_store | storage`
- **Provider name:** short identifier used in env var values (e.g. `ocrflux`,
  `claude`, `qdrant`)

If either is unclear from context, ask the user.

## Stage 1 — Read the ABCs

Read `app/providers/base.py` to get the exact interface the new class must
implement. Do not infer signatures from other implementations.

## Stage 2 — Read a reference implementation

Map type → subdirectory:

- `ocr` → `app/providers/ocr/`
- `llm` → `app/providers/llm/`
- `embedding` → `app/providers/embedding/`
- `vector_store` → `app/providers/vector_store/`
- `storage` → `app/providers/storage/`

Read one existing file in that subdirectory to match import style and file
structure.

## Stage 3 — Create the implementation file

Create `app/providers/<subdir>/<name>.py`. The class must:

- Inherit from the correct ABC
- Implement every abstract method with exact signatures from `base.py`
- Read all config from `app/config.py` — never `os.environ` directly
- Include a docstring stating which env var value activates it

## Stage 4 — Register the provider

Read `app/registry.py`. Add a branch for the new provider name in the
appropriate factory function, following the existing pattern exactly.

## Stage 5 — Update `.env.example`

Add the new name as a comment option on the relevant line:

```
OCR_PROVIDER_1=marker    # marker | ocrflux | <new_name>
```

## Stage 6 — Run /check-abstractions

Verify no direct imports of the new class leaked outside `registry.py`.

## Completion checklist

- [ ] ABC interface fully implemented with correct signatures
- [ ] All config read through `app/config.py`
- [ ] Branch added in `app/registry.py`
- [ ] `.env.example` updated
- [ ] check-abstractions passed
