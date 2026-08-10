/**
 * @import { SubscriptionIssueStoreOptions } from '../../types/subscription-issue-store.js'
 * @import { IssueLite } from './list-selectors.js'
 */
import { debug } from '../utils/logging.js';
import { createSubscriptionIssueStore } from './subscription-issue-store.js';
import { subKeyOf } from './subscriptions-store.js';

/**
 * Registry managing per-subscription issue stores. Stores receive full-issue
 * push envelopes (snapshot/upsert/delete) per subscription id and expose
 * read-only snapshots for rendering.
 */
export function createSubscriptionIssueStores() {
  const log = debug('issue-stores');
  /** @type {Map<string, ReturnType<typeof createSubscriptionIssueStore>>} */
  const stores_by_id = new Map();
  /** @type {Map<string, string>} */
  const key_by_id = new Map();
  /** @type {Set<(client_id: string) => void>} */
  const listeners = new Set();
  /** @type {Map<string, () => void>} */
  const store_unsubs = new Map();

  /**
   * @param {string} client_id
   */
  function emit(client_id) {
    for (const fn of Array.from(listeners)) {
      try {
        fn(client_id);
      } catch {
        // ignore
      }
    }
  }

  /**
   * @param {(client_id: string) => void} fn
   */
  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  /**
   * @param {string | string[]} client_ids
   * @param {(client_id: string) => void} fn
   */
  function subscribeFor(client_ids, fn) {
    const raw_ids = Array.isArray(client_ids) ? client_ids : [client_ids];
    const wanted_ids = new Set(
      raw_ids.map((value) => String(value || '')).filter(Boolean)
    );
    if (wanted_ids.size === 0) {
      return () => {};
    }
    return subscribe((changed_client_id) => {
      if (wanted_ids.has(changed_client_id)) {
        fn(changed_client_id);
      }
    });
  }

  /**
   * Ensure a store exists for client_id and attach a listener that fans out
   * store-level updates to global listeners.
   *
   * @param {string} client_id
   * @param {{ type: string, params?: Record<string, string|number|boolean> }} [spec]
   * @param {SubscriptionIssueStoreOptions} [options]
   */
  function register(client_id, spec, options) {
    const next_key = spec ? subKeyOf(spec) : '';
    const prev_key = key_by_id.get(client_id) || '';
    const has_store = stores_by_id.has(client_id);
    log('register %s key=%s (prev=%s)', client_id, next_key, prev_key);
    // If the subscription spec changed for an existing client id, replace the
    // underlying store to reset revision state and avoid ignoring a fresh
    // snapshot with a lower revision (different server list).
    if (has_store && prev_key && next_key && prev_key !== next_key) {
      const prev_store = stores_by_id.get(client_id);
      if (prev_store) {
        try {
          prev_store.dispose();
        } catch {
          // ignore
        }
      }
      const off_prev = store_unsubs.get(client_id);
      if (off_prev) {
        try {
          off_prev();
        } catch {
          // ignore
        }
        store_unsubs.delete(client_id);
      }
      const new_store = createSubscriptionIssueStore(client_id, options);
      stores_by_id.set(client_id, new_store);
      const off_new = new_store.subscribe(() => emit(client_id));
      store_unsubs.set(client_id, off_new);
    } else if (!has_store) {
      const store = createSubscriptionIssueStore(client_id, options);
      stores_by_id.set(client_id, store);
      // Fan out per-store events to global subscribers
      const off = store.subscribe(() => emit(client_id));
      store_unsubs.set(client_id, off);
    }
    key_by_id.set(client_id, next_key);
    return () => unregister(client_id);
  }

  /**
   * @param {string} client_id
   */
  function unregister(client_id) {
    log('unregister %s', client_id);
    key_by_id.delete(client_id);
    const store = stores_by_id.get(client_id);
    if (store) {
      store.dispose();
      stores_by_id.delete(client_id);
    }
    const off = store_unsubs.get(client_id);
    if (off) {
      try {
        off();
      } catch {
        // ignore
      }
      store_unsubs.delete(client_id);
    }
  }

  return {
    register,
    unregister,
    /**
     * @param {string} client_id
     */
    getStore(client_id) {
      return stores_by_id.get(client_id) || null;
    },
    /**
     * @param {string} client_id
     * @returns {IssueLite[]}
     */
    snapshotFor(client_id) {
      const s = stores_by_id.get(client_id);
      return s ? /** @type {IssueLite[]} */ (s.snapshot().slice()) : [];
    },
    /**
     * @param {(client_id: string) => void} fn
     */
    subscribe,
    /**
     * @param {string | string[]} client_ids
     * @param {(client_id: string) => void} fn
     */
    subscribeFor
    // No recompute helpers in vNext; stores are updated directly via push
  };
}
