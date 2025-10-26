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

  test('selectIssuesFor returns priority asc then created asc', async () => {
    const { issueStores, selectors } = setup();
    const store = issueStores.getStore('tab:issues');
    // Apply snapshot with items of varying priority and created_at
    store.applyPush({
      type: 'snapshot',
      id: 'tab:issues',
      revision: 1,
      issues: [
        {
          id: 'A',
          priority: 2,
          created_at: 10_000,
          updated_at: 10_000,
          closed_at: null
        },
        {
          id: 'B',
          priority: 1,
          created_at: 9_000,
          updated_at: 9_000,
          closed_at: null
        },
        {
          id: 'C',
          priority: 1,
          created_at: 11_000,
          updated_at: 11_000,
          closed_at: null
        }
      ]
    });

    const out = selectors.selectIssuesFor('tab:issues').map((x) => x.id);
    // priority asc: B,C first (1), then A (2); within same priority sort by created asc
    expect(out).toEqual(['B', 'C', 'A']);
  });

  test('selectBoardColumn sorts ready/blocked/in_progress by priority→created, closed by closed_at desc', async () => {
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
          created_at: 10_000,
          updated_at: 10_000,
          closed_at: null
        },
        {
          id: 'R2',
          priority: 1,
          created_at: 9_000,
          updated_at: 9_000,
          closed_at: null
        },
        {
          id: 'R3',
          priority: 1,
          created_at: 11_000,
          updated_at: 11_000,
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
        { id: 'P1', created_at: 8_000, updated_at: 8_000, closed_at: null },
        { id: 'P2', created_at: 9_000, updated_at: 9_000, closed_at: null },
        { id: 'P3', created_at: 7_000, updated_at: 7_000, closed_at: null }
      ]
    });
    // Closed
    issueStores.getStore('tab:board:closed').applyPush({
      type: 'snapshot',
      id: 'tab:board:closed',
      revision: 1,
      issues: [
        { id: 'C1', created_at: 1_000, closed_at: 5_000, updated_at: 20_000 },
        { id: 'C2', created_at: 1_100, closed_at: 6_000, updated_at: 20_000 },
        { id: 'C3', created_at: 900, closed_at: 4_000, updated_at: 7_300 }
      ]
    });

    const ready = selectors
      .selectBoardColumn('tab:board:ready', 'ready')
      .map((x) => x.id);
    expect(ready).toEqual(['R2', 'R3', 'R1']);

    const inprog = selectors
      .selectBoardColumn('tab:board:in-progress', 'in_progress')
      .map((x) => x.id);
    expect(inprog).toEqual(['P3', 'P1', 'P2']);

    const closed = selectors
      .selectBoardColumn('tab:board:closed', 'closed')
      .map((x) => x.id);
    // closed_at desc: C2, C1, C3
    expect(closed).toEqual(['C2', 'C1', 'C3']);
  });

  test('selectEpicChildren uses detail:{id} dependents and list sorting (priority→created asc)', async () => {
    const { issueStores, selectors } = setup();
    issueStores.getStore('detail:42').applyPush({
      type: 'snapshot',
      id: 'detail:42',
      revision: 1,
      issues: [
        {
          id: '42',
          issue_type: 'epic',
          dependents: [
            {
              id: 'E1',
              priority: 1,
              created_at: 10_000,
              updated_at: 10_000,
              closed_at: null
            },
            {
              id: 'E2',
              priority: 1,
              created_at: 9_000,
              updated_at: 9_000,
              closed_at: null
            }
          ]
        }
      ]
    });
    const out = selectors.selectEpicChildren('42').map((x) => x.id);
    expect(out).toEqual(['E2', 'E1']);
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
