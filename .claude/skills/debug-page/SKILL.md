---
name: debug-page
description:
  Use when investigating a page that is stuck, failed, or produced unexpected
  OCR output. Fetches and formats the full pipeline state for that page from
  Postgres.
argument-hint: '<page_id>'
---

## Stage 1 — Resolve the page ID

If the user provided a `page_id` (UUID), use it directly.

If the user provided a filename, first query `documents` to find the
`document_id`, then list its pages so the user can pick one.

If neither is provided, ask.

## Stage 2 — Fetch the page row

```sql
SELECT
    p.id, p.page_number, p.status, p.image_path, p.processed_at,
    p.ocr_raw_1, p.ocr_raw_2, p.ocr_result,
    d.filename, d.status AS document_status
FROM pages p
JOIN documents d ON d.id = p.document_id
WHERE p.id = '<page_id>';
```

If no row returned, stop: "Page not found."

## Stage 3 — Print summary header

```
Page <page_number> of "<filename>"
Status    : <page_status>  (document: <document_status>)
Image     : <image_path>
Processed : <processed_at | "not yet">
```

## Stage 4 — Status-specific diagnosis

| Status                                  | Action                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------ |
| `pending / ocr_1 / ocr_2 / arbitrating` | Page is in flight — verify Celery worker is running                      |
| `failed`                                | Show OCR summaries (Stage 5) and suggest checking worker logs            |
| `indexing`                              | Show `ocr_result` block count — `embed_and_index` may be queued or stuck |
| `done`                                  | Show `ocr_result` summary only                                           |

## Stage 5 — Summarize OCR outputs

For each of `ocr_raw_1`, `ocr_raw_2`, `ocr_result` that is non-null, print:

- Block count
- Block type breakdown (e.g. `text×4, table×1, formula×2`)
- Any blocks with `confidence < 0.5` flagged

Do not dump raw JSONB unless the user explicitly asks.

## Stage 6 — Fetch related blocks

```sql
SELECT id, block_type, confidence, bbox
FROM blocks
WHERE page_id = '<page_id>'
ORDER BY (bbox->>'y')::float;
```

Print as a compact table. If no blocks exist and status is `done`, flag: "Page
marked done but no blocks found — possible `embed_and_index` failure."

## Completion checklist

- [ ] Page row fetched and summary header printed
- [ ] Status-specific diagnosis shown
- [ ] OCR output summaries (not raw JSON) shown for non-null columns
- [ ] Blocks table shown or anomaly flagged
