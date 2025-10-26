# beads-ui Architecture and Protocol (v1)

Note

- As of 2025-10-25, the UI and server move to a push‑only, breaking protocol for
  issue updates. This document describes the legacy v1 request/response shapes
  and remains for historical reference. For the current push protocol, see
  `docs/protocol/issues-push-v2.md`. Legacy read RPCs `list-issues` and
  `epic-status` are removed from the server.

This document describes the high‑level architecture of beads‑ui and the v1
WebSocket protocol used between the browser SPA and the local Node.js server.

## Overview

- Local‑first single‑page app served by a localhost HTTP server
- WebSocket for data (request/response + server push events)
- Server bridges UI intents to the `bd` CLI and watches the active beads
  database for changes

```
+--------------+          ws://127.0.0.1:PORT/ws          +--------------------+
|  Browser SPA | <--------------------------------------> | HTTP + WS Server   |
|  (ESM, DOM)  |   requests (JSON) / replies + events     |  (Node.js, ESM)    |
+--------------+                                          +---------+----------+
        ^                                                            |
        |                                                            v
        |                                                       +----+-----+
        |                                                       |   bd     |
        |                                                       |  (CLI)   |
        |                                                       +----+-----+
        |                                                            |
        |                                     watches                v
        |------------------------------------ changes --------> [ SQLite DB ]
```

## Components and Responsibilities

- UI (app/)
  - `app/main.js`: bootstraps shell, creates store/router, wires WS client,
    refreshes on push
  - Views: `app/views/list.js`, `app/views/detail.js` render issues and allow
    edits
  - Transport: `app/ws.js` persistent client with reconnect, correlation, and
    event dispatcher
  - Protocol: `app/protocol.js` shared message shapes, version, helpers, and
    type guards

- Server (server/)
  - Web: `server/app.js` (Express app), `server/index.js` (startup and wiring)
  - WebSocket: `server/ws.js` (attach server, parse, validate, dispatch
    handlers, broadcast events)
  - bd bridge: `server/bd.js` (spawn `bd`, inject `--db` consistently, JSON
    helpers)
  - DB resolution/watch: `server/db.js` (resolve active DB path),
    `server/watcher.js` (emit `issues-changed`)
  - Config: `server/config.js` (bind to `127.0.0.1`, default port 3000)

## Data Flow

1. User action in the UI creates a request `{ id, type, payload }` via
   `app/ws.js`.
2. Server validates and maps the request to a `bd` command (no shell; args array
   only).
3. Server replies with `{ id, ok, type, payload }` or `{ id, ok:false, error }`.
4. Independent of requests, the DB watcher sends `issues-changed` events to all
   clients.

## Protocol (v1.0.0)

Envelope shapes (see `app/protocol.js` for the source of truth):

- Request: `{ id: string, type: MessageType, payload?: any }`
- Reply:
  `{ id: string, ok: boolean, type: MessageType, payload?: any, error?: { code, message, details? } }`

Message types (legacy v1; server now push-only):

- Removed in v2: `list-issues` (use subscriptions + push stores)
- `show-issue` payload: `{ id: string }`
- `update-status` payload:
  `{ id: string, status: 'open'|'in_progress'|'closed' }`
- `edit-text` payload:
  `{ id: string, field: 'title'|'description'|'acceptance', value: string }`
- `update-priority` payload: `{ id: string, priority: 0|1|2|3|4 }`
- `dep-add` payload: `{ a: string, b: string, view_id?: string }`
- `dep-remove` payload: `{ a: string, b: string, view_id?: string }`
- `issues-changed` (server push) payload:
  `{ ts: number, hint?: { ids?: string[] } }`

Defined in the spec but not yet handled on the server:

- `create-issue`, `list-ready`

### Examples

List issues (removed in v2; see push protocol)

```json
{
  "id": "r1",
  "type": "list-issues",
  "payload": { "filters": { "status": "open" } }
}
```

Reply

```json
{
  "id": "r1",
  "ok": true,
  "type": "list-issues",
  "payload": [{ "id": "UI-1", "title": "..." }]
}
```

Update status

```json
{
  "id": "r2",
  "type": "update-status",
  "payload": { "id": "UI-1", "status": "in_progress" }
}
```

Server push (watcher)

```json
{
  "id": "evt-1732212345000",
  "ok": true,
  "type": "issues-changed",
  "payload": { "ts": 1732212345000 }
}
```

Error reply

```json
{
  "id": "r3",
  "ok": false,
  "type": "show-issue",
  "error": { "code": "not_found", "message": "Issue UI-99" }
}
```

## UI → bd Command Mapping

- Removed in v2: List → use subscriptions and push
  (`docs/protocol/issues-push-v2.md`)
- Show: `bd show <id> --json`
- Update status: `bd update <id> --status <open|in_progress|closed>`
- Update priority: `bd update <id> --priority <0..4>`
- Edit title: `bd update <id> --title <text>`
- Edit description: `bd update <id> --description <text>`
- Edit acceptance: `bd update <id> --acceptance-criteria <text>`
- Link dependency: `bd dep add <a> <b>` (a depends on b)
- Unlink dependency: `bd dep remove <a> <b>`
- Planned (UI not wired yet): Create:
  `bd create "title" -t <type> -p <prio> -d "desc"`; Ready list:
  `bd ready --json`

Rationale

- Use `--json` for read commands to ensure typed payloads.
- Avoid shell invocation; pass args array to `spawn` to prevent injection.
- Always inject a resolved `--db <path>` so watcher and CLI operate on the same
  database.

## Issue Data Model (wire)

```ts
interface Issue {
  id: string;
  title?: string;
  description?: string;
  acceptance?: string;
  status?: 'open' | 'in_progress' | 'closed';
  priority?: 0 | 1 | 2 | 3 | 4;
  dependencies?: Array<{
    id: string;
    title?: string;
    status?: string;
    priority?: number;
    issue_type?: string;
  }>;
  dependents?: Array<{
    id: string;
    title?: string;
    status?: string;
    priority?: number;
    issue_type?: string;
  }>;
}
```

Notes

- Fields are optional to allow partial views and forward compatibility.
- Additional properties may appear; clients should ignore unknown keys.

## Error Model and Versioning

- Error object: `{ code: string, message: string, details?: any }`
- Common codes: `bad_request`, `not_found`, `bd_error`, `unknown_type`,
  `bad_json`
- Versioning: `PROTOCOL_VERSION` in `app/protocol.js` (currently `1.0.0`).
  Breaking changes increment this value; additive message types are backwards
  compatible.

## Security and Local Boundaries

- Server binds to `127.0.0.1` by default to keep traffic local.
- Basic input validation at the WS boundary; unknown or malformed messages
  produce structured errors.
- No shell usage; `spawn` with args only; environment opt‑in via `BD_BIN`.

## Watcher Design

- The server resolves the active beads SQLite DB path (see
  `docs/db-watching.md`).
- File watcher emits `issues-changed` events with a timestamp; UI refreshes
  list/detail as needed.

## Risks & Open Questions

- Create flow not implemented in server handlers
  - Owner: Server
  - Next: Add `create-issue` handler and tests; wire minimal UI affordance
- Ready list support missing end‑to‑end
  - Owner: Server + UI
  - Next: Add `list-ready` handler and a list filter in UI
- Backpressure when many updates arrive
  - Owner: Server
  - Next: Coalesce broadcast events; consider debounce window
- Large databases and payload size
  - Owner: UI
  - Next: Add incremental refresh (fetch issue by id on hints)
- Cross‑platform DB path resolution nuances
  - Owner: Server
  - Next: Expand tests for Windows/macOS/Linux; document overrides
- Acceptance text editing
  - Owner: UI + Server
  - Status: Implemented via `edit-text` + `--acceptance-criteria`

---

For the normative protocol reference and unit tests, see `app/protocol.md` and
`app/protocol.test.js`.
