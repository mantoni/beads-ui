import { describe, expect, test } from 'vitest';
import { createSubscriptionIssueStore } from '../data/subscription-issue-store.js';
import { createListView } from './list.js';

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

describe('list view — fast filter switches', () => {
  test('ignores out-of-order snapshots and renders from push-only store', async () => {
    document.body.innerHTML = '<aside id="mount" class="panel"></aside>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));

    const issueStores = createTestIssueStores();
    // Initial empty snapshot for default "all"
    issueStores.getStore('tab:issues').applyPush({
      type: 'snapshot',
      id: 'tab:issues',
      revision: 1,
      issues: []
    });
    const view = createListView(
      mount,
      async () => [],
      undefined,
      undefined,
      undefined,
      issueStores
    );
    await view.load();
    expect(mount.querySelectorAll('tr.issue-row').length).toBe(0);

    // Simulate quick switch: ready -> in_progress while snapshots arrive out-of-order
    const statusSelect = /** @type {HTMLSelectElement} */ (
      mount.querySelector('select')
    );
    statusSelect.value = 'ready';
    statusSelect.dispatchEvent(new Event('change'));
    statusSelect.value = 'in_progress';
    statusSelect.dispatchEvent(new Event('change'));

    const inProg = [
      {
        id: 'P-1',
        title: 'prog 1',
        status: 'in_progress',
        created_at: 200,
        updated_at: 200
      },
      {
        id: 'P-2',
        title: 'prog 2',
        status: 'in_progress',
        created_at: 210,
        updated_at: 210
      }
    ];
    const ready = [
      {
        id: 'R-1',
        title: 'ready 1',
        status: 'open',
        created_at: 100,
        updated_at: 100
      }
    ];

    // Newer revision first
    issueStores.getStore('tab:issues').applyPush({
      type: 'snapshot',
      id: 'tab:issues',
      revision: 3,
      issues: inProg
    });
    await Promise.resolve();
    // Stale snapshot second
    issueStores.getStore('tab:issues').applyPush({
      type: 'snapshot',
      id: 'tab:issues',
      revision: 2,
      issues: ready
    });
    await Promise.resolve();

    /** @type {any[]} */
    const snapshot = issueStores.snapshotFor('tab:issues');
    const ids = snapshot.map((it) => it.id);
    expect(ids).toEqual(['P-2', 'P-1']);

    const rows = Array.from(mount.querySelectorAll('tr.issue-row')).map(
      (el) => el.getAttribute('data-issue-id') || ''
    );
    expect(rows).toEqual(['P-2', 'P-1']);
  });
});
