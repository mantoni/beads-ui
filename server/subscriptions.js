/**
 * @import { WebSocket } from 'ws'
 */
/**
 * Server-side subscription registry for list-like data.
 *
 * Maintains per-subscription entries keyed by a stable string derived from
 * `{ type, params }`. Each entry stores:
 *  - `itemsById`: Map<string, { updated_at: number, closed_at: number|null }>
 *  - `subscribers`: Set<WebSocket>
 *  - `lock`: Promise chain to serialize refresh/update operations per key
 *
 * No TTL eviction; entries are swept when sockets disconnect (and only when
 * that leaves the subscriber set empty).
 */

/**
 * @typedef {{
 *   type: string,
 *   params?: Record<string, string | number | boolean>
 * }} SubscriptionSpec
 */

/**
 * @typedef {{ updated_at: number, closed_at: number | null }} ItemMeta
 */

/**
 * @typedef {{
 *   itemsById: Map<string, ItemMeta>,
 *   subscribers: Set<WebSocket>,
 *   lock: Promise<void>
 * }} Entry
 */

/**
 * Create a new, empty entry object.
 *
 * @returns {Entry}
 */
function createEntry() {
  return {
    itemsById: new Map(),
    subscribers: new Set(),
    lock: Promise.resolve()
  };
}

/**
 * Generate a stable subscription key string from a spec. Sorts params keys.
 *
 * @param {SubscriptionSpec} spec
 * @returns {string}
 */
export function keyOf(spec) {
  const type = String(spec.type || '').trim();
  /** @type {Record<string, string>} */
  const flat = {};
  if (spec.params && typeof spec.params === 'object') {
    const keys = Object.keys(spec.params).sort();
    for (const k of keys) {
      const v = spec.params[k];
      flat[k] = String(v);
    }
  }
  const enc = new URLSearchParams(flat).toString();
  return enc.length > 0 ? `${type}?${enc}` : type;
}

/**
 * Compute a delta between previous and next item maps.
 *
 * @param {Map<string, ItemMeta>} prev
 * @param {Map<string, ItemMeta>} next
 * @returns {{ added: string[], updated: string[], removed: string[] }}
 */
export function computeDelta(prev, next) {
  /** @type {string[]} */
  const added = [];
  /** @type {string[]} */
  const updated = [];
  /** @type {string[]} */
  const removed = [];

  for (const [id, meta] of next) {
    const p = prev.get(id);
    if (!p) {
      added.push(id);
      continue;
    }
    if (p.updated_at !== meta.updated_at || p.closed_at !== meta.closed_at) {
      updated.push(id);
    }
  }
  for (const id of prev.keys()) {
    if (!next.has(id)) {
      removed.push(id);
    }
  }
  return { added, updated, removed };
}

/**
 * Normalize array of issue-like objects into an itemsById map.
 *
 * @param {Array<{ id: string, updated_at: number, closed_at?: number|null }>} items
 * @returns {Map<string, ItemMeta>}
 */
export function toItemsMap(items) {
  /** @type {Map<string, ItemMeta>} */
  const map = new Map();
  for (const it of items) {
    if (!it || typeof it.id !== 'string') {
      continue;
    }
    const updated_at = Number(it.updated_at) || 0;
    /** @type {number|null} */
    let closed_at = null;
    if (it.closed_at === null || it.closed_at === undefined) {
      closed_at = null;
    } else {
      const n = Number(it.closed_at);
      closed_at = Number.isFinite(n) ? n : null;
    }
    map.set(it.id, { updated_at, closed_at });
  }
  return map;
}

/**
 * Create a subscription registry with attach/detach and per-key locking.
 */
export class SubscriptionRegistry {
  constructor() {
    /** @type {Map<string, Entry>} */
    this._entries = new Map();
  }

  /**
   * Get an entry by key, or null if missing.
   *
   * @param {string} key
   * @returns {Entry | null}
   */
  get(key) {
    return this._entries.get(key) || null;
  }

  /**
   * Ensure an entry exists for a spec; returns the key and entry.
   *
   * @param {SubscriptionSpec} spec
   * @returns {{ key: string, entry: Entry }}
   */
  ensure(spec) {
    const key = keyOf(spec);
    let entry = this._entries.get(key);
    if (!entry) {
      entry = createEntry();
      this._entries.set(key, entry);
    }
    return { key, entry };
  }

  /**
   * Attach a subscriber to a spec. Creates the entry if missing.
   *
   * @param {SubscriptionSpec} spec
   * @param {WebSocket} ws
   * @returns {{ key: string, subscribed: true }}
   */
  attach(spec, ws) {
    const { key, entry } = this.ensure(spec);
    entry.subscribers.add(ws);
    return { key, subscribed: true };
  }

  /**
   * Detach a subscriber from the spec. Keeps entry even if empty; eviction
   * is handled by `onDisconnect` sweep.
   *
   * @param {SubscriptionSpec} spec
   * @param {WebSocket} ws
   * @returns {boolean} true when the subscriber was removed
   */
  detach(spec, ws) {
    const key = keyOf(spec);
    const entry = this._entries.get(key);
    if (!entry) {
      return false;
    }
    return entry.subscribers.delete(ws);
  }

  /**
   * On socket disconnect, remove it from all subscriber sets and evict any
   * entries that become empty as a result of this sweep.
   *
   * @param {WebSocket} ws
   */
  onDisconnect(ws) {
    /** @type {string[]} */
    const empties = [];
    for (const [key, entry] of this._entries) {
      entry.subscribers.delete(ws);
      if (entry.subscribers.size === 0) {
        empties.push(key);
      }
    }
    for (const key of empties) {
      this._entries.delete(key);
    }
  }

  /**
   * Serialize a function against a key so only one runs at a time per key.
   *
   * @template T
   * @param {string} key
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  async withKeyLock(key, fn) {
    let entry = this._entries.get(key);
    if (!entry) {
      entry = createEntry();
      this._entries.set(key, entry);
    }
    // Chain onto the existing lock
    const prev = entry.lock;
    // Create our own release function and store it locally (not in shared state)
    // to avoid race conditions when multiple operations queue concurrently
    /** @type {(v?: void) => void} */
    let release = () => {};
    const our_lock = new Promise((resolve) => {
      release = resolve;
    });
    // Update the entry's lock to our lock so the next operation waits on us
    entry.lock = our_lock;
    // Wait for previous operations to finish
    await prev.catch(() => {});
    try {
      const result = await fn();
      return result;
    } finally {
      // Release our lock for the next queued operation
      // Use the locally-captured release function, not entry.lockTail
      try {
        release();
      } catch {
        // ignore
      }
    }
  }

  /**
   * Replace items for a key and compute the delta, storing the new map.
   *
   * @param {string} key
   * @param {Map<string, ItemMeta>} next_map
   * @returns {{ added: string[], updated: string[], removed: string[] }}
   */
  applyNextMap(key, next_map) {
    let entry = this._entries.get(key);
    if (!entry) {
      entry = createEntry();
      this._entries.set(key, entry);
    }
    const prev = entry.itemsById;
    const delta = computeDelta(prev, next_map);
    entry.itemsById = new Map(next_map);
    return delta;
  }

  /**
   * Convenience: update items from an array of objects with id/updated_at/closed_at.
   *
   * @param {string} key
   * @param {Array<{ id: string, updated_at: number, closed_at?: number|null }>} items
   * @returns {{ added: string[], updated: string[], removed: string[] }}
   */
  applyItems(key, items) {
    const next_map = toItemsMap(items);
    return this.applyNextMap(key, next_map);
  }

  /**
   * Clear all entries from the registry. Used when switching workspaces.
   * Does not close WebSocket connections; they will re-subscribe on refresh.
   */
  clear() {
    this._entries.clear();
  }
}

/**
 * Default singleton registry used by the ws server.
 */
export const registry = new SubscriptionRegistry();
