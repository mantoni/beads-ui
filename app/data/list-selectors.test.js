import { describe, expect, test } from 'vitest';
import { createListSelectors } from './list-selectors.js';
import { createSubscriptionIssueStore } from './subscription-issue-store.js';

/**
 * Minimal per-subscription stores facade for tests.
 */
function createTestIssueStores() {
  /** @type {Map<string, ReturnType<typeof createSubscriptionIssueStore>>} */
  const stores = new Map();
  /** @type {Set<() => void>} */
  const listeners = new Set();

  /**
   * @param {string} id
   */
  function getStore(id) {
    let s = stores.get(id);
    if (!s) {
      s = createSubscriptionIssueStore(id);
      stores.set(id, s);
      // Fan out store-level events to global listeners
      s.subscribe(() => {
        for (const fn of Array.from(listeners)) {
          try {
            fn();
          } catch {
            // ignore
          }
        }
      });
    }
    return s;
  }

  return {
    getStore,
    /**
     * @param {string} id
     */
    snapshotFor(id) {
      return getStore(id).snapshot();
    },
    /**
     * @param {() => void} fn
     */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }
  };
}

/**
 * Helper to build stores and selectors bound together.
 */
function setup() {
  const issueStores = createTestIssueStores();
  const selectors = createListSelectors(/** @type {any} */ (issueStores));
  return { issueStores, selectors };
}

describe('list-selectors', () => {
  test('returns empty arrays for empty stores', async () => {
    const { selectors } = setup();
    expect(selectors.selectIssuesFor('tab:issues')).toEqual([]);
    expect(selectors.selectBoardColumn('tab:board:ready', 'ready')).toEqual([]);
  });

  test('selectIssuesFor returns priority asc then updated desc', async () => {
    const { issueStores, selectors } = setup();
    const store = issueStores.getStore('tab:issues');
    // Apply snapshot with items of varying priority and updated_at
    store.applyPush({
      type: 'snapshot',
      id: 'tab:issues',
      revision: 1,
      issues: [
        {
          id: 'A',
          priority: 2,
          updated_at: '2025-10-25T10:00:00Z',
          closed_at: null
        },
        {
          id: 'B',
          priority: 1,
          updated_at: '2025-10-25T09:00:00Z',
          closed_at: null
        },
        {
          id: 'C',
          priority: 1,
          updated_at: '2025-10-25T11:00:00Z',
          closed_at: null
        }
      ]
    });

    const out = selectors.selectIssuesFor('tab:issues').map((x) => x.id);
    // priority asc: B,C first (1), then A (2); within same priority sort by updated desc
    expect(out).toEqual(['C', 'B', 'A']);
  });

  test('selectBoardColumn sorts ready like list, in_progress by updated desc, closed by closed_at desc', async () => {
    const { issueStores, selectors } = setup();
    // Ready
    issueStores.getStore('tab:board:ready').applyPush({
      type: 'snapshot',
      id: 'tab:board:ready',
      revision: 1,
      issues: [
        {
          id: 'R1',
          priority: 2,
          updated_at: '2025-10-25T10:00:00Z',
          closed_at: null
        },
        {
          id: 'R2',
          priority: 1,
          updated_at: '2025-10-25T09:00:00Z',
          closed_at: null
        },
        {
          id: 'R3',
          priority: 1,
          updated_at: '2025-10-25T11:00:00Z',
          closed_at: null
        }
      ]
    });
    // In progress
    issueStores.getStore('tab:board:in-progress').applyPush({
      type: 'snapshot',
      id: 'tab:board:in-progress',
      revision: 1,
      issues: [
        { id: 'P1', updated_at: '2025-10-26T08:00:00Z', closed_at: null },
        { id: 'P2', updated_at: '2025-10-26T09:00:00Z', closed_at: null },
        { id: 'P3', updated_at: '2025-10-26T07:00:00Z', closed_at: null }
      ]
    });
    // Closed
    issueStores.getStore('tab:board:closed').applyPush({
      type: 'snapshot',
      id: 'tab:board:closed',
      revision: 1,
      issues: [
        {
          id: 'C1',
          closed_at: '2025-10-26T05:00:00Z',
          updated_at: '2025-10-25T20:00:00Z'
        },
        {
          id: 'C2',
          closed_at: '2025-10-26T06:00:00Z',
          updated_at: '2025-10-25T20:00:00Z'
        },
        {
          id: 'C3',
          closed_at: '2025-10-26T04:00:00Z',
          updated_at: '2025-10-26T07:30:00Z'
        }
      ]
    });

    const ready = selectors
      .selectBoardColumn('tab:board:ready', 'ready')
      .map((x) => x.id);
    expect(ready).toEqual(['R3', 'R2', 'R1']);

    const inprog = selectors
      .selectBoardColumn('tab:board:in-progress', 'in_progress')
      .map((x) => x.id);
    expect(inprog).toEqual(['P2', 'P1', 'P3']);

    const closed = selectors
      .selectBoardColumn('tab:board:closed', 'closed')
      .map((x) => x.id);
    // closed_at desc: C2, C1, C3
    expect(closed).toEqual(['C2', 'C1', 'C3']);
  });

  test('selectEpicChildren uses epic:{id} client id and list sorting', async () => {
    const { issueStores, selectors } = setup();
    issueStores.getStore('epic:42').applyPush({
      type: 'snapshot',
      id: 'epic:42',
      revision: 1,
      issues: [
        {
          id: 'E1',
          priority: 1,
          updated_at: '2025-10-26T10:00:00Z',
          closed_at: null
        },
        {
          id: 'E2',
          priority: 1,
          updated_at: '2025-10-26T09:00:00Z',
          closed_at: null
        }
      ]
    });
    const out = selectors.selectEpicChildren('42').map((x) => x.id);
    expect(out).toEqual(['E1', 'E2']);
  });

  test('subscribe triggers once per issues envelope', async () => {
    const { issueStores, selectors } = setup();
    let calls = 0;
    const off = selectors.subscribe(() => {
      calls += 1;
    });
    const st = issueStores.getStore('tab:issues');
    st.applyPush({
      type: 'snapshot',
      id: 'tab:issues',
      revision: 1,
      issues: []
    });
    expect(calls).toBe(1);
    off();
  });
});
