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

describe('views/board keyboard navigation', () => {
  test('ArrowUp/ArrowDown move within column', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));

    const issues = [
      { id: 'P-1', title: 'p1', updated_at: '2025-10-23T10:00:00.000Z' },
      { id: 'P-2', title: 'p2', updated_at: '2025-10-23T09:00:00.000Z' }
    ];
    const issueStores = createTestIssueStores();
    issueStores.getStore('tab:board:in-progress').applyPush({
      type: 'snapshot',
      id: 'tab:board:in-progress',
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

    const first = /** @type {HTMLElement} */ (
      mount.querySelector('#in-progress-col .board-card')
    );
    const second = /** @type {HTMLElement} */ (
      mount.querySelectorAll('#in-progress-col .board-card')[1]
    );
    first.focus();
    expect(document.activeElement).toBe(first);

    first.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })
    );
    expect(document.activeElement).toBe(second);

    second.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })
    );
    expect(document.activeElement).toBe(first);
  });

  test('ArrowLeft/ArrowRight jump to top card in adjacent non-empty column, skipping empty', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));

    const issues = [
      { id: 'B-1', title: 'b1', updated_at: '2025-10-23T10:00:00.000Z' },
      { id: 'P-1', title: 'p1', updated_at: '2025-10-23T10:00:00.000Z' },
      { id: 'P-2', title: 'p2', updated_at: '2025-10-23T09:00:00.000Z' }
    ];
    const issueStores = createTestIssueStores();
    issueStores.getStore('tab:board:blocked').applyPush({
      type: 'snapshot',
      id: 'tab:board:blocked',
      revision: 1,
      issues: issues.filter((i) => i.id.startsWith('B-'))
    });
    issueStores.getStore('tab:board:in-progress').applyPush({
      type: 'snapshot',
      id: 'tab:board:in-progress',
      revision: 1,
      issues: issues.filter((i) => i.id.startsWith('P-'))
    });

    /** @type {string[]} */
    const opened = [];
    const view = createBoardView(
      mount,
      null,
      (id) => {
        opened.push(id);
      },
      undefined,
      undefined,
      issueStores
    );
    await view.load();

    const open_first = /** @type {HTMLElement} */ (
      mount.querySelector('#blocked-col .board-card')
    );
    const prog_first = /** @type {HTMLElement} */ (
      mount.querySelector('#in-progress-col .board-card')
    );
    open_first.focus();
    open_first.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
    );
    expect(document.activeElement).toBe(prog_first);

    // Enter opens the details (via goto_issue callback)
    prog_first.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    );
    expect(opened).toEqual(['P-1']);

    // Space also opens
    prog_first.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', bubbles: true })
    );
    expect(opened).toEqual(['P-1', 'P-1']);
  });
});
