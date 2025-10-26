# ADR 002 — Per‑Subscription Stores and Full‑Issue Push (Breaking)

```
Date: 2025-10-26
Status: Proposed (ready for owner approval)
Owner: agent
```

## Context

The UI currently maintains a central `issues` cache and a separate list
membership model. Push events update the central cache and lists fan out from
it. This split increases cognitive load (two caches, two sets of selectors),
creates subtle ordering/dedup bugs, and complicates tests and routing.

We want a simpler, local model per visible list: one subscription → one store →
one push update stream → one rendered list. Push events must contain complete
issue objects for correctness and to avoid fan‑out to a central cache.

## Decision

- Adopt a per‑subscription issue store (`SubscriptionIssueStore`) keyed by the
  client’s subscription id.
- Server sends per‑subscription full‑issue payloads only; no id‑only deltas.
  Messages are serialized per subscription and revisioned.
- Lists render exclusively from their own store snapshots; the central issue
  cache is removed from the list render path.
- Breaking change: remove legacy id‑only list deltas and any compatibility
  paths/flags. No phased rollout and no telemetry collection.

## Protocol (Server → Client)

Message shapes are defined in `types/subscriptions.ts` and documented in
`docs/data-exchange-subscription-plan.md`.

All envelopes include a version tag and a per‑subscription, strictly monotonic
`revision` used for ordering and replay protection (see UI‑144).

- `subscribed` `{ id: string }`
- `snapshot` `{ id: string, revision: number, issues: Issue[] }`
- `upsert` `{ id: string, revision: number, issue: Issue }`
- `delete` `{ id: string, revision: number, issue_id: string }`
- `error` `{ id?: string, code: string, message: string, details?: object }`

Notes

- Per‑subscription ordering is guaranteed by the server and signaled via
  `revision`. Clients MUST apply envelopes in `revision` order and ignore any
  envelope whose `revision` is ≤ the last applied.
- Clients MUST treat updates as idempotent and MAY additionally guard on an
  `issue.updated_at` timestamp to ignore stale `upsert`s that race with local
  state. Timestamps are advisory; `revision` is canonical for ordering.
- Initial state arrives as a `snapshot` with a complete list of issues for the
  subscription key.

## Client Store API

The UI manages one store per active subscription. Minimal API surface:

```ts
// types only — see types/subscription-issue-store.ts
export interface SubscriptionIssueStore {
  /** Client subscription id this store belongs to. */
  readonly id: string;

  /** Attach a listener that is called after each applied message. */
  subscribe(listener: () => void): () => void;

  /** Apply a push message: snapshot, upsert, or delete. */
  applyPush(msg: SnapshotMsg | UpsertMsg | DeleteMsg): void;

  /** Read-only, stable snapshot for rendering (deterministic sort). */
  snapshot(): readonly Issue[];

  /** Lookup helpers used by views/tests. */
  size(): number;
  getById(id: string): Issue | undefined;

  /** Release references and listeners when the view unmounts. */
  dispose(): void;
}

export type SnapshotMsg = {
  type: 'snapshot';
  id: string;
  revision: number;
  issues: Issue[];
};

export type UpsertMsg = {
  type: 'upsert';
  id: string;
  revision: number;
  issue: Issue;
};

export type DeleteMsg = {
  type: 'delete';
  id: string;
  revision: number;
  issue_id: string;
};
```

### Sorting and identity

- Stores maintain stable item identity across updates (same object ref for the
  same `id` when only fields change) and expose a deterministic sort order
  suitable for the owning view (e.g., Issues: priority asc, then `updated_at`
  desc, then id asc).

### Error handling and reconnect

- On disconnect/reconnect, the client creates a fresh store and re‑subscribes.
  The server sends a fresh snapshot; no attempt is made to diff across sessions.

### Reconcile algorithm (pseudo‑code)

```
state: Map<string, Issue> = new Map()
lastRevision: number = 0

function applyPush(msg) {
  if (msg.revision <= lastRevision) return // stale or duplicate
  lastRevision = msg.revision

  switch (msg.type) {
    case 'snapshot':
      state.clear()
      for (const it of deterministicallySort(msg.issues)) {
        state.set(it.id, it)
      }
      break
    case 'upsert':
      const existing = state.get(msg.issue.id)
      if (!existing || existing.updated_at <= msg.issue.updated_at) {
        state.set(msg.issue.id, msg.issue)
      }
      break
    case 'delete':
      state.delete(msg.issue_id)
      break
  }
  notifyListeners()
}
```

The sort function must be deterministic and view‑specific (e.g., priority asc,
then `updated_at` desc, then `id` asc). Stores keep object identity stable for
the same `id` whenever fields change.

## Migration

- Delete list render paths that read via the central issues cache.
- Introduce a factory `createSubscriptionIssueStore(id)` at view mount; wire the
  push client to route `snapshot`/`upsert`/`delete` messages by `id` to the
  corresponding store via `applyPush`.
- Update list components to render from `store.snapshot()` and subscribe to
  re‑render on changes.
- Remove legacy central‑store fan‑out and dead selectors.

## Consequences

Pros

- One‑to‑one mapping of subscription → store → view simplifies reasoning and
  testing.
- No cache fan‑out; updates apply once per subscription and render once.
- Clearer ownership boundaries; easier disposal on route/tab changes.

Cons / Risks

- Larger `updated` payloads vs id‑only membership deltas. Mitigated by
  per‑subscription scoping and batching.
- Requires coordinated server/client cutover due to the breaking change.

## Alternatives Considered

- Keep the central cache and fan‑out membership to lists. Rejected: duplicates
  ownership, increases complexity and test surface, caused known ordering bugs.
- Maintain id‑only list deltas with separate issue fetches. Rejected: adds
  round‑trips and cross‑store coordination; does not meet simplicity goal.
- Dual protocol/feature flag with gradual cutover. Rejected per epic scope: no
  flags, no compatibility layer, and no telemetry collection.

## Related

- ADR 001 — Push‑Only Lists (v2): establishes push‑only direction and server
  batching; this ADR replaces the central‑store + list‑membership split with a
  per‑subscription store model.
- `docs/protocol/issues-push-v2.md` and
  `docs/data-exchange-subscription-plan.md` for normative protocol and server
  behavior.

## Status & Follow‑ups

- This ADR is a breaking change with no flags/compat/telemetry. It becomes
  Accepted once UI‑166 is approved by frontend and backend owners and the
  server/client work (UI‑167, UI‑168, UI‑169) lands.
- Cleanup (UI-174) removes the central store and delta fan‑out code.
