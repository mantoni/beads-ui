import { describe, expect, test, vi } from 'vitest';
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

/** Wait for the store's configured notification boundary. */
async function flushStoreNotifications() {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    await new Promise((resolve) =>
      globalThis.requestAnimationFrame(() => resolve(undefined))
    );
    return;
  }
  await Promise.resolve();
  await Promise.resolve();
}

describe('list-selectors', () => {
  test('returns preordered store snapshots without another copy or sort', () => {
    const issues = [
      { id: 'A', priority: 1, created_at: 1 },
      { id: 'B', priority: 2, created_at: 2 }
    ];
    const selectors = createListSelectors({
      snapshotFor() {
        return issues;
      }
    });

    expect(selectors.selectIssuesFor('tab:issues')).toBe(issues);
    expect(selectors.selectBoardColumn('tab:board:ready', 'ready')).toBe(
      issues
    );
  });

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

  test('selectBoardColumnUnion merges sources, dedupes by id and sorts', async () => {
    const { issueStores, selectors } = setup();
    issueStores.getStore('tab:board:blocked').applyPush({
      type: 'snapshot',
      id: 'tab:board:blocked',
      revision: 1,
      issues: [
        {
          id: 'D1',
          priority: 2,
          created_at: 10_000,
          updated_at: 10_000,
          closed_at: null
        },
        {
          id: 'BOTH',
          priority: 0,
          created_at: 12_000,
          updated_at: 12_000,
          closed_at: null
        }
      ]
    });
    issueStores.getStore('tab:board:status-blocked').applyPush({
      type: 'snapshot',
      id: 'tab:board:status-blocked',
      revision: 1,
      issues: [
        {
          id: 'BOTH',
          priority: 0,
          created_at: 12_000,
          updated_at: 12_000,
          closed_at: null
        },
        {
          id: 'S1',
          priority: 1,
          created_at: 9_000,
          updated_at: 9_000,
          closed_at: null
        }
      ]
    });

    const ids = selectors
      .selectBoardColumnUnion(
        ['tab:board:blocked', 'tab:board:status-blocked'],
        'blocked'
      )
      .map((x) => x.id);
    // Deduped (BOTH appears once) and sorted priority asc → created asc
    expect(ids).toEqual(['BOTH', 'S1', 'D1']);
  });

  test('selectBoardColumnUnion returns empty for unknown client ids', async () => {
    const { selectors } = setup();
    expect(
      selectors.selectBoardColumnUnion(
        ['tab:board:blocked', 'tab:board:status-blocked'],
        'blocked'
      )
    ).toEqual([]);
  });

  test('subscribe triggers once per synchronous issues burst', async () => {
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
    expect(calls).toBe(0);

    await flushStoreNotifications();

    expect(calls).toBe(1);
    off();
  });

  test('scopes subscriptions when the registry supports it', () => {
    const unsubscribe = vi.fn();
    const subscribeFor = vi.fn(() => unsubscribe);
    const selectors = createListSelectors({ subscribeFor });
    const listener = vi.fn();

    const result = selectors.subscribe(listener, ['list:a', 'list:b']);

    expect(subscribeFor).toHaveBeenCalledWith(['list:a', 'list:b'], listener);
    expect(result).toBe(unsubscribe);
  });
});
