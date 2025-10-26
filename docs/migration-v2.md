# Migration: Push‑Only Per‑Subscription Stores (Breaking)

```
Date: 2025-10-26
Status: Final
Owner: agent
```

This release replaces legacy list reads and id‑only list deltas with
per‑subscription push envelopes that carry full issue payloads. There is no
compatibility mode and no feature flags.

## Required Versions

- beads‑ui: 0.2.0 or later (includes the server)
- Node.js: >= 22 (see `package.json` engines)

Upgrade:

```sh
npm i -g beads-ui@latest
```

## What Changed

- New protocol: `snapshot` / `upsert` / `delete` envelopes tagged with
  `schema: 'beads.subscription@v1'` and a per‑subscription `revision`.
- One store per list: views render from a `SubscriptionIssueStore` created for
  each active subscription id.
- Removed: central issues store and delta fan‑out.
- Removed: legacy read RPCs `list-issues` and `epic-status`.

## Migration Checklist

- Replace list reads with `subscribe-list`/`unsubscribe-list`.
- Create a `SubscriptionIssueStore` at view mount and wire the WS client to call
  `store.applyPush(payload)` for `snapshot`/`upsert`/`delete`.
- Render from `store.snapshot()`; remove code paths that read from a central
  issue cache.
- Delete dead selectors/helpers that depended on the central cache.
- Verify reconnect flows: a fresh `snapshot` (rev 1) replaces state cleanly.

## Notes

- No telemetry or phased rollout was implemented; ensure the UI and server are
  updated together. Older clients will not function with the new server.
- For closed‑issues feeds, prefer passing a `since` param where applicable to
  keep snapshots small.

## References

- `docs/protocol/issues-push-v2.md`
- `docs/subscription-issue-store.md`
- ADR 002 — Per‑Subscription Stores and Full‑Issue Push
