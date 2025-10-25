# Issues Push Protocol (Breaking)

```
Date: 2025-10-25
Status: Specified
Owner: agent
```

This document defines the push‑only protocol for issue updates delivered from
the local server to the beads‑ui client. This is a breaking change that replaces
the legacy notify‑then‑fetch (v1) flow. There is no version negotiation or
fallback.

## Overview

- Transport: single WebSocket connection per client
- Encoding: JSON text frames
- Topic: `"issues"`
- Delivery: single envelope with `added`/`updated`/`removed` arrays
- Ordering: strictly increasing `revision` per subscription
- Snapshot: initial full state with `snapshot: true`

## Envelope

```ts
interface IssuesEnvelope {
  topic: 'issues';
  revision: number; // Monotonically increasing per subscription
  snapshot?: boolean; // Present and true only for the initial batch
  // Single envelope contains all three lists; empty lists when none
  added: Issue[];
  updated: Issue[];
  removed: string[]; // ids only
}

// Issue wire shape follows the v1 Issue model documented in docs/architecture.md
// ("Issue Data Model (wire)"). Additional properties may appear; clients must
// ignore unknown keys for forward compatibility.
```

Notes

- Server MAY send multiple envelopes back‑to‑back; clients apply them in
  `revision` order and ignore stale (<= last applied) revisions.
- Server MAY batch any number of items inside `added`/`updated`/`removed`.
  Implementations SHOULD favor batching to reduce frame rate.

## Handshake (Subscribe)

Client subscribes to the `issues` topic. There is no version negotiation.

Client → Server

```json
{ "subscribe": "issues" }
```

Server → Client

```json
{ "subscribed": "issues" }
```

Immediately after subscribe, the server MUST send a single snapshot envelope
containing all current issues in `added` with `snapshot: true` and `revision: 1`
for the new subscription.

## Ordering, Batching, and Revisions

- Server maintains a per‑subscription `revision` counter that starts at `1` for
  the initial snapshot and increments by `1` for every subsequent envelope.
- Envelopes are delivered in sequence; if the client observes a `revision` lower
  than or equal to its `last_applied_revision`, it MUST ignore the envelope.
  Implementations MAY log and/or request a resubscribe if gaps are detected
  (e.g., jump greater than `+1`).
- Servers SHOULD coalesce changes over a short window and emit batched envelopes
  to reduce overhead.

## Reconnect Behavior

- On reconnect (WebSocket closed and re‑established), the client repeats the
  subscribe handshake.
- The server treats a reconnect as a new subscription and MUST send a fresh
  `added` snapshot with `revision: 1` followed by incremental updates.
- Clients MUST reset `last_applied_revision` on a new subscribe and discard any
  buffered envelopes from a prior connection.

## Examples

Subscribe

```json
{ "subscribe": "issues" }
```

```json
{ "subscribed": "issues" }
```

Initial snapshot (server → client)

```json
{
  "topic": "issues",
  "revision": 1,
  "snapshot": true,
  "added": [
    {
      "id": "UI-1",
      "title": "Bootstrap app",
      "status": "open",
      "priority": 2
    },
    {
      "id": "UI-2",
      "title": "Add filters",
      "status": "in_progress",
      "priority": 1
    }
  ],
  "updated": [],
  "removed": []
}
```

Incremental update (example: one updated)

```json
{
  "topic": "issues",
  "revision": 2,
  "snapshot": false,
  "added": [],
  "updated": [{ "id": "UI-2", "status": "closed" }],
  "removed": []
}
```

Removal batch

```json
{
  "topic": "issues",
  "revision": 3,
  "snapshot": false,
  "added": [],
  "updated": [],
  "removed": ["UI-9", "UI-10"]
}
```

Compatibility

This is a breaking change that removes the v1 notify‑then‑fetch flow and any
version negotiation. Clients must implement this protocol to function.

## Client Responsibilities (v2)

- Maintain a normalized cache keyed by issue id.
- Track `last_applied_revision` per subscription.
- Apply envelopes in order by `revision`:
  - Insert/replace issues from `added` by id
  - Upsert issues from `updated` by id
  - Delete ids in `removed`
- Re‑render views from the local cache after applying a batch. Implementations
  SHOULD coalesce UI updates so each envelope triggers at most one render.

## Rollout

No phased rollout. This is a hard switch to the push‑only protocol.

## Rationale

- The v2 envelopes deliver complete information for `added`/`updated` and
  identifiers only for `removed`, enabling a pure push model with no follow‑up
  fetch.
- `revision` and `snapshot` ensure deterministic ordering and simplify client
  cache initialization.
