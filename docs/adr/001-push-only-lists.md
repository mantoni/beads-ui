# ADR 001 — Push‑Only Lists (v2)

```
Date: 2025-10-26
Status: Accepted (data‑flow details superseded by ADR 002)
Owner: agent
```

## Context

The UI currently mixes push updates with read RPCs like `list-issues` and
`epic-status`. This ADR establishes the push‑only direction for list data and
removing read RPCs in list views. It predated ADR 002 which later simplified the
data flow further (per‑subscription stores + full‑issue payloads).

- Push streams provide everything lists need to render. See
  `docs/protocol/issues-push-v2.md` and ADR 002. Earlier iterations used a
  central `issues` entity cache plus `list-delta` membership; this has been
  replaced by per‑subscription stores receiving full issue payloads.

We want every list‑shaped view (Issues, Board, Epics → children) to render
exclusively from local push data. Reads remain only for mutations that return a
single updated entity (e.g. detail view refresh).

Related docs:

- Protocol: `docs/protocol/issues-push-v2.md`
- Server plan: `docs/data-exchange-subscription-plan.md`

## Decision

- One active subscription per visible list. Examples (client ids):
  - Issues tab: `tab:issues` with spec from filters via `computeIssuesSpec()`
  - Board: `tab:board:ready|in-progress|closed|blocked`
  - Epics list: `tab:epics` (for epic entities); children subscribe on expand as
    `detail:{id}` with `{ type: 'issue-detail', params: { id } }`
- Rendering reads from two local stores only:
  - `per‑subscription stores`: one store per active client subscription id.
    Stores receive versioned `snapshot`/`upsert`/`delete` push envelopes with
    full issue payloads and expose deterministic, sorted snapshots for the
    owning view.
  - `subscriptions`: manages subscription lifecycle and keys. Rendering reads
    from per‑subscription stores, not from membership ids.
- Introduce a small selectors utility to apply view‑specific sort rules on store
  snapshots (no composition from a central cache).
- Remove read RPCs used for lists: `list-issues`, `epic-status`. Keep mutation
  RPCs and `show-issue` until detail view also reads from push cache.
- Tests drive views with push envelopes and `list-delta`; no RPC stubs for
  reads.

## API Shape (Client)

Subscriptions store (already implemented):

```js
// app/data/subscriptions-store.js
createSubscriptionStore(send) -> {
  wireEvents(on), subscribeList(client_id, spec) -> unsubscribe,
  selectors: { getIds(client_id), has(client_id), count(client_id) }
}
```

Selectors utility (implemented):

```js
// app/data/list-selectors.js
/** Compose from per‑subscription store snapshots and apply stable sort. */
export function createListSelectors(issueStores) {
  return {
    selectIssuesFor(client_id) {},
    selectBoardColumn(client_id, mode) {},
    selectEpicChildren(epic_id) {},
    subscribe(fn) {}
  };
}
```

Sorting rules:

- Issues list: priority asc (0..4), then `created_at` desc, then id asc.
- Board columns: preserve existing view rules (ready → priority asc, then
  `updated_at` desc; in‑progress → `updated_at` desc; closed → `closed_at`
  desc).
- Epics children: same as Issues list unless view specifies otherwise.

## Consequences

Pros:

- Consistent, snappy UI with minimal fetch logic; views are pure derives.
- Server can batch and coalesce; client renders at most once per envelope.
- Clear separation: mutations via RPC, reads via push caches.

Cons / Risks:

- Initial implementation work in views and tests.
- Need disciplined subscription lifecycle on route/tab changes.
- Requires follow‑up to migrate detail view fully to the push cache.

## Migration Checklist

Views

- [x] Issues view renders from per‑subscription stores; no `list-issues`.
- [x] Board renders from per‑subscription stores; no `get*` list reads.
- [x] Epics list/children render from per‑subscription stores; children use
      `issue-detail` for the epic id; children come from `dependents`.

Client Data Layer

- [x] Add `app/data/list-selectors.js` with helpers listed above (UI-156).
- [x] Remove list read functions from `app/data/providers.js` (UI-159).
- [ ] Keep `getIssue` and all mutation helpers until detail view push migration
      happens (follow‑up).

Tests

- [x] Update list/board/epics tests to use per‑subscription push envelopes
      (UI-158).
- [x] Remove RPC read stubs from tests.

Docs

- [x] This ADR committed (UI-152).
- [x] Update protocol and architecture docs for push‑only model (UI-160).

## Notes

- Client ids used in this repo today:
  - `tab:issues` for the Issues view
  - `tab:board:ready|in-progress|closed|blocked` for Board columns
  - `tab:epics` for the Epics tab; `epic:${id}` for expanded children
- See `app/main.js` for current subscription wiring, filter → spec mapping, and
  per‑subscription push routing.
