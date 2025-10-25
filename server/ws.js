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

/**
 * @typedef {{
 *   subscribed: boolean,
 *   list_filters?: { status?: 'open'|'in_progress'|'closed', ready?: boolean, blocked?: boolean, limit?: number },
 *   show_id?: string | null,
 *   list_subs?: Map<string, { key: string, spec: { type: string, params?: Record<string, string | number | boolean> } }>
 * }} ConnectionSubs
 */

/** @type {WeakMap<WebSocket, ConnectionSubs>} */
const SUBS = new WeakMap();

/** @type {WebSocketServer | null} */
let CURRENT_WSS = null;

/**
 * Get or initialize the subscription state for a socket.
 * @param {WebSocket} ws
 * @returns {ConnectionSubs}
 */
function getSubs(ws) {
  let s = SUBS.get(ws);
  if (!s) {
    s = { subscribed: false, show_id: null, list_subs: new Map() };
    SUBS.set(ws, s);
  }
  return s;
}

/**
 * Emit an issues-changed event to relevant clients when possible, or broadcast to all.
 * Targeting rules:
 * - If `issue` is provided, send to clients that currently show the same id or whose
 *   last list filter likely includes the issue (status match or ready=true).
 * - If only `hint` is provided, but contains ids, send to clients that show one of those ids.
 * - Otherwise, send to all open clients.
 * @param {{ ts?: number, hint?: { ids?: string[] } }} payload
 * @param {{ issue?: any }} [options]
 */
export function notifyIssuesChanged(payload, options = {}) {
  const wss = CURRENT_WSS;
  if (!wss) {
    return;
  }
  /** @type {Set<WebSocket>} */
  const recipients = new Set();

  const issue = options.issue;
  const hint_ids = payload.hint?.ids ?? [];

  if (issue && typeof issue === 'object' && issue.id) {
    for (const ws of wss.clients) {
      if (ws.readyState !== ws.OPEN) {
        continue;
      }
      const s = getSubs(ws);
      if (!s.subscribed) {
        continue;
      }
      if (s.show_id && s.show_id === issue.id) {
        recipients.add(ws);
        continue;
      }
      if (s.list_filters) {
        // Ready/Blocked lists are conservatively invalidated on any change
        if (s.list_filters.ready === true || s.list_filters.blocked === true) {
          recipients.add(ws);
          continue;
        }
        // Status lists: invalidate when status matches updated issue
        if (
          s.list_filters.status &&
          String(s.list_filters.status) === String(issue.status || '')
        ) {
          recipients.add(ws);
          continue;
        }
      }
    }
  } else if (hint_ids.length > 0) {
    for (const ws of wss.clients) {
      if (ws.readyState !== ws.OPEN) {
        continue;
      }
      const s = getSubs(ws);
      if (!s.subscribed) {
        continue;
      }
      if (s.show_id && hint_ids.includes(s.show_id)) {
        recipients.add(ws);
      }
    }
  }

  /** @type {string} */
  const msg = JSON.stringify({
    id: `evt-${Date.now()}`,
    ok: true,
    type: /** @type {MessageType} */ ('issues-changed'),
    payload: { ts: Date.now(), ...(payload || {}) }
  });

  if (recipients.size > 0) {
    for (const ws of recipients) {
      ws.send(msg);
    }
  } else {
    // Fallback: full broadcast to keep clients consistent
    for (const ws of wss.clients) {
      if (ws.readyState === ws.OPEN) {
        ws.send(msg);
      }
    }
  }
}

/**
 * Refresh a subscription spec: fetch via adapter, apply to registry and publish delta.
 * Serialized per-key using registry.withKeyLock.
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
    const delta = registry.applyItems(key, items);
    if (
      delta.added.length > 0 ||
      delta.updated.length > 0 ||
      delta.removed.length > 0
    ) {
      registry.publishDelta(key, delta);
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
  /** @type {number} */
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
 * @param {{ path?: string, heartbeat_ms?: number }} [options]
 * @returns {{ wss: WebSocketServer, broadcast: (type: MessageType, payload?: unknown) => void, notifyIssuesChanged: (payload: { ts?: number, hint?: { ids?: string[] } }) => void }}
 */
export function attachWsServer(http_server, options = {}) {
  const path = options.path || '/ws';
  const heartbeat_ms = options.heartbeat_ms ?? 30000;

  const wss = new WebSocketServer({ server: http_server, path });
  CURRENT_WSS = wss;

  // Heartbeat: track if client answered the last ping
  wss.on('connection', (ws) => {
    // @ts-expect-error add marker property
    ws.isAlive = true;

    // Initialize subscription state for this connection
    getSubs(ws);

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

  return { wss, broadcast, notifyIssuesChanged: (p) => notifyIssuesChanged(p) };
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
    const {
      id: client_id,
      type,
      params
    } = /** @type {any} */ (req.payload || {});
    if (typeof client_id !== 'string' || client_id.length === 0) {
      ws.send(
        JSON.stringify(
          makeError(req, 'bad_request', 'payload.id must be a non-empty string')
        )
      );
      return;
    }
    if (typeof type !== 'string' || type.length === 0) {
      ws.send(
        JSON.stringify(
          makeError(
            req,
            'bad_request',
            'payload.type must be a non-empty string'
          )
        )
      );
      return;
    }
    /** @type {{ type: string, params?: Record<string, string|number|boolean> }} */
    const spec = {
      type,
      params: params && typeof params === 'object' ? params : undefined
    };
    const s = getSubs(ws);
    // Attach to registry
    const { key } = registry.attach(spec, ws);
    s.list_subs?.set(client_id, { key, spec });
    // Kick an initial refresh + delta fanout
    try {
      await refreshAndPublish(spec);
    } catch {
      // ignore refresh errors
    }
    ws.send(
      JSON.stringify(
        makeOk(req, {
          id: client_id,
          key
        })
      )
    );
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
    const s = getSubs(ws);
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

  // subscribe-updates: mark this connection as event subscriber
  if (req.type === 'subscribe-updates') {
    const s = getSubs(ws);
    s.subscribed = true;
    ws.send(JSON.stringify(makeOk(req, { subscribed: true })));
    return;
  }

  // list-issues
  if (req.type === 'list-issues') {
    const { filters } = /** @type {any} */ (req.payload || {});
    // When "ready" is requested, use the dedicated bd subcommand
    if (filters && typeof filters === 'object' && filters.ready === true) {
      const res = await runBdJson(['ready', '--json']);
      if (res.code !== 0) {
        const err = makeError(req, 'bd_error', res.stderr || 'bd failed');
        ws.send(JSON.stringify(err));
        return;
      }
      // Remember subscription scope for this connection
      try {
        const s = getSubs(ws);
        s.list_filters = { ready: true };
      } catch {
        // ignore tracking errors
      }
      ws.send(JSON.stringify(makeOk(req, res.stdoutJson)));
      return;
    }

    // When "blocked" is requested, use the dedicated bd subcommand
    if (filters && typeof filters === 'object' && filters.blocked === true) {
      const res = await runBdJson(['blocked', '--json']);
      if (res.code !== 0) {
        const err = makeError(req, 'bd_error', res.stderr || 'bd failed');
        ws.send(JSON.stringify(err));
        return;
      }
      // Remember subscription scope for this connection
      try {
        const s = getSubs(ws);
        s.list_filters = { blocked: true };
      } catch {
        // ignore tracking errors
      }
      ws.send(JSON.stringify(makeOk(req, res.stdoutJson)));
      return;
    }

    const args = ['list', '--json'];
    if (filters && typeof filters === 'object') {
      if (typeof filters.status === 'string') {
        // Use long flag for clarity and compatibility
        args.push('--status', filters.status);
      }
      if (typeof filters.priority === 'number') {
        args.push('--priority', String(filters.priority));
      }
      if (typeof filters.limit === 'number' && filters.limit > 0) {
        args.push('--limit', String(filters.limit));
      }
    }
    const res = await runBdJson(args);
    if (res.code !== 0) {
      const err = makeError(req, 'bd_error', res.stderr || 'bd failed');
      ws.send(JSON.stringify(err));
      return;
    }
    // Remember last non-ready list filter
    try {
      const s = getSubs(ws);
      /** @type {{ status?: any, limit?: any }} */
      const f = filters && typeof filters === 'object' ? filters : {};
      const st = f.status;
      const lim = f.limit;
      s.list_filters = {};
      if (st === 'open' || st === 'in_progress' || st === 'closed') {
        s.list_filters.status = st;
      }
      if (typeof lim === 'number') {
        s.list_filters.limit = lim;
      }
    } catch {
      // ignore tracking errors
    }
    ws.send(JSON.stringify(makeOk(req, res.stdoutJson)));
    return;
  }

  // epic-status
  if (req.type === 'epic-status') {
    const res = await runBdJson(['epic', 'status', '--json']);
    if (res.code !== 0) {
      const err = makeError(req, 'bd_error', res.stderr || 'bd failed');
      ws.send(JSON.stringify(err));
      return;
    }
    ws.send(JSON.stringify(makeOk(req, res.stdoutJson)));
    return;
  }

  // show-issue
  if (req.type === 'show-issue') {
    const { id } = /** @type {any} */ (req.payload);
    if (typeof id !== 'string' || id.length === 0) {
      ws.send(
        JSON.stringify(
          makeError(req, 'bad_request', 'payload.id must be a non-empty string')
        )
      );
      return;
    }
    const res = await runBdJson(['show', id, '--json']);
    if (res.code !== 0) {
      const err = makeError(req, 'bd_error', res.stderr || 'bd failed');
      ws.send(JSON.stringify(err));
      return;
    }
    // bd show can return an array when it supports multiple ids;
    // normalize to a single object for the single-id API.
    const out = Array.isArray(res.stdoutJson)
      ? res.stdoutJson[0]
      : res.stdoutJson;
    if (!out) {
      ws.send(JSON.stringify(makeError(req, 'not_found', 'issue not found')));
      return;
    }
    // Track current detail subscription for this connection
    try {
      const s = getSubs(ws);
      s.show_id = String(id);
    } catch {
      // ignore
    }
    ws.send(JSON.stringify(makeOk(req, out)));
    return;
  }

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
    // Push targeted invalidation with updated issue context
    try {
      notifyIssuesChanged({ hint: { ids: [id] } }, { issue: shown.stdoutJson });
    } catch {
      // ignore fanout errors
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
      notifyIssuesChanged({ hint: { ids: [id] } }, { issue: shown.stdoutJson });
    } catch {
      // ignore fanout errors
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
      notifyIssuesChanged({ hint: { ids: [id] } }, { issue: shown.stdoutJson });
    } catch {
      // ignore fanout errors
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
    // Rely on watcher to refresh clients; reply with a minimal ack
    ws.send(JSON.stringify(makeOk(req, { created: true })));
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
      // Dependencies can affect readiness; conservatively target by issue id
      notifyIssuesChanged({ hint: { ids: [id] } }, { issue: shown.stdoutJson });
    } catch {
      // ignore fanout errors
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
      notifyIssuesChanged({ hint: { ids: [id] } }, { issue: shown.stdoutJson });
    } catch {
      // ignore fanout errors
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
      notifyIssuesChanged({ hint: { ids: [id] } }, { issue: shown.stdoutJson });
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
      notifyIssuesChanged({ hint: { ids: [id] } }, { issue: shown.stdoutJson });
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
