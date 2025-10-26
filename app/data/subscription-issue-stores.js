/**
 * @import { SubscriptionIssueStoreOptions } from '../../types/subscription-issue-store.js'
 * @import { IssueLite } from './list-selectors.js'
 */
import { createSubscriptionIssueStore } from './subscription-issue-store.js';
import { subKeyOf } from './subscriptions-store.js';

/**
 * Registry managing per-subscription issue stores and recomputing snapshots
 * from membership (subscriptions store) and the central issues entity store.
 *
 * This enables list views to render from local stores while wiring remains
 * compatible with the current push pipeline.
 */

/**
 * @param {{ selectors: { getIds: (client_id: string) => string[] } }} subscriptions
 * @param {{ subscribe: (fn: () => void) => () => void, getMany: (ids: string[]) => any[] }} issuesStore
 */
export function createSubscriptionIssueStores(subscriptions, issuesStore) {
  /** @type {Map<string, ReturnType<typeof createSubscriptionIssueStore>>} */
  const stores_by_id = new Map();
  /** @type {Map<string, string>} */
  const key_by_id = new Map();
  /** @type {Map<string, Set<string>>} */
  const ids_by_key = new Map();
  /** @type {Map<string, number>} */
  const revision_by_id = new Map();
  /** @type {Set<() => void>} */
  const listeners = new Set();
  /** @type {null | (() => void)} */
  let unsubscribe_issues = null;

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
   * Ensure a store exists for client_id.
   * @param {string} client_id
   * @param {{ type: string, params?: Record<string, string|number|boolean> }} spec
   * @param {SubscriptionIssueStoreOptions} [options]
   */
  /**
   * @param {string} client_id
   * @param {{ type: string, params?: Record<string, string|number|boolean> }} spec
   * @param {SubscriptionIssueStoreOptions} [options]
   */
  function register(client_id, spec, options) {
    const key = subKeyOf(spec);
    // Update key mappings when client re-registers with a different spec
    const prev_key = key_by_id.get(client_id);
    if (prev_key && prev_key !== key) {
      const prev_set = ids_by_key.get(prev_key);
      prev_set?.delete(client_id);
      if (prev_set && prev_set.size === 0) {
        ids_by_key.delete(prev_key);
      }
    }
    key_by_id.set(client_id, key);
    if (!ids_by_key.has(key)) {
      ids_by_key.set(key, new Set());
    }
    ids_by_key.get(key)?.add(client_id);
    if (!stores_by_id.has(client_id)) {
      stores_by_id.set(
        client_id,
        createSubscriptionIssueStore(client_id, options)
      );
    }
    // Start issues subscription lazily on first register
    if (!unsubscribe_issues) {
      unsubscribe_issues = issuesStore.subscribe(() => {
        // Recompute snapshots for all registered stores on issues updates
        recomputeAll();
      });
    }
    // Initial compute
    recompute(client_id);
    return () => unregister(client_id);
  }

  /**
   * @param {string} client_id
   */
  function unregister(client_id) {
    const key = key_by_id.get(client_id);
    if (key) {
      const set = ids_by_key.get(key);
      set?.delete(client_id);
      if (set && set.size === 0) {
        ids_by_key.delete(key);
      }
    }
    key_by_id.delete(client_id);
    const store = stores_by_id.get(client_id);
    if (store) {
      store.dispose();
      stores_by_id.delete(client_id);
    }
    if (stores_by_id.size === 0 && unsubscribe_issues) {
      // No stores left; stop listening to issues store
      unsubscribe_issues();
      unsubscribe_issues = null;
    }
  }

  /**
   * @param {string} client_id
   */
  function nextRevision(client_id) {
    const prev = revision_by_id.get(client_id) || 0;
    const next = prev + 1;
    revision_by_id.set(client_id, next);
    return next;
  }

  /**
   * @param {string} client_id
   */
  function recompute(client_id) {
    const store = stores_by_id.get(client_id);
    if (!store) {
      return;
    }
    const ids = subscriptions.selectors.getIds(client_id) || [];
    const issues = issuesStore.getMany(ids) || [];
    store.applyPush({
      type: 'snapshot',
      id: client_id,
      revision: nextRevision(client_id),
      issues
    });
    emit();
  }

  function recomputeAll() {
    for (const client_id of Array.from(stores_by_id.keys())) {
      recompute(client_id);
    }
  }

  /**
   * Recompute stores for all client ids bound to a given subscription key.
   * @param {string} key
   */
  /**
   * @param {string} key
   */
  function recomputeByKey(key) {
    const set = ids_by_key.get(key);
    if (!set) {
      return;
    }
    for (const client_id of Array.from(set)) {
      recompute(client_id);
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
    },
    recomputeByKey,
    recomputeAll
  };
}
