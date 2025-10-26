/**
 * @import { SubscriptionIssueStoreOptions } from '../../types/subscription-issue-store.js'
 * @import { IssueLite } from './list-selectors.js'
 */
import { createSubscriptionIssueStore } from './subscription-issue-store.js';
import { subKeyOf } from './subscriptions-store.js';

/**
 * Registry managing per-subscription issue stores. Stores receive full-issue
 * push envelopes (snapshot/upsert/delete) per subscription id and expose
 * read-only snapshots for rendering.
 */

/**
 */
export function createSubscriptionIssueStores() {
  /** @type {Map<string, ReturnType<typeof createSubscriptionIssueStore>>} */
  const stores_by_id = new Map();
  /** @type {Map<string, string>} */
  const key_by_id = new Map();
  /** @type {Set<() => void>} */
  const listeners = new Set();
  /** @type {Map<string, () => void>} */
  const store_unsubs = new Map();

  function emit() {
    for (const fn of Array.from(listeners)) {
      try {
        fn();
      } catch {
        // ignore
      }
    }
  }

  /**
   * Ensure a store exists for client_id and attach a listener that fans out
   * store-level updates to global listeners.
   * @param {string} client_id
   * @param {{ type: string, params?: Record<string, string|number|boolean> }} [spec]
   * @param {SubscriptionIssueStoreOptions} [options]
   */
  function register(client_id, spec, options) {
    key_by_id.set(client_id, spec ? subKeyOf(spec) : '');
    if (!stores_by_id.has(client_id)) {
      const store = createSubscriptionIssueStore(client_id, options);
      stores_by_id.set(client_id, store);
      // Fan out per-store events to global subscribers
      const off = store.subscribe(() => emit());
      store_unsubs.set(client_id, off);
    }
    return () => unregister(client_id);
  }

  /**
   * @param {string} client_id
   */
  function unregister(client_id) {
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
     * @param {() => void} fn
     */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }
    // No recompute helpers in vNext; stores are updated directly via push
  };
}
