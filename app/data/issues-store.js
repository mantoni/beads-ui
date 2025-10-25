/**
 * @import { MessageType } from '../protocol.js'
 */
/**
 * Normalized issues store with push-only reducers.
 * Wires to ws event `issues` carrying envelopes per docs/protocol/issues-push-v2.md.
 */

/**
 * @typedef {{
 *   topic: 'issues',
 *   revision: number,
 *   snapshot?: boolean,
 *   added: any[],
 *   updated: any[],
 *   removed: string[]
 * }} IssuesEnvelope
 */

/**
 * Create an issues store.
 * @returns {{
 *   wireEvents: (onEvent: (type: MessageType, handler: (payload: unknown)=>void) => void) => void,
 *   subscribe: (fn: () => void) => () => void,
 *   getById: (id: string) => any | null,
 *   getMany: (ids: string[]) => any[],
 *   getAll: () => any[],
 *   _applyEnvelope: (env: IssuesEnvelope) => void
 * }}
 */
export function createIssuesStore() {
  /** @type {Map<string, any>} */
  const by_id = new Map();
  /** @type {number} */
  let last_applied_revision = 0;
  /** @type {Set<() => void>} */
  const subs = new Set();

  function emit() {
    for (const fn of Array.from(subs)) {
      try {
        fn();
      } catch {
        // ignore listener errors
      }
    }
  }

  /**
   * Apply an incoming envelope if newer than the last applied revision.
   * @param {IssuesEnvelope} env
   */
  function applyEnvelope(env) {
    if (!env || env.topic !== 'issues') {
      return;
    }
    const rev = Number(env.revision) || 0;
    // Snapshots always apply and reset state, even if revision is lower
    if (env.snapshot) {
      by_id.clear();
    } else if (rev <= last_applied_revision) {
      // stale non-snapshot; drop silently
      return;
    }
    const added = Array.isArray(env.added) ? env.added : [];
    const updated = Array.isArray(env.updated) ? env.updated : [];
    const removed = Array.isArray(env.removed) ? env.removed : [];

    for (const it of added) {
      if (it && typeof it.id === 'string' && it.id.length > 0) {
        by_id.set(it.id, it);
      }
    }
    for (const it of updated) {
      if (it && typeof it.id === 'string' && it.id.length > 0) {
        by_id.set(it.id, it);
      }
    }
    for (const id of removed) {
      if (typeof id === 'string' && id.length > 0) {
        by_id.delete(id);
      }
    }
    last_applied_revision = rev;
    emit();
  }

  return {
    /**
     * Wire the ws client events. Expects to be passed a function that binds an event handler.
     * @param {(type: MessageType, handler: (payload: unknown) => void) => void} onEvent
     */
    wireEvents(onEvent) {
      onEvent('issues', (payload) => {
        const env = /** @type {IssuesEnvelope} */ (payload);
        if (env && env.topic === 'issues') {
          applyEnvelope(env);
        }
      });
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    getById(id) {
      return by_id.get(id) || null;
    },
    getMany(ids) {
      const out = [];
      for (const id of ids) {
        const it = by_id.get(id);
        if (it) {
          out.push(it);
        }
      }
      return out;
    },
    getAll() {
      return Array.from(by_id.values());
    },
    _applyEnvelope: applyEnvelope
  };
}
