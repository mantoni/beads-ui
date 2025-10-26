/* global Console */
/**
 * @import { MessageType } from './protocol.js'
 */
/**
 * Persistent WebSocket client with reconnect, request/response correlation,
 * and simple event dispatching.
 *
 * Usage:
 *   const ws = createWsClient();
 *   const data = await ws.send('list-issues', { filters: {} });
 *   const off = ws.on('issues-changed', (payload) => { ... });
 */
import { MESSAGE_TYPES, makeRequest, nextId } from './protocol.js';

/**
 * @typedef {'connecting'|'open'|'closed'|'reconnecting'} ConnectionState
 */

/**
 * @typedef {{ initialMs?: number, maxMs?: number, factor?: number, jitterRatio?: number }} BackoffOptions
 */

/**
 * @typedef {{ url?: string, backoff?: BackoffOptions, logger?: Console }} ClientOptions
 */

/**
 * Create a WebSocket client with auto-reconnect and message correlation.
 * @param {ClientOptions} [options]
 */
export function createWsClient(options = {}) {
  /** @type {Console} */
  const logger = options.logger || console;

  /** @type {BackoffOptions} */
  const backoff = {
    initialMs: options.backoff?.initialMs ?? 1000,
    maxMs: options.backoff?.maxMs ?? 30000,
    factor: options.backoff?.factor ?? 2,
    jitterRatio: options.backoff?.jitterRatio ?? 0.2
  };

  /** @type {() => string} */
  const resolveUrl = () => {
    if (options.url && options.url.length > 0) {
      return options.url;
    }
    if (typeof location !== 'undefined') {
      return (
        (location.protocol === 'https:' ? 'wss://' : 'ws://') +
        location.host +
        '/ws'
      );
    }
    return 'ws://localhost/ws';
  };

  /** @type {WebSocket | null} */
  let ws = null;
  /** @type {ConnectionState} */
  let state = 'closed';
  /** @type {number} */
  let attempts = 0;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let reconnect_timer = null;
  /** @type {boolean} */
  let should_reconnect = true;

  /** @type {Map<string, { resolve: (v: any) => void, reject: (e: any) => void, type: string }>} */
  const pending = new Map();
  /** @type {Array<ReturnType<typeof makeRequest>>} */
  const queue = [];
  /** @type {Map<string, Set<(payload: any) => void>>} */
  const handlers = new Map();
  /** @type {Set<(s: ConnectionState) => void>} */
  const connection_handlers = new Set();

  /**
   * @param {ConnectionState} s
   */
  function notifyConnection(s) {
    for (const fn of Array.from(connection_handlers)) {
      try {
        fn(s);
      } catch {
        // ignore listener errors
      }
    }
  }

  function scheduleReconnect() {
    if (!should_reconnect || reconnect_timer) {
      return;
    }
    state = 'reconnecting';
    notifyConnection(state);
    const base = Math.min(
      backoff.maxMs || 0,
      (backoff.initialMs || 0) * Math.pow(backoff.factor || 1, attempts)
    );
    const jitter = (backoff.jitterRatio || 0) * base;
    const delay = Math.max(
      0,
      Math.round(base + (Math.random() * 2 - 1) * jitter)
    );
    reconnect_timer = setTimeout(() => {
      reconnect_timer = null;
      connect();
    }, delay);
  }

  /** @param {ReturnType<typeof makeRequest>} req */
  function sendRaw(req) {
    try {
      ws?.send(JSON.stringify(req));
    } catch (err) {
      logger.error('ws send failed', err);
    }
  }

  function onOpen() {
    state = 'open';
    notifyConnection(state);
    attempts = 0;
    // flush queue
    while (queue.length) {
      const req = queue.shift();
      if (req) {
        sendRaw(req);
      }
    }
  }

  /** @param {MessageEvent} ev */
  function onMessage(ev) {
    /** @type {any} */
    let msg;
    try {
      msg = JSON.parse(String(ev.data));
    } catch {
      logger.warn('ws received non-JSON message');
      return;
    }
    if (!msg || typeof msg.id !== 'string' || typeof msg.type !== 'string') {
      logger.warn('ws received invalid envelope');
      return;
    }

    if (pending.has(msg.id)) {
      const entry = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.ok) {
        entry?.resolve(msg.payload);
      } else {
        entry?.reject(msg.error || new Error('ws error'));
      }
      return;
    }

    // Treat as server-initiated event
    const set = handlers.get(msg.type);
    if (set && set.size > 0) {
      for (const fn of Array.from(set)) {
        try {
          fn(msg.payload);
        } catch (err) {
          logger.error('ws event handler error', err);
        }
      }
    } else {
      logger.warn(`ws received unhandled message type: ${msg.type}`);
    }
  }

  function onClose() {
    state = 'closed';
    notifyConnection(state);
    // fail all pending
    for (const [id, p] of pending.entries()) {
      p.reject(new Error('ws disconnected'));
      pending.delete(id);
    }
    attempts += 1;
    scheduleReconnect();
  }

  function connect() {
    if (!should_reconnect) {
      return;
    }
    const url = resolveUrl();
    try {
      ws = new WebSocket(url);
      state = 'connecting';
      notifyConnection(state);
      ws.addEventListener('open', onOpen);
      ws.addEventListener('message', onMessage);
      ws.addEventListener('error', () => {
        // let close handler handle reconnect
      });
      ws.addEventListener('close', onClose);
    } catch (err) {
      logger.error('ws connect failed', err);
      scheduleReconnect();
    }
  }

  connect();

  return {
    /**
     * Send a request and await its correlated reply payload.
     * @param {MessageType} type
     * @param {unknown} [payload]
     * @returns {Promise<any>}
     */
    send(type, payload) {
      if (!MESSAGE_TYPES.includes(type)) {
        return Promise.reject(new Error(`unknown message type: ${type}`));
      }
      const id = nextId();
      const req = makeRequest(type, payload, id);
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject, type });
        if (ws && ws.readyState === ws.OPEN) {
          sendRaw(req);
        } else {
          queue.push(req);
        }
      });
    },
    /**
     * Register a handler for a server-initiated event type.
     * Returns an unsubscribe function.
     * @param {MessageType} type
     * @param {(payload: any) => void} handler
     * @returns {() => void}
     */
    on(type, handler) {
      if (!handlers.has(type)) {
        handlers.set(type, new Set());
      }
      const set = handlers.get(type);
      set?.add(handler);
      return () => {
        set?.delete(handler);
      };
    },
    /**
     * Subscribe to connection state changes.
     * @param {(state: ConnectionState) => void} handler
     * @returns {() => void}
     */
    onConnection(handler) {
      connection_handlers.add(handler);
      return () => {
        connection_handlers.delete(handler);
      };
    },
    /** Close and stop reconnecting. */
    close() {
      should_reconnect = false;
      if (reconnect_timer) {
        clearTimeout(reconnect_timer);
        reconnect_timer = null;
      }
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    },
    /** For diagnostics in tests or UI. */
    getState() {
      return state;
    }
  };
}
