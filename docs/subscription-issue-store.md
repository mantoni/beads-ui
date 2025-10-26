# SubscriptionIssueStore — API and Usage Examples

```
Date: 2025-10-26
Status: Implemented
Owner: agent
```

The `SubscriptionIssueStore` is a per‑subscription in‑memory store that owns the
issues for a single list subscription. It applies server push envelopes
(`snapshot`/`upsert`/`delete`) in revision order and exposes a deterministic,
read‑only snapshot for rendering.

See also: `docs/protocol/issues-push-v2.md` for the wire protocol.

## API

Factory: `app/data/subscription-issue-store.js`

```js
import { createSubscriptionIssueStore } from '../app/data/subscription-issue-store.js';

// Create at view mount (id is client-chosen)
const store = createSubscriptionIssueStore('ready');

// Listen for changes
const unsubscribe = store.subscribe(() => {
  render(store.snapshot());
});

// Apply push envelopes from the WebSocket client
ws.on('message', (evt) => {
  const msg = JSON.parse(evt.data);
  if (msg && msg.ok === true && msg.payload && msg.payload.id === 'ready') {
    // payload has { type, id, schema, revision, ... }
    store.applyPush(msg.payload);
  }
});

// Read helpers
store.size(); // number of issues
store.getById('UI-1'); // lookup by id

// Dispose on unmount
unsubscribe();
store.dispose();
```

Options: deterministic sort can be customized per list via the optional
`{ sort(a,b) }` parameter when constructing the store.

## Subscribing to a List

Pair store creation with the subscribe‑list handshake. The server will send a
`snapshot` immediately after the ack, followed by `upsert`/`delete`.

```js
// Request a subscription
socket.send(
  JSON.stringify({
    id: 'req-1',
    type: 'subscribe-list',
    payload: { id: 'ready', type: 'ready-issues' }
  })
);

socket.addEventListener('message', (ev) => {
  const frame = JSON.parse(ev.data);
  if (frame.ok && frame.type === 'snapshot' && frame.payload.id === 'ready') {
    store.applyPush(frame.payload);
  }
  if (frame.ok && frame.type === 'upsert' && frame.payload.id === 'ready') {
    store.applyPush(frame.payload);
  }
  if (frame.ok && frame.type === 'delete' && frame.payload.id === 'ready') {
    store.applyPush(frame.payload);
  }
});
```

## Rendering Pattern (List component)

```js
/** @param {{ store: ReturnType<typeof createSubscriptionIssueStore> }} props */
export function ListView({ store }) {
  let items = store.snapshot();

  const un = store.subscribe(() => {
    items = store.snapshot();
    requestRender();
  });

  // framework-specific teardown
  onUnmount(() => un());

  return html`<ul>
    ${items.map((it) => html`<li data-id=${it.id}>${it.title}</li>`)}
  </ul>`;
}
```

## Ordering and Identity

- Default sort: priority asc, then `created_at` desc, then id asc.
- When upserting, the store preserves object identity for existing ids by
  mutating fields in place. This reduces unnecessary re‑renders.

## Reconnects

- On reconnect, repeat the subscribe‑list call. The server sends a fresh
  `snapshot` with `revision: 1`. The store ignores stale envelopes using the
  `revision` guard.
