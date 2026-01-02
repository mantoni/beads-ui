import { describe, expect, test } from 'vitest';
import { createSubscriptionIssueStore } from '../data/subscription-issue-store.js';
import { createBoardView } from './board.js';

function createTestIssueStores() {
  /** @type {Map<string, any>} */
  const stores = new Map();
  /** @type {Set<() => void>} */
  const listeners = new Set();
  /**
   * @param {string} id
   * @returns {any}
   */
  function getStore(id) {
    let s = stores.get(id);
    if (!s) {
      s = createSubscriptionIssueStore(id);
      stores.set(id, s);
      s.subscribe(() => {
        for (const fn of Array.from(listeners)) {
          try {
            fn();
          } catch {
            /* ignore */
          }
        }
      });
    }
    return s;
  }
  return {
    getStore,
    /** @param {string} id */
    snapshotFor(id) {
      return getStore(id).snapshot().slice();
    },
    /** @param {() => void} fn */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }
  };
}

describe('views/board epic filter', () => {
  test('shows epic filter dropdown when epics are available', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));

    const now = Date.now();
    const issueStores = createTestIssueStores();

    // Set up epics with dependents
    issueStores.getStore('tab:epics').applyPush({
      type: 'snapshot',
      id: 'tab:epics',
      revision: 1,
      issues: [
        {
          id: 'EPIC-1',
          title: 'First Epic',
          issue_type: 'epic',
          dependents: [{ id: 'T-1' }, { id: 'T-2' }]
        },
        {
          id: 'EPIC-2',
          title: 'Second Epic',
          issue_type: 'epic',
          dependents: [{ id: 'T-3' }]
        }
      ]
    });

    // Set up board columns
    issueStores.getStore('tab:board:ready').applyPush({
      type: 'snapshot',
      id: 'tab:board:ready',
      revision: 1,
      issues: [
        { id: 'T-1', title: 'Task 1', created_at: now, updated_at: now },
        { id: 'T-2', title: 'Task 2', created_at: now, updated_at: now },
        { id: 'T-3', title: 'Task 3', created_at: now, updated_at: now },
        {
          id: 'T-4',
          title: 'Task 4 (no epic)',
          created_at: now,
          updated_at: now
        }
      ]
    });
    issueStores.getStore('tab:board:blocked').applyPush({
      type: 'snapshot',
      id: 'tab:board:blocked',
      revision: 1,
      issues: []
    });
    issueStores.getStore('tab:board:in-progress').applyPush({
      type: 'snapshot',
      id: 'tab:board:in-progress',
      revision: 1,
      issues: []
    });
    issueStores.getStore('tab:board:closed').applyPush({
      type: 'snapshot',
      id: 'tab:board:closed',
      revision: 1,
      issues: []
    });

    const view = createBoardView(
      mount,
      null,
      () => {},
      undefined,
      undefined,
      issueStores
    );

    await view.load();

    // Epic filter dropdown should be visible in board header
    const dropdown = mount.querySelector('.filter-dropdown');
    expect(dropdown).toBeTruthy();

    // Should show "Epic: All" by default
    const trigger = mount.querySelector('.filter-dropdown__trigger');
    expect(trigger?.textContent).toContain('Epic: All');

    // Should list both epics in the menu
    const options = mount.querySelectorAll('.filter-dropdown__option');
    expect(options.length).toBe(3); // "All" + 2 epics

    // All 4 tasks should be visible (no filter applied)
    const ready_ids = Array.from(
      mount.querySelectorAll('#ready-col .board-card .mono')
    ).map((el) => el.textContent?.trim());
    expect(ready_ids).toEqual(['T-1', 'T-2', 'T-3', 'T-4']);
  });

  test('filters board by selected epic', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));

    const now = Date.now();
    const issueStores = createTestIssueStores();

    // Set up epics with dependents
    issueStores.getStore('tab:epics').applyPush({
      type: 'snapshot',
      id: 'tab:epics',
      revision: 1,
      issues: [
        {
          id: 'EPIC-1',
          title: 'First Epic',
          issue_type: 'epic',
          dependents: [{ id: 'T-1' }, { id: 'T-2' }]
        },
        {
          id: 'EPIC-2',
          title: 'Second Epic',
          issue_type: 'epic',
          dependents: [{ id: 'T-3' }]
        }
      ]
    });

    // Set up board columns
    issueStores.getStore('tab:board:ready').applyPush({
      type: 'snapshot',
      id: 'tab:board:ready',
      revision: 1,
      issues: [
        { id: 'T-1', title: 'Task 1', created_at: now, updated_at: now },
        { id: 'T-2', title: 'Task 2', created_at: now, updated_at: now },
        { id: 'T-3', title: 'Task 3', created_at: now, updated_at: now }
      ]
    });
    issueStores.getStore('tab:board:blocked').applyPush({
      type: 'snapshot',
      id: 'tab:board:blocked',
      revision: 1,
      issues: []
    });
    issueStores.getStore('tab:board:in-progress').applyPush({
      type: 'snapshot',
      id: 'tab:board:in-progress',
      revision: 1,
      issues: []
    });
    issueStores.getStore('tab:board:closed').applyPush({
      type: 'snapshot',
      id: 'tab:board:closed',
      revision: 1,
      issues: []
    });

    // Create store with epic filter pre-set
    const store = {
      getState: () => ({
        board: { closed_filter: 'today', epic_filter: 'EPIC-1' }
      }),
      setState: () => {},
      subscribe: () => () => {}
    };

    const view = createBoardView(
      mount,
      null,
      () => {},
      store,
      undefined,
      issueStores
    );

    await view.load();

    // Only tasks from EPIC-1 should be visible (T-1, T-2)
    const ready_ids = Array.from(
      mount.querySelectorAll('#ready-col .board-card .mono')
    ).map((el) => el.textContent?.trim());
    expect(ready_ids).toEqual(['T-1', 'T-2']);

    // Count badge should reflect filtered count
    const ready_count = mount
      .querySelector('#ready-col .board-column__count')
      ?.textContent?.trim();
    expect(ready_count).toBe('2');
  });

  test('hides epic filter dropdown when no epics exist', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));

    const now = Date.now();
    const issueStores = createTestIssueStores();

    // No epics
    issueStores.getStore('tab:epics').applyPush({
      type: 'snapshot',
      id: 'tab:epics',
      revision: 1,
      issues: []
    });

    issueStores.getStore('tab:board:ready').applyPush({
      type: 'snapshot',
      id: 'tab:board:ready',
      revision: 1,
      issues: [{ id: 'T-1', title: 'Task 1', created_at: now, updated_at: now }]
    });
    issueStores.getStore('tab:board:blocked').applyPush({
      type: 'snapshot',
      id: 'tab:board:blocked',
      revision: 1,
      issues: []
    });
    issueStores.getStore('tab:board:in-progress').applyPush({
      type: 'snapshot',
      id: 'tab:board:in-progress',
      revision: 1,
      issues: []
    });
    issueStores.getStore('tab:board:closed').applyPush({
      type: 'snapshot',
      id: 'tab:board:closed',
      revision: 1,
      issues: []
    });

    const view = createBoardView(
      mount,
      null,
      () => {},
      undefined,
      undefined,
      issueStores
    );

    await view.load();

    // No dropdown when no epics
    const dropdown = mount.querySelector('.filter-dropdown');
    expect(dropdown).toBeFalsy();
  });
});
