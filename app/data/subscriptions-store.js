/**
 * @import { MessageType } from '../protocol.js'
 */
/**
 * Client-side list subscription store.
 *
 * Maintains per-subscription state keyed by client-provided `id`.
 * Applies server `list-delta` events per subscription key and exposes simple
 * selectors for rendering.
 */

/**
 * @typedef {{ type: string, params?: Record<string, string|number|boolean> }} SubscriptionSpec
 */

/**
 * Generate a stable subscription key string from a spec.
 * Mirrors server `keyOf` implementation (sorted params, URLSearchParams).
 * @param {SubscriptionSpec} spec
 * @returns {string}
 */
export function subKeyOf(spec) {
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
 * Create a list subscription store.
 *
 * Wiring:
 *  - Call `wireEvents(onEvent)` to listen for `list-delta` events from ws.
 *  - Use `subscribeList` to register a subscription and send the request.
 *
 * Selectors are synchronous and return derived state by client id.
 * @param {(type: MessageType, payload?: unknown) => Promise<unknown>} send - ws send.
 */
export function createSubscriptionStore(send) {
  /** @type {Map<string, { key: string, itemsById: Map<string, true> }>} */
  const subs_by_id = new Map();
  /** @type {Map<string, Set<string>>} */
  const ids_by_key = new Map();

  /**
   * Apply a delta to all client ids mapped to a given key.
   * @param {string} key
   * @param {{ added: string[], updated: string[], removed: string[] }} delta
   */
  function applyDelta(key, delta) {
    const id_set = ids_by_key.get(key);
    if (!id_set || id_set.size === 0) {
      return;
    }
    /** @type {string[]} */
    const added = Array.isArray(delta.added) ? delta.added : [];
    /** @type {string[]} */
    const updated = Array.isArray(delta.updated) ? delta.updated : [];
    /** @type {string[]} */
    const removed = Array.isArray(delta.removed) ? delta.removed : [];

    for (const client_id of Array.from(id_set)) {
      const entry = subs_by_id.get(client_id);
      if (!entry) {
        continue;
      }
      const items = entry.itemsById;
      for (const id of added) {
        if (typeof id === 'string' && id.length > 0) {
          items.set(id, true);
        }
      }
      for (const id of updated) {
        if (typeof id === 'string' && id.length > 0) {
          items.set(id, true);
        }
      }
      for (const id of removed) {
        if (typeof id === 'string' && id.length > 0) {
          items.delete(id);
        }
      }
    }
  }

  /**
   * Wire ws event subscription to handle `list-delta`.
   * @param {(type: MessageType, handler: (payload: unknown) => void) => void} onEvent
   */
  function wireEvents(onEvent) {
    onEvent('list-delta', (payload) => {
      /** @type {any} */
      const p = payload;
      const key = p && typeof p.key === 'string' ? p.key : '';
      const delta =
        p && p.delta && typeof p.delta === 'object' ? p.delta : null;
      if (!key || !delta) {
        return;
      }
      applyDelta(key, /** @type {any} */ (delta));
    });
  }

  /**
   * Subscribe to a list spec with a client-provided id.
   * Returns an unsubscribe function.
   * Creates an empty items store immediately; server will publish deltas.
   * @param {string} client_id
   * @param {SubscriptionSpec} spec
   * @returns {Promise<() => Promise<void>>}
   */
  async function subscribeList(client_id, spec) {
    const key = subKeyOf(spec);
    // Initialize local entry immediately to capture early deltas
    if (!subs_by_id.has(client_id)) {
      subs_by_id.set(client_id, { key, itemsById: new Map() });
    } else {
      // Update key mapping if client id is reused for a different spec
      const prev = subs_by_id.get(client_id);
      if (prev && prev.key !== key) {
        const prev_ids = ids_by_key.get(prev.key);
        if (prev_ids) {
          prev_ids.delete(client_id);
          if (prev_ids.size === 0) {
            ids_by_key.delete(prev.key);
          }
        }
        subs_by_id.set(client_id, { key, itemsById: new Map() });
      }
    }
    if (!ids_by_key.has(key)) {
      ids_by_key.set(key, new Set());
    }
    const set = ids_by_key.get(key);
    if (set) {
      set.add(client_id);
    }
    try {
      await send('subscribe-list', {
        id: client_id,
        type: spec.type,
        params: spec.params
      });
    } catch {
      // keep local mapping to allow retries; caller may unsubscribe or retry
    }

    return async () => {
      try {
        await send('unsubscribe-list', { id: client_id });
      } catch {
        // ignore transport errors on unsubscribe
      }
      // Cleanup local mappings
      const entry = subs_by_id.get(client_id) || null;
      if (entry) {
        const s = ids_by_key.get(entry.key);
        if (s) {
          s.delete(client_id);
          if (s.size === 0) {
            ids_by_key.delete(entry.key);
          }
        }
      }
      subs_by_id.delete(client_id);
    };
  }

  /**
   * Selectors by client id.
   */
  const selectors = {
    /**
     * Get an array of item ids for a subscription.
     * @param {string} client_id
     * @returns {string[]}
     */
    getIds(client_id) {
      const entry = subs_by_id.get(client_id);
      if (!entry) {
        return [];
      }
      return Array.from(entry.itemsById.keys());
    },
    /**
     * Check if an id exists in a subscription.
     * @param {string} client_id
     * @param {string} id
     * @returns {boolean}
     */
    has(client_id, id) {
      const entry = subs_by_id.get(client_id);
      if (!entry) {
        return false;
      }
      return entry.itemsById.has(id);
    },
    /**
     * Count items for a subscription.
     * @param {string} client_id
     * @returns {number}
     */
    count(client_id) {
      const entry = subs_by_id.get(client_id);
      return entry ? entry.itemsById.size : 0;
    },
    /**
     * Return a shallow object copy `{ [id]: true }` for rendering helpers.
     * @param {string} client_id
     * @returns {Record<string, true>}
     */
    getItemsById(client_id) {
      const entry = subs_by_id.get(client_id);
      /** @type {Record<string, true>} */
      const out = {};
      if (!entry) {
        return out;
      }
      for (const id of entry.itemsById.keys()) {
        out[id] = true;
      }
      return out;
    }
  };

  return {
    wireEvents,
    subscribeList,
    // test/diagnostics helpers
    _applyDelta: applyDelta,
    _subKeyOf: subKeyOf,
    selectors
  };
}
