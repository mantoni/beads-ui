# beads-ui Architecture (v2)

Note (2025-10-26)

- beads-ui has migrated to a push‑only protocol for lists and details. The
  server no longer implements legacy read RPCs `list-issues` and `epic-status`.
  For the normative protocol reference, see `docs/protocol/issues-push-v2.md`.

This document describes the high‑level architecture of beads‑ui and the v2
push‑only data flow used between the browser SPA and the local Node.js server.

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
    `server/watcher.js` (schedule list refresh)
  - Config: `server/config.js` (bind to `127.0.0.1`, default port 3000)

## Data Flow

1. User action in the UI creates a request `{ id, type, payload }` via
   `app/ws.js`.
2. Server validates and maps the request to a `bd` command (no shell; args array
   only).
3. Server replies with `{ id, ok, type, payload }` or `{ id, ok:false, error }`.
4. Independent of requests, the DB watcher schedules a refresh for active list
   subscriptions; clients receive `snapshot`/`upsert`/`delete` envelopes.

## Protocol (v2.0.0)

Envelope shapes (see `app/protocol.md` and `docs/protocol/issues-push-v2.md`):

- Request: `{ id: string, type: string, payload?: any }`
- Reply:
  `{ id: string, ok: boolean, type: string, payload?: any, error?: { code: string, message: string, details?: any } }`

Push‑only subscriptions for lists and details:

- Client subscribes via `subscribe-list` with `{ id, type, params? }`.
- Server acks the subscription and immediately publishes a `snapshot` envelope
  with the full list for that subscription id followed by `upsert`/`delete`
  envelopes as data changes. Clients render from local per‑subscription stores.

Common message types (mutations only; list reads removed):

- `update-status` payload:
  `{ id: string, status: 'open'|'in_progress'|'closed' }`
- `edit-text` payload:
  `{ id: string, field: 'title'|'description'|'acceptance'|'notes'|'design', value: string }`
- `update-priority` payload: `{ id: string, priority: 0|1|2|3|4 }`
- `dep-add` payload: `{ a: string, b: string, view_id?: string }`
- `dep-remove` payload: `{ a: string, b: string, view_id?: string }`
- `create-issue` payload:
  `{ title: string, type?: 'bug'|'feature'|'task'|'epic'|'chore', priority?: 0|1|2|3|4, description?: string }`

Removed in v2:

- `list-issues`, `epic-status`, `subscribe-updates` and the legacy
  `issues-changed` event.

## UI → bd Command Mapping

- Lists and details: push‑only via `subscribe-list` (no list reads)
- Update status: `bd update <id> --status <open|in_progress|closed>`
- Update priority: `bd update <id> --priority <0..4>`
- Edit title: `bd update <id> --title <text>`
- Edit description: `bd update <id> --description <text>`
- Edit acceptance: `bd update <id> --acceptance-criteria <text>`
- Link dependency: `bd dep add <a> <b>` (a depends on b)
- Unlink dependency: `bd dep remove <a> <b>`
- Create issue: `bd create "title" -t <type> -p <prio> -d "desc"`

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

## Security and Local Boundaries

- Server binds to `127.0.0.1` by default to keep traffic local.
- Basic input validation at the WS boundary; unknown or malformed messages
  produce structured errors.
- No shell usage; `spawn` with args only; environment opt‑in via `BD_BIN`.

## Watcher Design

- The server resolves the active beads SQLite DB path (see
  `docs/db-watching.md`).
- File watcher schedules list refresh; the server publishes subscription
  envelopes. UI re-renders from local per-subscription stores.

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
