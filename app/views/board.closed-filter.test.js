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

describe('views/board closed filter', () => {
  test('filters closed issues by timeframe and sorts by closed_at', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));

    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    const issues = [
      {
        id: 'C-1',
        title: 'four days',
        closed_at: new Date(now - 4 * oneDay).getTime()
      },
      {
        id: 'C-2',
        title: 'yesterday',
        closed_at: new Date(now - 1 * oneDay).getTime()
      },
      { id: 'C-3', title: 'today', closed_at: new Date(now).getTime() }
    ];
    const issueStores = createTestIssueStores();
    issueStores.getStore('tab:board:closed').applyPush({
      type: 'snapshot',
      id: 'tab:board:closed',
      revision: 1,
      issues
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

    // Default filter: Today → only C-3 visible
    let closed_ids = Array.from(
      mount.querySelectorAll('#closed-col .board-card .mono')
    ).map((el) => el.textContent?.trim());
    expect(closed_ids).toEqual(['#3']);

    // Change to Last 3 days → C-3 (today) and C-2 (yesterday)
    const select = /** @type {HTMLSelectElement} */ (
      mount.querySelector('#closed-filter')
    );
    select.value = '3';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    closed_ids = Array.from(
      mount.querySelectorAll('#closed-col .board-card .mono')
    ).map((el) => el.textContent?.trim());
    expect(closed_ids).toEqual(['#3', '#2']);

    // Change to Last 7 days → all three, sorted by closed_at desc
    select.value = '7';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    closed_ids = Array.from(
      mount.querySelectorAll('#closed-col .board-card .mono')
    ).map((el) => el.textContent?.trim());
    expect(closed_ids).toEqual(['#3', '#2', '#1']);
  });
});
