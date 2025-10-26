/**
 * @import { Server } from 'node:http'
 * @import { RawData, WebSocket } from 'ws'
 * @import { MessageType } from '../app/protocol.js'
 */
import { WebSocketServer } from 'ws';
import { runBd, runBdJson } from './bd.js';
import { fetchListForSubscription } from './list-adapters.js';
import { isRequest, makeError, makeOk } from './protocol.js';
import { keyOf, registry } from './subscriptions.js';
import { validateSubscribeListPayload } from './validators.js';

/**
 * Debounced refresh scheduling for active list subscriptions.
 * A trailing window coalesces rapid change bursts into a single refresh run.
 */
/** @type {ReturnType<typeof setTimeout> | null} */
let REFRESH_TIMER = null;
let REFRESH_DEBOUNCE_MS = 75;

/**
 * Mutation refresh window gate. When active, watcher-driven list refresh
 * scheduling is suppressed. The gate resolves either when a watcher event
 * arrives (via scheduleListRefresh) or when a timeout elapses, at which
 * point a single refresh pass over all active list subscriptions is run.
 */
/**
 * @typedef {Object} MutationGate
 * @property {boolean} resolved
 * @property {(reason: 'watcher'|'timeout') => void} resolve
 * @property {ReturnType<typeof setTimeout>} timer
 */
/** @type {MutationGate | null} */
let MUTATION_GATE = null;

/**
 * Start a mutation window gate if not already active. The gate resolves on the
 * next watcher event or after `timeout_ms`, then triggers a single refresh run
 * across all active list subscriptions. Watcher-driven refresh scheduling is
 * suppressed during the window.
 *
 * Fire-and-forget; callers should not await this.
 * @param {number} [timeout_ms]
 */
function triggerMutationRefreshOnce(timeout_ms = 500) {
  if (MUTATION_GATE) {
    return;
  }
  /** @type {(r: 'watcher'|'timeout') => void} */
  let doResolve = () => {};
  const p = new Promise((resolve) => {
    doResolve = resolve;
  });
  MUTATION_GATE = {
    resolved: false,
    resolve: (reason) => {
      if (!MUTATION_GATE || MUTATION_GATE.resolved) {
        return;
      }
      MUTATION_GATE.resolved = true;
      try {
        doResolve(reason);
      } catch {
        // ignore resolve errors
      }
    },
    timer: setTimeout(() => {
      try {
        MUTATION_GATE?.resolve('timeout');
      } catch {
        // ignore
      }
    }, timeout_ms)
  };
  MUTATION_GATE.timer.unref?.();

  // After resolution, run a single refresh across active subs and clear gate
  void p.then(async () => {
    try {
      await refreshAllActiveListSubscriptions();
    } catch {
      // ignore refresh errors
    } finally {
      try {
        if (MUTATION_GATE?.timer) {
          clearTimeout(MUTATION_GATE.timer);
        }
      } catch {
        // ignore
      }
      MUTATION_GATE = null;
    }
  });
}

/**
 * Collect unique active list subscription specs across all connected clients.
 * @returns {Array<{ type: string, params?: Record<string,string|number|boolean> }>}
 */
function collectActiveListSpecs() {
  /** @type {Array<{ type: string, params?: Record<string,string|number|boolean> }>} */
  const specs = [];
  /** @type {Set<string>} */
  const seen = new Set();
  const wss = CURRENT_WSS;
  if (!wss) {
    return specs;
  }
  for (const ws of wss.clients) {
    if (ws.readyState !== ws.OPEN) {
      continue;
    }
    const s = ensureSubs(/** @type {any} */ (ws));
    if (!s.list_subs) {
      continue;
    }
    for (const { key, spec } of s.list_subs.values()) {
      if (!seen.has(key)) {
        seen.add(key);
        specs.push(spec);
      }
    }
  }
  return specs;
}

/**
 * Run refresh for all active list subscription specs and publish deltas.
 */
async function refreshAllActiveListSubscriptions() {
  const specs = collectActiveListSpecs();
  // Run refreshes concurrently; locking is handled per key in the registry
  await Promise.all(
    specs.map(async (spec) => {
      try {
        await refreshAndPublish(spec);
      } catch {
        // ignore refresh errors per spec
      }
    })
  );
}

/**
 * Schedule a coalesced refresh of all active list subscriptions.
 */
export function scheduleListRefresh() {
  // Suppress watcher-driven refreshes during an active mutation gate; resolve gate once
  if (MUTATION_GATE) {
    try {
      MUTATION_GATE.resolve('watcher');
    } catch {
      // ignore
    }
    return;
  }
  if (REFRESH_TIMER) {
    clearTimeout(REFRESH_TIMER);
  }
  REFRESH_TIMER = setTimeout(() => {
    REFRESH_TIMER = null;
    // Fire and forget; callers don't await scheduling
    void refreshAllActiveListSubscriptions();
  }, REFRESH_DEBOUNCE_MS);
  REFRESH_TIMER.unref?.();
}

/**
 * @typedef {{
 *   show_id?: string | null,
 *   list_subs?: Map<string, { key: string, spec: { type: string, params?: Record<string, string | number | boolean> } }>,
 *   list_revisions?: Map<string, number>
 * }} ConnectionSubs
 */

/** @type {WeakMap<WebSocket, any>} */
const SUBS = new WeakMap();

/** @type {WebSocketServer | null} */
let CURRENT_WSS = null;

/**
 * Get or initialize the subscription state for a socket.
 * @param {WebSocket} ws
 * @returns {any}
 */
function ensureSubs(ws) {
  let s = SUBS.get(ws);
  if (!s) {
    s = {
      show_id: null,
      list_subs: new Map(),
      list_revisions: new Map()
    };
    SUBS.set(ws, s);
  }
  return s;
}

/**
 * Get next monotonically increasing revision for a subscription key on this connection.
 * @param {WebSocket} ws
 * @param {string} key
 */
/**
 * @param {WebSocket} ws
 * @param {string} key
 */
function nextListRevision(ws, key) {
  const s = ensureSubs(ws);
  const m = s.list_revisions || new Map();
  s.list_revisions = m;
  const prev = m.get(key) || 0;
  const next = prev + 1;
  m.set(key, next);
  return next;
}

/**
 * Emit per-subscription envelopes to a specific client id on a socket.
 * Helpers for snapshot / upsert / delete.
 */
/**
 * @param {WebSocket} ws
 * @param {string} client_id
 * @param {string} key
 * @param {Array<Record<string, unknown>>} issues
 */
function emitSubscriptionSnapshot(ws, client_id, key, issues) {
  const revision = nextListRevision(ws, key);
  const payload = {
    type: /** @type {const} */ ('snapshot'),
    id: client_id,
    revision,
    issues
  };
  const msg = JSON.stringify({
    id: `evt-${Date.now()}`,
    ok: true,
    type: /** @type {MessageType} */ ('snapshot'),
    payload
  });
  try {
    ws.send(msg);
  } catch {
    // ignore per-socket errors
  }
}

/**
 * @param {WebSocket} ws
 * @param {string} client_id
 * @param {string} key
 * @param {Record<string, unknown>} issue
 */
function emitSubscriptionUpsert(ws, client_id, key, issue) {
  const revision = nextListRevision(ws, key);
  const payload = {
    type: 'upsert',
    id: client_id,
    revision,
    issue
  };
  const msg = JSON.stringify({
    id: `evt-${Date.now()}`,
    ok: true,
    type: /** @type {MessageType} */ ('upsert'),
    payload
  });
  try {
    ws.send(msg);
  } catch {
    // ignore
  }
}

/**
 * @param {WebSocket} ws
 * @param {string} client_id
 * @param {string} key
 * @param {string} issue_id
 */
function emitSubscriptionDelete(ws, client_id, key, issue_id) {
  const revision = nextListRevision(ws, key);
  const payload = {
    type: 'delete',
    id: client_id,
    revision,
    issue_id
  };
  const msg = JSON.stringify({
    id: `evt-${Date.now()}`,
    ok: true,
    type: /** @type {MessageType} */ ('delete'),
    payload
  });
  try {
    ws.send(msg);
  } catch {
    // ignore
  }
}

// issues-changed removed in v2: detail and lists are pushed via subscriptions

/**
 * Refresh a subscription spec: fetch via adapter, apply to registry and emit
 * per-subscription full-issue envelopes to subscribers. Serialized per key.
 * @param {{ type: string, params?: Record<string, string|number|boolean> }} spec
 */
async function refreshAndPublish(spec) {
  const key = keyOf(spec);
  await registry.withKeyLock(key, async () => {
    const res = await fetchListForSubscription(spec);
    if (!res.ok) {
      return;
    }
    const items = applyClosedIssuesFilter(spec, res.items);
    const prevSize = registry.get(key)?.itemsById.size || 0;
    const delta = registry.applyItems(key, items);
    const entry = registry.get(key);
    if (!entry || entry.subscribers.size === 0) {
      return;
    }
    /** @type {Map<string, any>} */
    const byId = new Map();
    for (const it of items) {
      if (it && typeof it.id === 'string') {
        byId.set(it.id, it);
      }
    }
    for (const ws of entry.subscribers) {
      if (ws.readyState !== ws.OPEN) continue;
      const s = ensureSubs(ws);
      const subs = s.list_subs || new Map();
      /** @type {string[]} */
      const clientIds = [];
      for (const [cid, v] of subs.entries()) {
        if (v.key === key) clientIds.push(cid);
      }
      if (clientIds.length === 0) continue;
      if (prevSize === 0) {
        for (const cid of clientIds) {
          emitSubscriptionSnapshot(ws, cid, key, items);
        }
        continue;
      }
      for (const cid of clientIds) {
        for (const id of [...delta.added, ...delta.updated]) {
          const issue = byId.get(id);
          if (issue) {
            emitSubscriptionUpsert(ws, cid, key, issue);
          }
        }
        for (const id of delta.removed) {
          emitSubscriptionDelete(ws, cid, key, id);
        }
      }
    }
  });
}

/**
 * Apply pre-diff filtering for closed-issues lists based on spec.params.since (epoch ms).
 * @param {{ type: string, params?: Record<string, string|number|boolean> }} spec
 * @param {Array<{ id: string, updated_at: number, closed_at: number | null } & Record<string, unknown>>} items
 */
function applyClosedIssuesFilter(spec, items) {
  if (String(spec.type) !== 'closed-issues') {
    return items;
  }
  const p = spec.params || {};
  const since = typeof p.since === 'number' ? p.since : 0;
  if (!Number.isFinite(since) || since <= 0) {
    return items;
  }
  /** @type {typeof items} */
  const out = [];
  for (const it of items) {
    const ca = it.closed_at;
    if (typeof ca === 'number' && Number.isFinite(ca) && ca >= since) {
      out.push(it);
    }
  }
  return out;
}

/**
 * Attach a WebSocket server to an existing HTTP server.
 * @param {Server} http_server
 * @param {{ path?: string, heartbeat_ms?: number, refresh_debounce_ms?: number }} [options]
 * @returns {{ wss: WebSocketServer, broadcast: (type: MessageType, payload?: unknown) => void, scheduleListRefresh: () => void }}
 */
export function attachWsServer(http_server, options = {}) {
  const path = options.path || '/ws';
  const heartbeat_ms = options.heartbeat_ms ?? 30000;
  if (typeof options.refresh_debounce_ms === 'number') {
    const n = options.refresh_debounce_ms;
    if (Number.isFinite(n) && n >= 0) {
      REFRESH_DEBOUNCE_MS = n;
    }
  }

  const wss = new WebSocketServer({ server: http_server, path });
  CURRENT_WSS = wss;

  // Heartbeat: track if client answered the last ping
  wss.on('connection', (ws) => {
    // @ts-expect-error add marker property
    ws.isAlive = true;

    // Initialize subscription state for this connection
    ensureSubs(ws);

    ws.on('pong', () => {
      // @ts-expect-error marker
      ws.isAlive = true;
    });

    ws.on('message', (data) => {
      handleMessage(ws, data);
    });

    ws.on('close', () => {
      try {
        registry.onDisconnect(ws);
      } catch {
        // ignore cleanup errors
      }
    });
  });

  const interval = setInterval(() => {
    for (const ws of wss.clients) {
      // @ts-expect-error marker
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      // @ts-expect-error marker
      ws.isAlive = false;
      ws.ping();
    }
  }, heartbeat_ms);

  interval.unref?.();

  wss.on('close', () => {
    clearInterval(interval);
  });

  /**
   * Broadcast a server-initiated event to all open clients.
   * @param {MessageType} type
   * @param {unknown} [payload]
   */
  function broadcast(type, payload) {
    const msg = JSON.stringify({
      id: `evt-${Date.now()}`,
      ok: true,
      type,
      payload
    });
    for (const ws of wss.clients) {
      if (ws.readyState === ws.OPEN) {
        ws.send(msg);
      }
    }
  }

  return {
    wss,
    broadcast,
    scheduleListRefresh
    // v2: list subscription refresh handles updates
  };
}

/**
 * Handle an incoming message frame and respond to the same socket.
 * @param {WebSocket} ws
 * @param {RawData} data
 */
export async function handleMessage(ws, data) {
  /** @type {unknown} */
  let json;
  try {
    json = JSON.parse(data.toString());
  } catch {
    const reply = {
      id: 'unknown',
      ok: false,
      type: 'bad-json',
      error: { code: 'bad_json', message: 'Invalid JSON' }
    };
    ws.send(JSON.stringify(reply));
    return;
  }

  if (!isRequest(json)) {
    const reply = {
      id: 'unknown',
      ok: false,
      type: 'bad-request',
      error: { code: 'bad_request', message: 'Invalid request envelope' }
    };
    ws.send(JSON.stringify(reply));
    return;
  }

  const req = json;

  // Dispatch known types here as we implement them. For now, only a ping utility.
  if (req.type === /** @type {MessageType} */ ('ping')) {
    ws.send(JSON.stringify(makeOk(req, { ts: Date.now() })));
    return;
  }

  // subscribe-list: payload { id: string, type: string, params?: object }
  if (req.type === 'subscribe-list') {
    const validation = validateSubscribeListPayload(
      /** @type {any} */ (req.payload || {})
    );
    if (!validation.ok) {
      ws.send(
        JSON.stringify(makeError(req, validation.code, validation.message))
      );
      return;
    }
    const client_id = validation.id;
    const spec = validation.spec;
    const s = ensureSubs(ws);
    // Attach to registry
    const { key } = registry.attach(spec, ws);
    s.list_subs?.set(client_id, { key, spec });
    // Send an initial snapshot for this client id only and store items
    try {
      await registry.withKeyLock(key, async () => {
        const res = await fetchListForSubscription(spec);
        if (!res.ok) {
          return;
        }
        const items = applyClosedIssuesFilter(spec, res.items);
        void registry.applyItems(key, items);
        emitSubscriptionSnapshot(ws, client_id, key, items);
      });
    } catch {
      // ignore snapshot errors
    }
    ws.send(JSON.stringify(makeOk(req, { id: client_id, key })));
    return;
  }

  // unsubscribe-list: payload { id: string }
  if (req.type === 'unsubscribe-list') {
    const { id: client_id } = /** @type {any} */ (req.payload || {});
    if (typeof client_id !== 'string' || client_id.length === 0) {
      ws.send(
        JSON.stringify(
          makeError(req, 'bad_request', 'payload.id must be a non-empty string')
        )
      );
      return;
    }
    const s = ensureSubs(ws);
    const sub = s.list_subs?.get(client_id) || null;
    let removed = false;
    if (sub) {
      try {
        removed = registry.detach(sub.spec, ws);
      } catch {
        removed = false;
      }
      s.list_subs?.delete(client_id);
    }
    ws.send(
      JSON.stringify(
        makeOk(req, {
          id: client_id,
          unsubscribed: removed
        })
      )
    );
    return;
  }

  // Removed: subscribe-updates and subscribe-issues. No-ops in v2.

  // list-issues and epic-status were removed in favor of push-only subscriptions

  // Removed: show-issue. Details flow is push-only via `subscribe-list { type: 'issue-detail' }`.

  // type updates are not exposed via UI; no handler

  // update-assignee
  if (req.type === 'update-assignee') {
    const { id, assignee } = /** @type {any} */ (req.payload || {});
    if (
      typeof id !== 'string' ||
      id.length === 0 ||
      typeof assignee !== 'string'
    ) {
      ws.send(
        JSON.stringify(
          makeError(
            req,
            'bad_request',
            'payload requires { id: string, assignee: string }'
          )
        )
      );
      return;
    }
    // Pass empty string to clear assignee when requested
    const res = await runBd(['update', id, '--assignee', assignee]);
    if (res.code !== 0) {
      ws.send(
        JSON.stringify(makeError(req, 'bd_error', res.stderr || 'bd failed'))
      );
      return;
    }
    const shown = await runBdJson(['show', id, '--json']);
    if (shown.code !== 0) {
      ws.send(
        JSON.stringify(makeError(req, 'bd_error', shown.stderr || 'bd failed'))
      );
      return;
    }
    ws.send(JSON.stringify(makeOk(req, shown.stdoutJson)));
    try {
      triggerMutationRefreshOnce();
    } catch {
      // ignore
    }
    return;
  }

  // update-status
  if (req.type === 'update-status') {
    const { id, status } = /** @type {any} */ (req.payload);
    const allowed = new Set(['open', 'in_progress', 'closed']);
    if (
      typeof id !== 'string' ||
      id.length === 0 ||
      typeof status !== 'string' ||
      !allowed.has(status)
    ) {
      ws.send(
        JSON.stringify(
          makeError(
            req,
            'bad_request',
            "payload requires { id: string, status: 'open'|'in_progress'|'closed' }"
          )
        )
      );
      return;
    }
    const res = await runBd(['update', id, '--status', status]);
    if (res.code !== 0) {
      ws.send(
        JSON.stringify(makeError(req, 'bd_error', res.stderr || 'bd failed'))
      );
      return;
    }
    const shown = await runBdJson(['show', id, '--json']);
    if (shown.code !== 0) {
      ws.send(
        JSON.stringify(makeError(req, 'bd_error', shown.stderr || 'bd failed'))
      );
      return;
    }
    ws.send(JSON.stringify(makeOk(req, shown.stdoutJson)));
    // After mutation, refresh active subscriptions once (watcher or timeout)
    try {
      triggerMutationRefreshOnce();
    } catch {
      // ignore
    }
    return;
  }

  // update-priority
  if (req.type === 'update-priority') {
    const { id, priority } = /** @type {any} */ (req.payload);
    if (
      typeof id !== 'string' ||
      id.length === 0 ||
      typeof priority !== 'number' ||
      priority < 0 ||
      priority > 4
    ) {
      ws.send(
        JSON.stringify(
          makeError(
            req,
            'bad_request',
            'payload requires { id: string, priority: 0..4 }'
          )
        )
      );
      return;
    }
    const res = await runBd(['update', id, '--priority', String(priority)]);
    if (res.code !== 0) {
      ws.send(
        JSON.stringify(makeError(req, 'bd_error', res.stderr || 'bd failed'))
      );
      return;
    }
    const shown = await runBdJson(['show', id, '--json']);
    if (shown.code !== 0) {
      ws.send(
        JSON.stringify(makeError(req, 'bd_error', shown.stderr || 'bd failed'))
      );
      return;
    }
    ws.send(JSON.stringify(makeOk(req, shown.stdoutJson)));
    try {
      triggerMutationRefreshOnce();
    } catch {
      // ignore
    }
    return;
  }

  // edit-text
  if (req.type === 'edit-text') {
    const { id, field, value } = /** @type {any} */ (req.payload);
    if (
      typeof id !== 'string' ||
      id.length === 0 ||
      (field !== 'title' &&
        field !== 'description' &&
        field !== 'acceptance' &&
        field !== 'notes' &&
        field !== 'design') ||
      typeof value !== 'string'
    ) {
      ws.send(
        JSON.stringify(
          makeError(
            req,
            'bad_request',
            "payload requires { id: string, field: 'title'|'description'|'acceptance'|'notes'|'design', value: string }"
          )
        )
      );
      return;
    }
    // Map UI fields to bd CLI flags
    // title       → --title
    // description → --description
    // acceptance  → --acceptance-criteria
    // notes       → --notes
    // design      → --design
    const flag =
      field === 'title'
        ? '--title'
        : field === 'description'
          ? '--description'
          : field === 'acceptance'
            ? '--acceptance-criteria'
            : field === 'notes'
              ? '--notes'
              : '--design';
    const res = await runBd(['update', id, flag, value]);
    if (res.code !== 0) {
      ws.send(
        JSON.stringify(makeError(req, 'bd_error', res.stderr || 'bd failed'))
      );
      return;
    }
    const shown = await runBdJson(['show', id, '--json']);
    if (shown.code !== 0) {
      ws.send(
        JSON.stringify(makeError(req, 'bd_error', shown.stderr || 'bd failed'))
      );
      return;
    }
    ws.send(JSON.stringify(makeOk(req, shown.stdoutJson)));
    try {
      triggerMutationRefreshOnce();
    } catch {
      // ignore
    }
    return;
  }

  // create-issue
  if (req.type === 'create-issue') {
    const { title, type, priority, description } = /** @type {any} */ (
      req.payload || {}
    );
    if (typeof title !== 'string' || title.length === 0) {
      ws.send(
        JSON.stringify(
          makeError(
            req,
            'bad_request',
            'payload requires { title: string, ... }'
          )
        )
      );
      return;
    }
    const args = ['create', title];
    if (
      typeof type === 'string' &&
      (type === 'bug' ||
        type === 'feature' ||
        type === 'task' ||
        type === 'epic' ||
        type === 'chore')
    ) {
      args.push('-t', type);
    }
    if (typeof priority === 'number' && priority >= 0 && priority <= 4) {
      args.push('-p', String(priority));
    }
    if (typeof description === 'string' && description.length > 0) {
      args.push('-d', description);
    }
    const res = await runBd(args);
    if (res.code !== 0) {
      ws.send(
        JSON.stringify(makeError(req, 'bd_error', res.stderr || 'bd failed'))
      );
      return;
    }
    // Reply with a minimal ack
    ws.send(JSON.stringify(makeOk(req, { created: true })));
    // Refresh active subscriptions once (watcher or timeout)
    try {
      triggerMutationRefreshOnce();
    } catch {
      // ignore
    }
    return;
  }

  // dep-add: payload { a: string, b: string, view_id?: string }
  if (req.type === 'dep-add') {
    const { a, b, view_id } = /** @type {any} */ (req.payload || {});
    if (
      typeof a !== 'string' ||
      a.length === 0 ||
      typeof b !== 'string' ||
      b.length === 0
    ) {
      ws.send(
        JSON.stringify(
          makeError(
            req,
            'bad_request',
            'payload requires { a: string, b: string }'
          )
        )
      );
      return;
    }
    const res = await runBd(['dep', 'add', a, b]);
    if (res.code !== 0) {
      ws.send(
        JSON.stringify(makeError(req, 'bd_error', res.stderr || 'bd failed'))
      );
      return;
    }
    const id = typeof view_id === 'string' && view_id.length > 0 ? view_id : a;
    const shown = await runBdJson(['show', id, '--json']);
    if (shown.code !== 0) {
      ws.send(
        JSON.stringify(makeError(req, 'bd_error', shown.stderr || 'bd failed'))
      );
      return;
    }
    ws.send(JSON.stringify(makeOk(req, shown.stdoutJson)));
    try {
      triggerMutationRefreshOnce();
    } catch {
      // ignore
    }
    return;
  }

  // dep-remove: payload { a: string, b: string, view_id?: string }
  if (req.type === 'dep-remove') {
    const { a, b, view_id } = /** @type {any} */ (req.payload || {});
    if (
      typeof a !== 'string' ||
      a.length === 0 ||
      typeof b !== 'string' ||
      b.length === 0
    ) {
      ws.send(
        JSON.stringify(
          makeError(
            req,
            'bad_request',
            'payload requires { a: string, b: string }'
          )
        )
      );
      return;
    }
    const res = await runBd(['dep', 'remove', a, b]);
    if (res.code !== 0) {
      ws.send(
        JSON.stringify(makeError(req, 'bd_error', res.stderr || 'bd failed'))
      );
      return;
    }
    const id = typeof view_id === 'string' && view_id.length > 0 ? view_id : a;
    const shown = await runBdJson(['show', id, '--json']);
    if (shown.code !== 0) {
      ws.send(
        JSON.stringify(makeError(req, 'bd_error', shown.stderr || 'bd failed'))
      );
      return;
    }
    ws.send(JSON.stringify(makeOk(req, shown.stdoutJson)));
    try {
      triggerMutationRefreshOnce();
    } catch {
      // ignore
    }
    return;
  }

  // label-add: payload { id: string, label: string }
  if (req.type === 'label-add') {
    const { id, label } = /** @type {any} */ (req.payload || {});
    if (
      typeof id !== 'string' ||
      id.length === 0 ||
      typeof label !== 'string' ||
      label.trim().length === 0
    ) {
      ws.send(
        JSON.stringify(
          makeError(
            req,
            'bad_request',
            'payload requires { id: string, label: non-empty string }'
          )
        )
      );
      return;
    }
    const res = await runBd(['label', 'add', id, label.trim()]);
    if (res.code !== 0) {
      ws.send(
        JSON.stringify(makeError(req, 'bd_error', res.stderr || 'bd failed'))
      );
      return;
    }
    const shown = await runBdJson(['show', id, '--json']);
    if (shown.code !== 0) {
      ws.send(
        JSON.stringify(makeError(req, 'bd_error', shown.stderr || 'bd failed'))
      );
      return;
    }
    ws.send(JSON.stringify(makeOk(req, shown.stdoutJson)));
    try {
      triggerMutationRefreshOnce();
    } catch {
      // ignore
    }
    return;
  }

  // label-remove: payload { id: string, label: string }
  if (req.type === 'label-remove') {
    const { id, label } = /** @type {any} */ (req.payload || {});
    if (
      typeof id !== 'string' ||
      id.length === 0 ||
      typeof label !== 'string' ||
      label.trim().length === 0
    ) {
      ws.send(
        JSON.stringify(
          makeError(
            req,
            'bad_request',
            'payload requires { id: string, label: non-empty string }'
          )
        )
      );
      return;
    }
    const res = await runBd(['label', 'remove', id, label.trim()]);
    if (res.code !== 0) {
      ws.send(
        JSON.stringify(makeError(req, 'bd_error', res.stderr || 'bd failed'))
      );
      return;
    }
    const shown = await runBdJson(['show', id, '--json']);
    if (shown.code !== 0) {
      ws.send(
        JSON.stringify(makeError(req, 'bd_error', shown.stderr || 'bd failed'))
      );
      return;
    }
    ws.send(JSON.stringify(makeOk(req, shown.stdoutJson)));
    try {
      triggerMutationRefreshOnce();
    } catch {
      // ignore
    }
    return;
  }

  // Unknown type
  const err = makeError(
    req,
    'unknown_type',
    `Unknown message type: ${req.type}`
  );
  ws.send(JSON.stringify(err));
}
