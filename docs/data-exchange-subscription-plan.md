# Data Exchange Model Refactor — Subscription-Based Updates

```
Date: 2025-10-25
Status: Implemented
Owner: agent
```

## Goals

- Replace ad-hoc list fetching with subscription-based incremental updates.
- Minimize payload size via server-side diffing (added/updated/removed).
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
- `pending-issues`
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
- `pending-issues` → `bd list --status pending`
- `in-progress-issues` → `bd list --status in_progress`
- `closed-issues` → `bd list --status closed` (then filter first; see Special
  Cases)

Notes:

- Exact flags depend on `bd`; create adapters that encapsulate CLI details and
  normalize results.

### Diffing Algorithm (per run)

1. Execute mapped `bd` command to get `issues`.
2. If subscription is `closed-issues` with a filter, apply the filter to
   `issues` before diffing.
3. Create `nextItemsById` (empty Map).
4. For each `issue` in `issues`:
   - If not in `prevItemsById`, push to `added`.
   - Else if `updated_at` differs, push to `updated`.
   - Put `{ id, updated_at, closed_at }` into `nextItemsById`.
   - Remove id from a working copy of `prevItemsById`.
5. Remaining ids in the working copy → `removed`.
6. Replace `itemsById = nextItemsById`.
7. Push `{ added, updated, removed }` to subscribers.

### Special Case: Closed Issues Filtering

- Apply `since` filter (epoch milliseconds) before diffing to avoid spurious
  updates when reloading older closed items. Only items with
  `closed_at >= since` are included. Invalid or non-positive `since` values are
  ignored.
- Filters are part of subscription params to keep deterministic diffing.

### Migration

This change replaces ad-hoc polling with subscription-based incremental updates.
Client migration steps:

- Replace list fetch calls with `subscribe-list`/`unsubscribe-list` messages.
- Maintain a per-subscription local store keyed by server `subscriptionKey`.
- Apply deltas `{ added, updated, removed }` in order; re-render views from the
  local store.
- Remove any legacy polling timers; updates now arrive via server push.
- For closed issue feeds, pass a `params.since` value (epoch ms) that reflects
  the UI’s filter horizon to reduce payload sizes.

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

## Wire Protocol

### Messages: Client → Server

- `subscribe` `{ id: string, type: string, params?: object }`
- `unsubscribe` `{ id: string }`
- Explicit mutation messages (enumerated in the protocol; no generic command
  pipe). Examples: `updateIssue`, `closeIssue`, etc. The exact set follows the
  existing protocol in the codebase.

#### Explicit Mutation Operations

Supported operations mirror the current protocol and map to concrete `bd`
commands:

- `update-status` `{ id, status: 'open'|'in_progress'|'closed' }`
  - bd: `bd update <id> --status <status>`
- `edit-text`
  `{ id, field: 'title'|'description'|'acceptance'|'notes'|'design', value }`
  - bd:
    `bd update <id> --title|--description|--acceptance-criteria|--notes|--design`
- `update-priority` `{ id, priority: 0|1|2|3|4 }`
  - bd: `bd update <id> --priority <n>`
- `update-assignee` `{ id, assignee: string }`
  - bd: `bd update <id> --assignee <name>`
- `create-issue` `{ title, type?, priority?, description? }`
  - bd: `bd create "title" -t <type> -p <prio> -d "desc"`
- `dep-add` `{ a, b, view_id? }` (a depends on b)
  - bd: `bd dep add <a> <b>` (exact flags per bd)
- `dep-remove` `{ a, b, view_id? }`
  - bd: `bd dep remove <a> <b>` (exact flags per bd)
- `label-add` `{ id, label }`
  - bd: `bd label add <id> <label>` (if supported)
- `label-remove` `{ id, label }`
  - bd: `bd label remove <id> <label>` (if supported)

Notes:

- We do not expose a generic execute/command interface.
- Any additions must be explicitly specified and mapped to `bd`.

### Messages: Server → Client

- `subscribed` `{ id: string }`
- `unsubscribed` `{ id: string }`
- `delta` `{ id: string, added: Issue[], updated: Issue[], removed: string[] }`
- `error` `{ id?: string, code: string, message: string, details?: object }`

`id` is the client’s subscription id; separate from server’s `subscriptionKey`.

## Concurrency & Ordering Guarantees

- Per-subscription ordering: server serializes diff runs per key.
- Deltas are applied in order on the client; no interleaving for a given `id`.
- Mutations provide “eventually up-to-date” guarantee via the once-listener +
  timeout.

## Observability

- Metrics per subscription type: runs, deltas sizes, errors, latency.
- Log sample of large deltas; trace mutation windows.

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

- This is a breaking change. Clients must adopt the subscription protocol and
  delta application model. The previous polling-based flows are removed.

## Open Questions

- Exact `bd` flags for each list type; confirm and codify.
- Closed-issue filter semantics (date range vs. other criteria).
