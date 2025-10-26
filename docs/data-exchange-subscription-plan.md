# Data Exchange Model — Subscription‑Based Updates (Full‑Issue)

```
Date: 2025-10-25
Status: Implemented
Owner: agent
```

## Goals

- Replace ad-hoc list fetching with subscription-based incremental updates.
- Minimize complexity; send full‑issue payloads in envelopes targeted to a
  specific subscription key.
- Ensure consistent, race-free updates around user-triggered mutations.
- Keep UI models per-subscription to simplify rendering and memory usage.

## Scope

- Server and client for `beads-ui`.
- Uses `bd` CLI for data access; no DB schema changes.

## Subscription Types

- `all-issues`
- `epics`
- `issues-for-epic` (param: `epic_id`)
- `blocked-issues`
- `ready-issues`
- `in-progress-issues`
- `closed-issues` (special filtering noted below)

## Server Architecture

### Subscription Registry (Issue List Subscriptions)

- Keyed by `subscriptionKey = type + JSON.stringify(params)`.
- Value:
  `{ itemsById: Map<string, { updated_at: string, closed_at: string|null }>, subscribers: Set<SubscriberId>, lastRunAt?: number }`.
- Each subscribe request either attaches to an existing registry entry or
  creates a new one.
- No TTL: subscriptions are evicted only on WebSocket disconnect. Unsubscribe
  removes a subscriber from the set but keeps the registry entry until the
  connection closes.

### Mapping to `bd` Commands

- `all-issues` → `bd list` (default/open)
- `epics` → `bd list --type epic` (or equivalent)
- `issues-for-epic:{epic_id}` → `bd list --epic <id>`
- `blocked-issues` → `bd list --blocked`
- `ready-issues` → `bd ready --limit 1000`
- `in-progress-issues` → `bd list --status in_progress`
- `closed-issues` → `bd list --status closed` (then filter first; see Special
  Cases)

Notes:

- Exact flags depend on `bd`; create adapters that encapsulate CLI details and
  normalize results.

### Refresh Algorithm (per run)

1. Execute mapped `bd` command to get the full list of `issues` for the spec.
2. If subscription is `closed-issues` with a filter, apply it before step 3.
3. Compare with the registry’s last known items for this subscription key.
4. For new or changed items, emit `upsert` envelopes with the full issue payload
   to all subscribers of the key on the current connection.
5. For removed items, emit `delete` envelopes with `issue_id`.
6. Update the registry’s state for the key.

### Special Case: Closed Issues Filtering

- Apply `since` filter (epoch milliseconds) before diffing to avoid spurious
  updates when reloading older closed items. Only items with
  `closed_at >= since` are included. Invalid or non-positive `since` values are
  ignored.
- Filters are part of subscription params to keep deterministic diffing.

### Migration

This change replaces request/response list reads and id‑only deltas with
subscription‑based, full‑issue push envelopes.

Client migration steps:

- Replace list fetch calls with `subscribe-list`/`unsubscribe-list` messages.
- Maintain a per‑subscription local store keyed by the client `id`.
- Apply `snapshot`/`upsert`/`delete` envelopes in revision order; render from
  `store.snapshot()`.
- Remove any legacy polling timers; updates now arrive via server push.
- For closed issue feeds, pass a `params.since` value (epoch ms) that reflects
  the UI’s filter horizon if needed server‑side.

### Watcher Integration (DB Updates)

- A file/DB watcher signals any data change.
- On signal, for each active subscription: re-run its mapped `bd` command → diff
  → push deltas to all subscribers.
- Backpressure: coalesce multiple watcher events into a single run per
  subscription (leading-edge, with trailing-edge within 50–100ms).

### User Mutations (Race Control)

When client requests a change (e.g., update status):

1. Execute the explicit protocol mutation (mapped to a concrete `bd` command
   under the hood; no arbitrary commands allowed).
2. In parallel, attach a once-listener to the watcher that resolves on the next
   change event (no debounce) or a 500ms timeout, whichever occurs first.
3. After the promise resolves, for each affected subscription, run the standard
   refresh/diff/push routine exactly once.
4. During the pending mutation window, suppress watcher-triggered refreshes for
   affected subscriptions to avoid duplicate pushes.

### Error Handling

- Validate subscription params; return structured errors.
- For `bd` failures, include stderr and exit code; do not crash subscriptions.
- If a subscriber disconnects mid-push, drop silently and clean up.

## Client Architecture

### Local Store per Subscription

- Keyed by `subscriptionKey`.
- Value: `{ itemsById: Map<string, Issue>, lastAppliedAt: number }`.
- On `{ added, updated, removed }`, update `itemsById` accordingly and request
  view re-render.
- Tabs and epic expansion toggle subscribe/unsubscribe appropriately.

### UI Flow

- Tab switch: unsubscribe previous, subscribe new.
- Epic toggle: subscribe/unsubscribe `issues-for-epic:{id}`.
- Components derive view state from the local store snapshot.

## Wire Protocol (vNext)

### Messages: Client → Server

- `subscribe-list` `{ id: string, type: string, params?: object }`
- `unsubscribe-list` `{ id: string }`
- Explicit mutation messages (enumerated in the protocol; no generic command
  pipe). The set mirrors the main protocol (update-status, edit-text,
  update-priority, update-assignee, create-issue, dep-add/remove,
  label-add/remove).

### Messages: Server → Client (Per‑Subscription)

All envelopes include a per‑subscription `revision` (monotonic, starting at 1),
and the client subscription `id`.

- `snapshot` `{ id, schema, revision, issues: Issue[] }`
- `upsert` `{ id, schema, revision, issue: Issue }`
- `delete` `{ id, schema, revision, issue_id: string }`

Notes

- Initial subscribe triggers a single `snapshot` for the requesting `id` only.
- Subsequent refresh runs emit `upsert`/`delete` events to all subscribers of
  the same subscription key on that connection.
- Clients MUST apply envelopes in `revision` order and ignore stale revisions.

## Concurrency & Ordering Guarantees

- Per-subscription ordering: server serializes diff runs per key.
- Deltas are applied in order on the client; no interleaving for a given `id`.
- Mutations provide “eventually up-to-date” guarantee via the once-listener +
  timeout.

## Observability

- Basic development logging only; no telemetry collection for message rates.

## Security

- Only explicit mutation operations are implemented by the protocol; no
  arbitrary commands from clients.
- Reject unknown subscription types; enforce param schemas.

## Testing Strategy

- Unit: diffing, registry, adapter mapping, filter logic.
- Integration: watcher → refresh → push flow; mutation window once-only
  behavior.
- E2E: tab switching, epic expansion, status changes while updates stream.

## Release Notes

- Breaking change: Clients must adopt `snapshot`/`upsert`/`delete` envelopes and
  per‑subscription stores. Previous polling and id‑only list deltas are removed.

## Open Questions

- Exact `bd` flags for each list type; confirm and codify.
- Closed-issue filter semantics (date range vs. other criteria).
