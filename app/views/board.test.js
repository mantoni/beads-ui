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

describe('views/board Blocked lane union', () => {
  test('shows issues whose stored status is blocked', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));

    const issueStores = createTestIssueStores();
    // Stored-status blocked issues never appear in `bd blocked`; they arrive
    // on their own subscription.
    issueStores.getStore('tab:board:status-blocked').applyPush({
      type: 'snapshot',
      id: 'tab:board:status-blocked',
      revision: 1,
      issues: [
        {
          id: 'S-1',
          title: 's1',
          status: 'blocked',
          priority: 1,
          created_at: new Date('2025-10-21T07:00:00.000Z').getTime(),
          updated_at: new Date('2025-10-21T07:00:00.000Z').getTime(),
          issue_type: 'task'
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

    const blocked_ids = Array.from(
      mount.querySelectorAll('#blocked-col .board-card .mono')
    ).map((el) => el.textContent?.trim());
    expect(blocked_ids).toEqual(['S-1']);
  });

  test('still shows dependency-blocked issues', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));

    const issueStores = createTestIssueStores();
    // `bd blocked` reports dependency-blocked issues, whose own status is open.
    issueStores.getStore('tab:board:blocked').applyPush({
      type: 'snapshot',
      id: 'tab:board:blocked',
      revision: 1,
      issues: [
        {
          id: 'D-1',
          title: 'd1',
          status: 'open',
          priority: 1,
          created_at: new Date('2025-10-21T07:00:00.000Z').getTime(),
          updated_at: new Date('2025-10-21T07:00:00.000Z').getTime(),
          issue_type: 'task'
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

    const blocked_ids = Array.from(
      mount.querySelectorAll('#blocked-col .board-card .mono')
    ).map((el) => el.textContent?.trim());
    expect(blocked_ids).toEqual(['D-1']);
  });

  test('renders an issue in both blocked sources exactly once', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));

    const both = {
      id: 'X-1',
      title: 'both',
      status: 'blocked',
      priority: 1,
      created_at: new Date('2025-10-21T07:00:00.000Z').getTime(),
      updated_at: new Date('2025-10-21T07:00:00.000Z').getTime(),
      issue_type: 'task'
    };
    const issueStores = createTestIssueStores();
    issueStores.getStore('tab:board:blocked').applyPush({
      type: 'snapshot',
      id: 'tab:board:blocked',
      revision: 1,
      issues: [both]
    });
    issueStores.getStore('tab:board:status-blocked').applyPush({
      type: 'snapshot',
      id: 'tab:board:status-blocked',
      revision: 1,
      issues: [{ ...both }]
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

    const cards = mount.querySelectorAll(
      '#blocked-col .board-card[data-issue-id="X-1"]'
    );
    expect(cards.length).toBe(1);
    const all_cards = mount.querySelectorAll('#blocked-col .board-card');
    expect(all_cards.length).toBe(1);
    const count = mount
      .querySelector('#blocked-col .board-column__count')
      ?.textContent?.trim();
    expect(count).toBe('1');
  });

  test('does not fall back to the legacy fetch when only stored-blocked issues exist', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));

    const issueStores = createTestIssueStores();
    issueStores.getStore('tab:board:status-blocked').applyPush({
      type: 'snapshot',
      id: 'tab:board:status-blocked',
      revision: 1,
      issues: [
        {
          id: 'S-1',
          title: 's1',
          status: 'blocked',
          priority: 1,
          created_at: 10_000,
          updated_at: 10_000,
          issue_type: 'task'
        }
      ]
    });

    /** @type {string[]} */
    const fetched = [];
    const data = {
      async getReady() {
        fetched.push('ready');
        return [];
      },
      async getBlocked() {
        fetched.push('blocked');
        return [{ id: 'LEGACY-1', title: 'legacy', updated_at: 1 }];
      },
      async getInProgress() {
        fetched.push('in-progress');
        return [];
      },
      async getClosed() {
        fetched.push('closed');
        return [];
      }
    };
    const subscriptions = {
      selectors: {
        /** @param {string} id */
        count(id) {
          return id === 'tab:board:status-blocked' ? 1 : 0;
        },
        getIds() {
          return [];
        }
      }
    };

    const view = createBoardView(
      mount,
      data,
      () => {},
      undefined,
      subscriptions,
      issueStores
    );
    await view.load();

    // The stored-blocked subscription has items, so the legacy fallback must
    // not run and must not overwrite the lane.
    expect(fetched).toEqual([]);
    const blocked_ids = Array.from(
      mount.querySelectorAll('#blocked-col .board-card .mono')
    ).map((el) => el.textContent?.trim());
    expect(blocked_ids).toEqual(['S-1']);
  });

  test('dropping into the Blocked lane sets status blocked', async () => {
    const { mount, calls } = await setupDropBoard();

    dropOn(mount, 'blocked-col', 'S-1');
    await flush();

    expect(calls).toEqual([
      ['update-status', { id: 'S-1', status: 'blocked' }]
    ]);
  });

  test('dropping out of the Blocked lane sets the target column status', async () => {
    const ready = await setupDropBoard();
    dropOn(ready.mount, 'ready-col', 'S-1');
    await flush();
    expect(ready.calls).toEqual([
      ['update-status', { id: 'S-1', status: 'open' }]
    ]);

    const in_progress = await setupDropBoard();
    dropOn(in_progress.mount, 'in-progress-col', 'S-1');
    await flush();
    expect(in_progress.calls).toEqual([
      ['update-status', { id: 'S-1', status: 'in_progress' }]
    ]);

    const closed = await setupDropBoard();
    dropOn(closed.mount, 'closed-col', 'S-1');
    await flush();
    expect(closed.calls).toEqual([
      ['update-status', { id: 'S-1', status: 'closed' }]
    ]);
  });

  test('preserves card identity when an earlier issue is inserted', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));
    const issueStores = createTestIssueStores();
    const issue_store = issueStores.getStore('tab:board:ready');
    issue_store.applyPush({
      type: 'snapshot',
      id: 'tab:board:ready',
      revision: 1,
      issues: [
        { id: 'UI-2', title: 'Two', priority: 1, updated_at: 1 },
        { id: 'UI-3', title: 'Three', priority: 2, updated_at: 1 }
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
    const existing_card = mount.querySelector('[data-issue-id="UI-2"]');

    issue_store.applyPush({
      type: 'upsert',
      id: 'tab:board:ready',
      revision: 2,
      issue: { id: 'UI-1', title: 'One', priority: 0, updated_at: 2 }
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(mount.querySelector('[data-issue-id="UI-2"]')).toBe(existing_card);
  });
});

/**
 * Flush pending microtasks so the async transport call settles.
 */
async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

/**
 * Mount a board holding a single stored-blocked issue and capture the
 * mutations dispatched through the transport.
 *
 * @returns {Promise<{ mount: HTMLElement, calls: Array<[string, unknown]> }>}
 */
async function setupDropBoard() {
  document.body.innerHTML = '<div id="m"></div>';
  const mount = /** @type {HTMLElement} */ (document.getElementById('m'));

  const issueStores = createTestIssueStores();
  issueStores.getStore('tab:board:status-blocked').applyPush({
    type: 'snapshot',
    id: 'tab:board:status-blocked',
    revision: 1,
    issues: [
      {
        id: 'S-1',
        title: 's1',
        status: 'blocked',
        priority: 1,
        created_at: new Date('2025-10-21T07:00:00.000Z').getTime(),
        updated_at: new Date('2025-10-21T07:00:00.000Z').getTime(),
        issue_type: 'task'
      }
    ]
  });

  /** @type {Array<[string, unknown]>} */
  const calls = [];
  const view = createBoardView(
    mount,
    null,
    () => {},
    undefined,
    undefined,
    issueStores,
    async (type, payload) => {
      calls.push([type, payload]);
      return null;
    }
  );
  await view.load();
  return { mount, calls };
}

/**
 * Dispatch a `drop` event on a board column with a stubbed dataTransfer.
 * jsdom has no DataTransfer implementation, so the payload is stubbed.
 *
 * @param {HTMLElement} mount
 * @param {string} col_id
 * @param {string} issue_id
 */
function dropOn(mount, col_id, issue_id) {
  const col = /** @type {HTMLElement} */ (mount.querySelector(`#${col_id}`));
  const ev = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'dataTransfer', {
    value: {
      getData() {
        return issue_id;
      }
    }
  });
  col.dispatchEvent(ev);
}
