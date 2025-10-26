/**
 * @import { SubscriptionIssueStore, SubscriptionIssueStoreOptions } from '../../types/subscription-issue-store.js'
 */
import { cmpPriorityThenCreated } from './sort.js';

/**
 * Per-subscription issue store. Holds full Issue objects and exposes a
 * deterministic, read-only snapshot for rendering. Applies snapshot/upsert/
 * delete messages in revision order and preserves object identity per id.
 */

// Sort comparator is centralized in app/data/sort.js

/**
 * Create a SubscriptionIssueStore for a given subscription id.
 * @param {string} id
 * @param {SubscriptionIssueStoreOptions} [options]
 * @returns {SubscriptionIssueStore}
 */
export function createSubscriptionIssueStore(id, options = {}) {
  /** @type {Map<string, any>} */
  const items_by_id = new Map();
  /** @type {any[]} */
  let ordered = [];
  /** @type {number} */
  let last_revision = 0;
  /** @type {Set<() => void>} */
  const listeners = new Set();
  /** @type {boolean} */
  let is_disposed = false;
  /** @type {(a:any,b:any)=>number} */
  const sort = options.sort || cmpPriorityThenCreated;

  function emit() {
    for (const fn of Array.from(listeners)) {
      try {
        fn();
      } catch {
        // ignore listener errors
      }
    }
  }

  function rebuildOrdered() {
    ordered = Array.from(items_by_id.values()).sort(sort);
  }

  /**
   * Apply snapshot/upsert/delete in revision order. Snapshots reset state.
   * - Ignore messages with revision <= last_revision (except snapshot which resets first).
   * - Preserve object identity when updating an existing item by mutating
   *   fields in place rather than replacing the object reference.
   * @param {{ type: 'snapshot'|'upsert'|'delete', id: string, revision: number, issues?: any[], issue?: any, issue_id?: string }} msg
   */
  function applyPush(msg) {
    if (is_disposed) {
      return;
    }
    if (!msg || msg.id !== id) {
      return;
    }
    const rev = Number(msg.revision) || 0;
    // Ignore stale messages for all types, including snapshots
    if (rev <= last_revision && msg.type !== 'snapshot') {
      return; // stale or duplicate non-snapshot
    }
    if (msg.type === 'snapshot') {
      if (rev <= last_revision) {
        return; // ignore stale snapshot
      }
      items_by_id.clear();
      const items = Array.isArray(msg.issues) ? msg.issues : [];
      for (const it of items) {
        if (it && typeof it.id === 'string' && it.id.length > 0) {
          items_by_id.set(it.id, it);
        }
      }
      rebuildOrdered();
      last_revision = rev;
      emit();
      return;
    }
    if (msg.type === 'upsert') {
      const it = msg.issue;
      if (it && typeof it.id === 'string' && it.id.length > 0) {
        const existing = items_by_id.get(it.id);
        if (!existing) {
          items_by_id.set(it.id, it);
        } else {
          // Guard with updated_at; prefer newer
          const prev_ts = Number.isFinite(existing.updated_at)
            ? /** @type {number} */ (existing.updated_at)
            : 0;
          const next_ts = Number.isFinite(it.updated_at)
            ? /** @type {number} */ (it.updated_at)
            : 0;
          if (prev_ts <= next_ts) {
            // Mutate existing object to preserve reference
            for (const k of Object.keys(existing)) {
              if (!(k in it)) {
                // remove keys that disappeared to avoid stale fields
                delete existing[k];
              }
            }
            for (const [k, v] of Object.entries(it)) {
              // @ts-ignore - dynamic assignment
              existing[k] = v;
            }
          } else {
            // stale by timestamp; ignore
          }
        }
        rebuildOrdered();
      }
      last_revision = rev;
      emit();
    } else if (msg.type === 'delete') {
      const rid = String(msg.issue_id || '');
      if (rid) {
        items_by_id.delete(rid);
        rebuildOrdered();
      }
      last_revision = rev;
      emit();
    }
  }

  return {
    id,
    /**
     * @param {() => void} fn
     */
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    applyPush,
    snapshot() {
      // Return as read-only view; callers must not mutate
      return ordered;
    },
    size() {
      return items_by_id.size;
    },
    /**
     * @param {string} xid
     */
    getById(xid) {
      return items_by_id.get(xid);
    },
    dispose() {
      is_disposed = true;
      items_by_id.clear();
      ordered = [];
      listeners.clear();
      last_revision = 0;
    }
  };
}
