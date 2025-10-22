# beads-ui WebSocket Protocol (v1.0.0)

This document defines the JSON messages exchanged between the browser client and
the local server.

- Transport: single WebSocket connection
- Encoding: JSON text frames
- Correlation: all request/response pairs share the same `id`

## Envelope Shapes

- RequestEnvelope: `{ id: string, type: string, payload?: any }`
- ReplyEnvelope:
  `{ id: string, ok: boolean, type: string, payload?: any, error?: { code: string, message: string, details?: any } }`

Server may send unsolicited events (e.g., `issues-changed`) using the
ReplyEnvelope shape with `ok: true` and a generated `id`.

## Message Types

- `list-issues` payload: `{ filters?: { status?: string, priority?: number } }`
- `show-issue` payload: `{ id: string }`
- `update-status` payload:
  `{ id: string, status: 'open'|'in_progress'|'closed' }`
- `edit-text` payload:
  `{ id: string, field: 'title'|'description'|'acceptance', value: string }`
  - Note: `description` edits are rejected by the server (unsupported by `bd`).
- `update-priority` payload: `{ id: string, priority: 0|1|2|3|4 }`
- `create-issue` payload:
  `{ title: string, type?: 'bug'|'feature'|'task'|'epic'|'chore', priority?: 0|1|2|3|4, description?: string }`
- `list-ready` payload: `{}`
- `subscribe-updates` payload: `{}` (server responds with `ok` and begins
  emitting events)
- `issues-changed` payload: `{ ts: number, hint?: { ids?: string[] } }`
- `dep-add` payload: `{ a: string, b: string, view_id?: string }` where `a`
  depends on `b` (i.e., `a` is blocked by `b`). Reply payload is the updated
  issue for `view_id` (or `a` when omitted).
- `dep-remove` payload: `{ a: string, b: string, view_id?: string }` removing
  the `a` depends on `b` link. Reply payload is the updated issue for `view_id`
  (or `a`).

## Mapping to `bd` CLI

- `list-issues` → `bd list --json [--status <s>] [--priority <n>]`
- `show-issue` → `bd show <id> --json`
- `update-status` → `bd update <id> --status <status>`
- `edit-text` → `bd update <id> --title <t>` or `--acceptance-criteria <a>`
  - `description` has no CLI flag; server responds with an error
- `update-priority` → `bd update <id> --priority <n>`
- `create-issue` → `bd create "title" -t <type> -p <prio> -d "desc"`
- `list-ready` → `bd ready --json`

## Errors

Errors follow the shape `{ code, message, details? }`. Common codes:

- `bad_request` – malformed payload or unknown type
- `not_found` – entity not found (e.g., issue id)
- `bd_error` – underlying `bd` command failed

## Versioning

Breaking changes to shapes or semantics increment `PROTOCOL_VERSION` in
`app/protocol.js`.
