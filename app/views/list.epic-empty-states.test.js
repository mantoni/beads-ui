import { describe, expect, test } from 'vitest';
import { createSubscriptionIssueStore } from '../data/subscription-issue-store.js';
import { createListView } from './list.js';

/**
 * Minimal push-store harness (mirrors the one in list.test.js).
 */
function createTestIssueStores() {
  /** @type {Map<string, any>} */
  const stores = new Map();
  /** @type {Set<() => void>} */
  const listeners = new Set();

  /**
   * @param {string} id - Subscription client id.
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
    /** @param {string} id - Subscription client id. */
    snapshotFor(id) {
      return getStore(id).snapshot().slice();
    },
    /** @param {() => void} fn - Change listener. */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }
  };
}

/**
 * Seed a single epic into `tab:issues` plus its counters in `tab:epics`.
 *
 * @param {any} stores - Test store harness.
 * @param {number} total_children - Counter reported by `bd epic status`.
 * @param {any[]} [extra_issues] - Additional top-level issues.
 */
function seedEpic(stores, total_children, extra_issues = []) {
  stores.getStore('tab:issues').applyPush({
    type: 'snapshot',
    id: 'tab:issues',
    revision: 1,
    issues: [
      {
        id: 'X-EPIC',
        title: 'Epic A',
        status: 'open',
        priority: 1,
        issue_type: 'epic'
      },
      ...extra_issues
    ]
  });
  stores.getStore('tab:epics').applyPush({
    type: 'snapshot',
    id: 'tab:epics',
    revision: 1,
    issues: [{ id: 'X-EPIC', total_children, closed_children: 0 }]
  });
}

/**
 * Seed the epic's `issue-detail` subscription with children.
 *
 * @param {any} stores - Test store harness.
 * @param {any[]} dependents - Child issues delivered by the detail fetch.
 */
function seedChildren(stores, dependents) {
  stores.getStore('detail:X-EPIC').applyPush({
    type: 'snapshot',
    id: 'detail:X-EPIC',
    revision: 1,
    issues: [{ id: 'X-EPIC', dependents }]
  });
}

/**
 * Read the placeholder row rendered under an expanded epic, if any.
 *
 * @param {HTMLElement} mount - The container element.
 * @returns {{ state: string, text: string } | null}
 */
function placeholder(mount) {
  const el = mount.querySelector('[data-epic-empty-for="X-EPIC"]');
  if (!el) {
    return null;
  }
  return {
    state: el.getAttribute('data-empty-state') || '',
    text: (el.textContent || '').trim()
  };
}

/**
 * Expand the seeded epic by clicking its chevron.
 *
 * @param {HTMLElement} mount - The container element.
 */
async function expandEpic(mount) {
  /** @type {HTMLElement} */ (
    mount.querySelector('[data-epic-id="X-EPIC"] .epic-chevron')
  ).click();
  await Promise.resolve();
}

/**
 * Click a status checkbox in the status dropdown.
 *
 * @param {HTMLElement} mount - The container element.
 * @param {string} label - Visible label of the checkbox.
 */
function toggleStatus(mount, label) {
  const dropdown = mount.querySelectorAll('.filter-dropdown')[0];
  const option = Array.from(
    dropdown.querySelectorAll('.filter-dropdown__option--status')
  ).find((opt) => (opt.textContent || '').trim() === label);
  const checkbox = /** @type {HTMLInputElement} */ (
    option?.querySelector('input[type="checkbox"]')
  );
  checkbox.click();
}

/**
 * Mount the list view against the given stores.
 *
 * @param {HTMLElement} mount - The container element.
 * @param {any} stores - Test store harness.
 * @param {any} [subscriptions] - Optional subscriptions facade.
 */
function mountList(mount, stores, subscriptions = undefined) {
  return createListView(
    mount,
    async () => null,
    () => {},
    undefined,
    subscriptions,
    stores
  );
}

describe('views/list expanded-epic empty states', () => {
  test('expanded epic whose children never arrive shows a degraded state', async () => {
    document.body.innerHTML = '<aside id="mount" class="panel"></aside>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
    const stores = createTestIssueStores();
    // Counters say there are 2 children, but the issue-detail fetch delivered
    // nothing (the production failure mode: every detail fetch erroring out).
    seedEpic(stores, 2);
    const view = mountList(mount, stores);
    await view.load();
    await expandEpic(mount);

    const ph = placeholder(mount);
    expect(ph).toBeTruthy();
    expect(ph?.state).toBe('failed');
    expect(ph?.text).toBe("Couldn't load children");
  });

  test('expanded epic with no children at all shows the benign empty state', async () => {
    document.body.innerHTML = '<aside id="mount" class="panel"></aside>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
    const stores = createTestIssueStores();
    seedEpic(stores, 0);
    const view = mountList(mount, stores);
    await view.load();
    await expandEpic(mount);

    const ph = placeholder(mount);
    expect(ph).toBeTruthy();
    expect(ph?.state).toBe('empty');
    expect(ph?.text).toBe('No children');
  });

  test('children excluded by the active filter are not reported as a failure', async () => {
    document.body.innerHTML = '<aside id="mount" class="panel"></aside>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
    const stores = createTestIssueStores();
    // total_children > 0 AND children delivered: only the user's own status
    // filter empties the list, so this must not read as a load failure.
    seedEpic(stores, 2);
    seedChildren(stores, [
      {
        id: 'X-2',
        title: 'open child',
        status: 'open',
        priority: 2,
        issue_type: 'task'
      },
      {
        id: 'X-3',
        title: 'another open child',
        status: 'open',
        priority: 2,
        issue_type: 'task'
      }
    ]);
    const view = mountList(mount, stores);
    await view.load();
    await expandEpic(mount);
    expect(placeholder(mount)).toBeNull();

    toggleStatus(mount, 'Closed');
    await Promise.resolve();

    expect(mount.querySelector('[data-issue-id="X-2"]')).toBeFalsy();
    const ph = placeholder(mount);
    expect(ph).toBeTruthy();
    expect(ph?.state).toBe('filtered');
    expect(ph?.text).not.toContain("Couldn't load");
  });

  test('expanded epic with delivered children renders rows and no placeholder', async () => {
    document.body.innerHTML = '<aside id="mount" class="panel"></aside>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
    const stores = createTestIssueStores();
    seedEpic(stores, 2);
    seedChildren(stores, [
      {
        id: 'X-2',
        title: 'child one',
        status: 'open',
        priority: 2,
        issue_type: 'task'
      },
      {
        id: 'X-3',
        title: 'child two',
        status: 'closed',
        priority: 2,
        issue_type: 'task'
      }
    ]);
    const view = mountList(mount, stores);
    await view.load();
    await expandEpic(mount);

    expect(mount.querySelector('[data-issue-id="X-2"]')).toBeTruthy();
    expect(mount.querySelector('[data-issue-id="X-3"]')).toBeTruthy();
    expect(mount.querySelectorAll('tr.epic-child-row').length).toBe(2);
    expect(placeholder(mount)).toBeNull();
  });

  test('collapsed epic still hides its children from the top level', async () => {
    document.body.innerHTML = '<aside id="mount" class="panel"></aside>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
    const stores = createTestIssueStores();
    seedEpic(stores, 2, [
      {
        id: 'X-2',
        title: 'Child One',
        status: 'open',
        priority: 2,
        issue_type: 'task',
        parent: 'X-EPIC'
      },
      {
        id: 'X-3',
        title: 'Child Two',
        status: 'open',
        priority: 2,
        issue_type: 'task',
        parent: 'X-EPIC'
      },
      {
        id: 'X-4',
        title: 'Standalone',
        status: 'open',
        priority: 2,
        issue_type: 'task'
      }
    ]);
    const view = mountList(mount, stores);
    await view.load();

    // Nothing expanded: children stay hidden and no placeholder appears.
    expect(mount.querySelector('[data-issue-id="X-EPIC"]')).toBeTruthy();
    expect(mount.querySelector('[data-issue-id="X-4"]')).toBeTruthy();
    expect(mount.querySelector('[data-issue-id="X-2"]')).toBeFalsy();
    expect(mount.querySelector('[data-issue-id="X-3"]')).toBeFalsy();
    expect(placeholder(mount)).toBeNull();
  });

  test('in-flight detail fetch shows loading, not the failure state', async () => {
    document.body.innerHTML = '<aside id="mount" class="panel"></aside>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
    const stores = createTestIssueStores();
    seedEpic(stores, 2);
    /** @type {(v: any) => void} */
    let settle = () => {};
    const subscriptions = {
      /** @returns {Promise<() => Promise<void>>} */
      subscribeList: () =>
        new Promise((resolve) => {
          settle = resolve;
        })
    };
    const view = mountList(mount, stores, subscriptions);
    await view.load();
    await expandEpic(mount);

    const pending = placeholder(mount);
    expect(pending?.state).toBe('loading');
    expect(pending?.text).not.toContain("Couldn't load");

    // The fetch settles without delivering children -> degraded state.
    settle(async () => {});
    await Promise.resolve();
    await Promise.resolve();
    expect(placeholder(mount)?.state).toBe('failed');
  });
});
