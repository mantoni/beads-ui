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

describe('board creator/assignee filters', () => {
  test('renders creator and assignee filter dropdowns', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));

    const now = Date.now();
    const issueStores = createTestIssueStores();
    issueStores.getStore('tab:board:ready').applyPush({
      type: 'snapshot',
      id: 'tab:board:ready',
      revision: 1,
      issues: [
        {
          id: 'R-1',
          title: 'ready 1',
          created_at: now,
          updated_at: now,
          issue_type: 'task',
          created_by: 'alice',
          assignee: 'bob'
        },
        {
          id: 'R-2',
          title: 'ready 2',
          created_at: now,
          updated_at: now,
          issue_type: 'task',
          created_by: 'bob',
          assignee: 'alice'
        }
      ]
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

    // Filter dropdowns should exist (2 dropdowns: creator and assignee)
    const dropdowns = mount.querySelectorAll('.filter-dropdown');
    expect(dropdowns.length).toBe(2);

    // Creator dropdown trigger should show "Creator: Any"
    const triggers = mount.querySelectorAll('.filter-dropdown__trigger');
    expect(triggers[0].textContent).toContain('Creator');
    expect(triggers[1].textContent).toContain('Assignee');

    // Open creator dropdown and check options
    triggers[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const creatorOptions = Array.from(
      dropdowns[0].querySelectorAll('.filter-dropdown__option')
    ).map((el) => el.textContent?.trim());
    expect(creatorOptions).toContain('Any');
    expect(creatorOptions).toContain('alice');
    expect(creatorOptions).toContain('bob');

    view.clear();
  });

  test('filters by creator when changed', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));

    const now = Date.now();
    const issueStores = createTestIssueStores();
    issueStores.getStore('tab:board:ready').applyPush({
      type: 'snapshot',
      id: 'tab:board:ready',
      revision: 1,
      issues: [
        {
          id: 'R-1',
          title: 'ready 1',
          created_at: now,
          updated_at: now,
          issue_type: 'task',
          created_by: 'alice',
          assignee: 'bob'
        },
        {
          id: 'R-2',
          title: 'ready 2',
          created_at: now + 1,
          updated_at: now + 1,
          issue_type: 'task',
          created_by: 'bob',
          assignee: 'alice'
        }
      ]
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

    // Initially both items should be visible
    let readyIds = Array.from(
      mount.querySelectorAll('#ready-col .board-card .mono')
    ).map((el) => el.textContent?.trim());
    expect(readyIds).toEqual(['R-1', 'R-2']);

    // Open creator dropdown and select 'alice'
    const dropdowns = mount.querySelectorAll('.filter-dropdown');
    const creatorTrigger = dropdowns[0].querySelector('.filter-dropdown__trigger');
    creatorTrigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // Find and click the 'alice' option
    const aliceOption = Array.from(
      dropdowns[0].querySelectorAll('.filter-dropdown__option')
    ).find((el) => el.textContent?.trim() === 'alice');
    aliceOption?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // Now only R-1 (created by alice) should be visible
    readyIds = Array.from(
      mount.querySelectorAll('#ready-col .board-card .mono')
    ).map((el) => el.textContent?.trim());
    expect(readyIds).toEqual(['R-1']);

    view.clear();
  });

  test('filters by assignee when changed', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));

    const now = Date.now();
    const issueStores = createTestIssueStores();
    issueStores.getStore('tab:board:ready').applyPush({
      type: 'snapshot',
      id: 'tab:board:ready',
      revision: 1,
      issues: [
        {
          id: 'R-1',
          title: 'ready 1',
          created_at: now,
          updated_at: now,
          issue_type: 'task',
          created_by: 'alice',
          assignee: 'bob'
        },
        {
          id: 'R-2',
          title: 'ready 2',
          created_at: now + 1,
          updated_at: now + 1,
          issue_type: 'task',
          created_by: 'bob',
          assignee: 'alice'
        }
      ]
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

    // Open assignee dropdown (second dropdown) and select 'bob'
    const dropdowns = mount.querySelectorAll('.filter-dropdown');
    const assigneeTrigger = dropdowns[1].querySelector('.filter-dropdown__trigger');
    assigneeTrigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // Find and click the 'bob' option
    const bobOption = Array.from(
      dropdowns[1].querySelectorAll('.filter-dropdown__option')
    ).find((el) => el.textContent?.trim() === 'bob');
    bobOption?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // Now only R-1 (assigned to bob) should be visible
    const readyIds = Array.from(
      mount.querySelectorAll('#ready-col .board-card .mono')
    ).map((el) => el.textContent?.trim());
    expect(readyIds).toEqual(['R-1']);

    view.clear();
  });

  test('persists filter state in store', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));

    const now = Date.now();
    const issueStores = createTestIssueStores();
    issueStores.getStore('tab:board:ready').applyPush({
      type: 'snapshot',
      id: 'tab:board:ready',
      revision: 1,
      issues: [
        {
          id: 'R-1',
          title: 'ready 1',
          created_at: now,
          updated_at: now,
          issue_type: 'task',
          created_by: 'alice',
          assignee: 'bob'
        }
      ]
    });

    /** @type {Record<string, any>} */
    let state = {};
    const store = {
      getState: () => state,
      /** @param {Record<string, any>} patch */
      setState: (patch) => {
        state = { ...state, ...patch };
      }
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

    // Open creator dropdown and select 'alice'
    const dropdowns = mount.querySelectorAll('.filter-dropdown');
    dropdowns[0].querySelector('.filter-dropdown__trigger')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    const aliceOption = Array.from(
      dropdowns[0].querySelectorAll('.filter-dropdown__option')
    ).find((el) => el.textContent?.trim() === 'alice');
    aliceOption?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(state.board?.creator_filter).toBe('alice');

    // Open assignee dropdown and select 'bob'
    dropdowns[1].querySelector('.filter-dropdown__trigger')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    const bobOption = Array.from(
      dropdowns[1].querySelectorAll('.filter-dropdown__option')
    ).find((el) => el.textContent?.trim() === 'bob');
    bobOption?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(state.board?.assignee_filter).toBe('bob');

    view.clear();
  });

  test('loads filter state from store on init', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));

    const now = Date.now();
    const issueStores = createTestIssueStores();
    issueStores.getStore('tab:board:ready').applyPush({
      type: 'snapshot',
      id: 'tab:board:ready',
      revision: 1,
      issues: [
        {
          id: 'R-1',
          title: 'ready 1',
          created_at: now,
          updated_at: now,
          issue_type: 'task',
          created_by: 'alice',
          assignee: 'bob'
        },
        {
          id: 'R-2',
          title: 'ready 2',
          created_at: now + 1,
          updated_at: now + 1,
          issue_type: 'task',
          created_by: 'bob',
          assignee: 'alice'
        }
      ]
    });

    const store = {
      getState: () => ({
        board: {
          creator_filter: 'alice'
        }
      }),
      /** @param {Record<string, any>} _patch */
      setState: (_patch) => {}
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

    // Only R-1 (created by alice) should be visible because filter was loaded from store
    const readyIds = Array.from(
      mount.querySelectorAll('#ready-col .board-card .mono')
    ).map((el) => el.textContent?.trim());
    expect(readyIds).toEqual(['R-1']);

    view.clear();
  });
});
