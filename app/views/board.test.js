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

describe('views/board', () => {
  test('renders four columns (Blocked, Ready, In Progress, Closed) with sorted cards and navigates on click', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));

    const now = Date.now();
    const issues = [
      // Blocked
      {
        id: 'B-2',
        title: 'b2',
        priority: 1,
        created_at: new Date('2025-10-22T07:00:00.000Z').getTime(),
        updated_at: new Date('2025-10-22T07:00:00.000Z').getTime(),
        issue_type: 'task'
      },
      {
        id: 'B-1',
        title: 'b1',
        priority: 0,
        created_at: new Date('2025-10-21T07:00:00.000Z').getTime(),
        updated_at: new Date('2025-10-21T07:00:00.000Z').getTime(),
        issue_type: 'bug'
      },
      // Ready
      {
        id: 'R-2',
        title: 'r2',
        priority: 1,
        created_at: new Date('2025-10-20T08:00:00.000Z').getTime(),
        updated_at: new Date('2025-10-20T08:00:00.000Z').getTime(),
        issue_type: 'task'
      },
      {
        id: 'R-1',
        title: 'r1',
        priority: 0,
        created_at: new Date('2025-10-21T08:00:00.000Z').getTime(),
        updated_at: new Date('2025-10-21T08:00:00.000Z').getTime(),
        issue_type: 'bug'
      },
      {
        id: 'R-3',
        title: 'r3',
        priority: 1,
        created_at: new Date('2025-10-22T08:00:00.000Z').getTime(),
        updated_at: new Date('2025-10-22T08:00:00.000Z').getTime(),
        issue_type: 'feature'
      },
      // In progress
      {
        id: 'P-1',
        title: 'p1',
        created_at: new Date('2025-10-23T09:00:00.000Z').getTime(),
        updated_at: new Date('2025-10-23T09:00:00.000Z').getTime(),
        issue_type: 'task'
      },
      {
        id: 'P-2',
        title: 'p2',
        created_at: new Date('2025-10-22T09:00:00.000Z').getTime(),
        updated_at: new Date('2025-10-22T09:00:00.000Z').getTime(),
        issue_type: 'feature'
      },
      // Closed
      {
        id: 'C-2',
        title: 'c2',
        updated_at: new Date('2025-10-20T09:00:00.000Z').getTime(),
        closed_at: new Date(now).getTime(),
        issue_type: 'task'
      },
      {
        id: 'C-1',
        title: 'c1',
        updated_at: new Date('2025-10-21T09:00:00.000Z').getTime(),
        closed_at: new Date(now - 1000).getTime(),
        issue_type: 'bug'
      }
    ];
    const issueStores = createTestIssueStores();
    issueStores.getStore('tab:board:blocked').applyPush({
      type: 'snapshot',
      id: 'tab:board:blocked',
      revision: 1,
      issues: issues.filter((i) => i.id.startsWith('B-'))
    });
    issueStores.getStore('tab:board:ready').applyPush({
      type: 'snapshot',
      id: 'tab:board:ready',
      revision: 1,
      issues: issues.filter((i) => i.id.startsWith('R-'))
    });
    issueStores.getStore('tab:board:in-progress').applyPush({
      type: 'snapshot',
      id: 'tab:board:in-progress',
      revision: 1,
      issues: issues.filter((i) => i.id.startsWith('P-'))
    });
    issueStores.getStore('tab:board:closed').applyPush({
      type: 'snapshot',
      id: 'tab:board:closed',
      revision: 1,
      issues: issues.filter((i) => i.id.startsWith('C-'))
    });

    /** @type {string[]} */
    const navigations = [];
    const view = createBoardView(
      mount,
      null,
      (id) => {
        navigations.push(id);
      },
      undefined,
      undefined,
      issueStores
    );

    await view.load();

    // Blocked: priority asc, then created_at desc for equal priority
    const blocked_ids = Array.from(
      mount.querySelectorAll('#blocked-col .board-card .mono')
    ).map((el) => el.textContent?.trim());
    expect(blocked_ids).toEqual(['B-1', 'B-2']);

    // Ready: priority asc, then created_at asc for equal priority
    const ready_ids = Array.from(
      mount.querySelectorAll('#ready-col .board-card .mono')
    ).map((el) => el.textContent?.trim());
    expect(ready_ids).toEqual(['R-1', 'R-2', 'R-3']);

    // In progress: priority asc (default), then created_at asc
    const prog_ids = Array.from(
      mount.querySelectorAll('#in-progress-col .board-card .mono')
    ).map((el) => el.textContent?.trim());
    expect(prog_ids).toEqual(['P-2', 'P-1']);

    // Closed: closed_at desc
    const closed_ids = Array.from(
      mount.querySelectorAll('#closed-col .board-card .mono')
    ).map((el) => el.textContent?.trim());
    expect(closed_ids).toEqual(['C-2', 'C-1']);

    // Click navigates
    const first_ready = /** @type {HTMLElement|null} */ (
      mount.querySelector('#ready-col .board-card')
    );
    first_ready?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(navigations[0]).toBe('R-1');
  });

  test('shows column count badges next to titles', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));

    const now = Date.now();
    const issueStores = createTestIssueStores();
    issueStores.getStore('tab:board:blocked').applyPush({
      type: 'snapshot',
      id: 'tab:board:blocked',
      revision: 1,
      issues: [
        {
          id: 'B-1',
          title: 'blocked 1',
          created_at: now - 5,
          updated_at: now - 5,
          issue_type: 'task'
        },
        {
          id: 'B-2',
          title: 'blocked 2',
          created_at: now - 4,
          updated_at: now - 4,
          issue_type: 'task'
        }
      ]
    });
    issueStores.getStore('tab:board:ready').applyPush({
      type: 'snapshot',
      id: 'tab:board:ready',
      revision: 1,
      issues: [
        {
          id: 'R-1',
          title: 'ready 1',
          created_at: now - 3,
          updated_at: now - 3,
          issue_type: 'feature'
        },
        {
          id: 'R-2',
          title: 'ready 2',
          created_at: now - 2,
          updated_at: now - 2,
          issue_type: 'task'
        },
        {
          id: 'R-3',
          title: 'ready 3',
          created_at: now - 1,
          updated_at: now - 1,
          issue_type: 'task'
        }
      ]
    });
    issueStores.getStore('tab:board:in-progress').applyPush({
      type: 'snapshot',
      id: 'tab:board:in-progress',
      revision: 1,
      issues: [
        {
          id: 'P-1',
          title: 'progress 1',
          created_at: now,
          updated_at: now,
          issue_type: 'feature'
        }
      ]
    });
    issueStores.getStore('tab:board:closed').applyPush({
      type: 'snapshot',
      id: 'tab:board:closed',
      revision: 1,
      issues: [
        {
          id: 'C-1',
          title: 'closed 1',
          updated_at: now,
          closed_at: now,
          issue_type: 'chore'
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

    const blocked_count = mount
      .querySelector('#blocked-col .board-column__count')
      ?.textContent?.trim();
    const ready_count = mount
      .querySelector('#ready-col .board-column__count')
      ?.textContent?.trim();
    const in_progress_count = mount
      .querySelector('#in-progress-col .board-column__count')
      ?.textContent?.trim();
    const closed_count = mount
      .querySelector('#closed-col .board-column__count')
      ?.textContent?.trim();

    expect(blocked_count).toBe('2');
    expect(ready_count).toBe('3');
    expect(in_progress_count).toBe('1');
    expect(closed_count).toBe('1');

    const closed_label = mount
      .querySelector('#closed-col .board-column__count')
      ?.getAttribute('aria-label');
    expect(closed_label).toBe('1 issue');
  });

  test('filters Ready to exclude items that are In Progress', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));

    const issues = [
      {
        id: 'X-1',
        title: 'x1',
        priority: 1,
        created_at: '2025-10-23T10:00:00.000Z',
        updated_at: '2025-10-23T10:00:00.000Z',
        issue_type: 'task'
      },
      {
        id: 'X-2',
        title: 'x2',
        priority: 1,
        created_at: '2025-10-23T09:00:00.000Z',
        updated_at: '2025-10-23T09:00:00.000Z',
        issue_type: 'task'
      }
    ];
    const issueStores = createTestIssueStores();
    issueStores.getStore('tab:board:ready').applyPush({
      type: 'snapshot',
      id: 'tab:board:ready',
      revision: 1,
      issues: issues
    });
    issueStores.getStore('tab:board:in-progress').applyPush({
      type: 'snapshot',
      id: 'tab:board:in-progress',
      revision: 1,
      issues: issues.filter((i) => i.id.startsWith('X-2'))
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

    const ready_ids = Array.from(
      mount.querySelectorAll('#ready-col .board-card .mono')
    ).map((el) => el.textContent?.trim());

    // X-2 is in progress, so Ready should only show X-1
    expect(ready_ids).toEqual(['X-1']);

    const prog_ids = Array.from(
      mount.querySelectorAll('#in-progress-col .board-card .mono')
    ).map((el) => el.textContent?.trim());
    expect(prog_ids).toEqual(['X-2']);
  });
});
