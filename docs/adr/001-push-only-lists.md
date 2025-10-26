# ADR 001 — Push‑Only Lists (v2)

```
Date: 2025-10-26
Status: Accepted
Owner: agent
```

## Context

The UI currently mixes push updates with read RPCs like `list-issues` and
`epic-status`. We introduced two push channels:

- Issues stream: see `docs/protocol/issues-push-v2.md` (single `issues` envelope
  carrying `added`/`updated`/`removed`).
- List membership stream: server emits `list-delta` per subscription key.

We want every list‑shaped view (Issues, Board, Epics → children) to render
exclusively from local stores fed by these push channels. Reads remain only for
mutations that return a single updated entity, e.g. detail view refresh.

Related docs:

- Protocol: `docs/protocol/issues-push-v2.md`
- Server plan: `docs/data-exchange-subscription-plan.md`

## Decision

- One active subscription per visible list. Examples (client ids):
  - Issues tab: `tab:issues` with spec from filters via `computeIssuesSpec()`
  - Board: `tab:board:ready|in-progress|closed|blocked`
  - Epics list: `tab:epics` (for epic entities); children subscribe on expand as
    `epic:{id}` with `{ type: 'issues-for-epic', params: { epic_id: id } }`
- Rendering reads from two local stores only:
  - `issuesStore`: normalized entity cache updated by `issues` envelopes.
  - `subscriptions`: list membership updated by `list-delta` per key.
- Introduce a small selectors utility (see API) to compose
  `subscriptions.selectors.getIds(id)` with `issuesStore.getMany(ids)`, applying
  view‑specific sort rules.
- Remove read RPCs used for lists: `list-issues`, `epic-status`. Keep mutation
  RPCs and `show-issue` until detail view also reads from push cache.
- Tests drive views with push envelopes and `list-delta`; no RPC stubs for
  reads.

## API Shape (Client)

Issues store (already implemented):

```js
// app/data/issues-store.js
createIssuesStore() -> {
  wireEvents(on), subscribe(fn), getById(id), getMany(ids), getAll()
}
```

Subscriptions store (already implemented):

```js
// app/data/subscriptions-store.js
createSubscriptionStore(send) -> {
  wireEvents(on), subscribeList(client_id, spec) -> unsubscribe,
  selectors: { getIds(client_id), has(client_id), count(client_id) }
}
```

Selectors utility (to add in UI-156):

```js
// app/data/list-selectors.js
/** Compose ids -> entities and apply stable sort. */
export function selectIssuesFor(client_id, { subscriptions, issuesStore }) {}

/** Board helpers applying column-specific sort rules. */
export function selectBoardColumn(client_id, { subscriptions, issuesStore }) {}

/** Derive children for an epic already subscribed as `epic:${id}`. */
export function selectEpicChildren(epic_id, { subscriptions, issuesStore }) {}

/** Re-render once per issues envelope. */
export function subscribeOncePerEnvelope(issuesStore, fn) {}
```

Sorting rules:

- Issues list: priority asc (0..4), then `updated_at` desc, then id asc.
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

- [x] Issues view renders from `subscriptions + issuesStore`; no `list-issues`.
- [x] Board renders from `subscriptions + issuesStore`; no `get*` list reads.
- [x] Epics list/children derive from `issuesStore`; children use
      `issues-for-epic` with `epic_id` param; no `epic-status` reads.

Client Data Layer

- [ ] Add `app/data/list-selectors.js` with helpers listed above (UI-156).
- [ ] Remove list read functions from `app/data/providers.js` (UI-159).
- [ ] Keep `getIssue` and all mutation helpers until detail view push migration
      happens (follow‑up).

Tests

- [x] Update list/board/epics tests to use push envelopes and `list-delta`
      (UI-158).
- [x] Remove RPC read stubs from tests.

Docs

- [ ] This ADR committed (UI-152).
- [ ] Update protocol and architecture docs for push‑only model (UI-160).

## Notes

- Client ids used in this repo today:
  - `tab:issues` for the Issues view
  - `tab:board:ready|in-progress|closed|blocked` for Board columns
  - `tab:epics` for the Epics tab; `epic:${id}` for expanded children
- See `app/main.js` for current subscription wiring and filter → spec mapping.
