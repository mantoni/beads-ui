import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createSubscriptionIssueStore } from '../data/subscription-issue-store.js';
import { createSubscriptionStore } from '../data/subscriptions-store.js';
import { createEpicsView } from './epics.js';

/**
 * Mount an epics view with the given epics seeded in `tab:epics`.
 *
 * @param {any[]} epics
 */
function createEpicsHarness(epics) {
  document.body.innerHTML = '<div id="m"></div>';
  const mount = /** @type {HTMLElement} */ (document.getElementById('m'));
  /** @type {Map<string, any>} */
  const stores = new Map();
  /** @type {Set<() => void>} */
  const listeners = new Set();
  /** @param {string} id */
  const getStore = (id) => {
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
  };
  const issue_stores = {
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
  issue_stores.getStore('tab:epics').applyPush({
    type: 'snapshot',
    id: 'tab:epics',
    revision: 1,
    issues: epics
  });
  const view = createEpicsView(
    mount,
    /** @type {any} */ ({ updateIssue: vi.fn() }),
    () => {},
    createSubscriptionStore(async () => {}),
    /** @type {any} */ (issue_stores)
  );
  /**
   * Seed the issue list backing child search.
   *
   * @param {any[]} issues
   * @param {string} [client_id]
   */
  function seedSearchList(issues, client_id = 'epics:search-open') {
    issue_stores.getStore(client_id).applyPush({
      type: 'snapshot',
      id: client_id,
      revision: 1,
      issues
    });
  }
  return { mount, view, seedSearchList };
}

/**
 * Type into the epics search input and let the search lists subscribe.
 *
 * @param {HTMLElement} mount
 * @param {string} text
 */
async function typeSearch(mount, text) {
  const input = /** @type {HTMLInputElement} */ (
    mount.querySelector('input[type="search"]')
  );
  input.value = text;
  input.dispatchEvent(new Event('input'));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Titles of the issue rows currently rendered.
 *
 * @param {HTMLElement} mount
 */
function visibleRowTitles(mount) {
  return Array.from(mount.querySelectorAll('tr.epic-row')).map((row) =>
    (row.querySelectorAll('td')[2].textContent || '').trim()
  );
}

/**
 * Ids of the epic groups currently rendered.
 *
 * @param {HTMLElement} mount
 */
function visibleEpicIds(mount) {
  return Array.from(mount.querySelectorAll('.epic-group')).map(
    (el) => el.getAttribute('data-epic-id') || ''
  );
}

describe('views/epics', () => {
  beforeEach(() => {
    window.localStorage.removeItem('beads-ui.epics.search');
  });

  test('loads groups from store and expands to show non-closed children, navigates on click', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));
    const data = {
      updateIssue: vi.fn(),
      getIssue: vi.fn(async (id) => ({ id }))
    };
    /** test issue stores */
    const stores = new Map();
    const listeners = new Set();
    /** @param {string} id */
    const getStore = (id) => {
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
    };
    const issueStores = {
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
    const subscriptions = createSubscriptionStore(async () => {});
    // Seed epics list snapshot
    issueStores.getStore('tab:epics').applyPush({
      type: 'snapshot',
      id: 'tab:epics',
      revision: 1,
      issues: [
        {
          id: 'UI-1',
          title: 'Epic One',
          issue_type: 'epic',
          dependents: [{ id: 'UI-2' }, { id: 'UI-3' }]
        }
      ]
    });
    /** @type {string[]} */
    const navCalls = [];
    const view = createEpicsView(
      mount,
      /** @type {any} */ (data),
      (id) => navCalls.push(id),
      subscriptions,
      /** @type {any} */ (issueStores)
    );
    await view.load();
    // Register epic detail and push snapshot with dependents
    issueStores.getStore('detail:UI-1');
    issueStores.getStore('detail:UI-1').applyPush({
      type: 'snapshot',
      id: 'detail:UI-1',
      revision: 1,
      issues: [
        {
          id: 'UI-1',
          title: 'Epic One',
          issue_type: 'epic',
          dependents: [
            {
              id: 'UI-2',
              title: 'Alpha',
              status: 'open',
              priority: 1,
              issue_type: 'task'
            },
            {
              id: 'UI-3',
              title: 'Beta',
              status: 'closed',
              priority: 2,
              issue_type: 'task'
            }
          ]
        }
      ]
    });
    await view.load();
    const header = mount.querySelector('.epic-header');
    expect(header).not.toBeNull();
    // After expansion, only non-closed child should be present
    const rows = mount.querySelectorAll('tr.epic-row');
    expect(rows.length).toBe(2);
    rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(navCalls[0]).toBe('UI-2');
  });

  test('sorts children by priority then created_at asc', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));
    const data = {
      updateIssue: vi.fn(),
      getIssue: vi.fn(async (id) => ({ id }))
    };
    const stores2 = new Map();
    const listeners2 = new Set();
    /** @param {string} id */
    const getStore2 = (id) => {
      let s = stores2.get(id);
      if (!s) {
        s = createSubscriptionIssueStore(id);
        stores2.set(id, s);
        s.subscribe(() => {
          for (const fn of Array.from(listeners2)) {
            try {
              fn();
            } catch {
              /* ignore */
            }
          }
        });
      }
      return s;
    };
    const issueStores2 = {
      getStore: getStore2,
      /** @param {string} id */
      snapshotFor(id) {
        return getStore2(id).snapshot().slice();
      },
      /** @param {() => void} fn */
      subscribe(fn) {
        listeners2.add(fn);
        return () => listeners2.delete(fn);
      }
    };
    const subscriptions = createSubscriptionStore(async () => {});
    // seed epics snapshot
    issueStores2.getStore('tab:epics').applyPush({
      type: 'snapshot',
      id: 'tab:epics',
      revision: 1,
      issues: [
        {
          id: 'UI-10',
          title: 'Epic Sort',
          issue_type: 'epic',
          dependents: [{ id: 'UI-11' }, { id: 'UI-12' }, { id: 'UI-13' }]
        }
      ]
    });
    const view = createEpicsView(
      mount,
      /** @type {any} */ (data),
      () => {},
      subscriptions,
      /** @type {any} */ (issueStores2)
    );
    await view.load();
    // Seed epic detail snapshot for UI-10 with out-of-order dependents
    issueStores2.getStore('detail:UI-10');
    issueStores2.getStore('detail:UI-10').applyPush({
      type: 'snapshot',
      id: 'detail:UI-10',
      revision: 1,
      issues: [
        {
          id: 'UI-10',
          title: 'Epic Sort',
          issue_type: 'epic',
          dependents: [
            {
              id: 'UI-11',
              title: 'Low priority, newest within p1',
              status: 'open',
              priority: 1,
              issue_type: 'task',
              created_at: '2025-10-22T10:00:00.000Z',
              updated_at: '2025-10-22T10:00:00.000Z'
            },
            {
              id: 'UI-12',
              title: 'Low priority, older',
              status: 'open',
              priority: 1,
              issue_type: 'task',
              created_at: '2025-10-20T10:00:00.000Z',
              updated_at: '2025-10-20T10:00:00.000Z'
            },
            {
              id: 'UI-13',
              title: 'Higher priority number (lower precedence)',
              status: 'open',
              priority: 2,
              issue_type: 'task',
              created_at: '2025-10-23T10:00:00.000Z',
              updated_at: '2025-10-23T10:00:00.000Z'
            }
          ]
        }
      ]
    });
    await view.load();
    const rows = Array.from(mount.querySelectorAll('tr.epic-row'));
    const ids = rows.map((r) =>
      /** @type {HTMLElement} */ (
        r.querySelector('td.mono')
      )?.textContent?.trim()
    );
    expect(ids).toEqual(['UI-12', 'UI-11', 'UI-13']);
  });

  test('clicking inputs/selects inside a row does not navigate', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));
    const data = {
      updateIssue: vi.fn(),
      getIssue: vi.fn(async (id) => ({ id }))
    };
    const stores3 = new Map();
    const listeners3 = new Set();
    /** @param {string} id */
    const getStore3 = (id) => {
      let s = stores3.get(id);
      if (!s) {
        s = createSubscriptionIssueStore(id);
        stores3.set(id, s);
        s.subscribe(() => {
          for (const fn of Array.from(listeners3)) {
            try {
              fn();
            } catch {
              /* ignore */
            }
          }
        });
      }
      return s;
    };
    const issueStores3 = {
      getStore: getStore3,
      /** @param {string} id */
      snapshotFor(id) {
        return getStore3(id).snapshot().slice();
      },
      /** @param {() => void} fn */
      subscribe(fn) {
        listeners3.add(fn);
        return () => listeners3.delete(fn);
      }
    };
    const subscriptions = createSubscriptionStore(async () => {});
    issueStores3.getStore('tab:epics').applyPush({
      type: 'snapshot',
      id: 'tab:epics',
      revision: 1,
      issues: [
        {
          id: 'UI-20',
          title: 'Epic Click Guard',
          issue_type: 'epic',
          dependents: [{ id: 'UI-21' }]
        }
      ]
    });
    /** @type {string[]} */
    const navCalls = [];
    const view = createEpicsView(
      mount,
      /** @type {any} */ (data),
      (id) => navCalls.push(id),
      subscriptions,
      /** @type {any} */ (issueStores3)
    );
    await view.load();
    // Provide detail snapshot so a child row exists
    issueStores3.getStore('detail:UI-20');
    issueStores3.getStore('detail:UI-20').applyPush({
      type: 'snapshot',
      id: 'detail:UI-20',
      revision: 1,
      issues: [
        {
          id: 'UI-20',
          title: 'Epic Click Guard',
          issue_type: 'epic',
          dependents: [
            {
              id: 'UI-21',
              title: 'Row',
              status: 'open',
              priority: 2,
              issue_type: 'task'
            }
          ]
        }
      ]
    });
    await view.load();
    // Click a select inside the row; should not navigate
    const sel = /** @type {HTMLSelectElement|null} */ (
      mount.querySelector('tr.epic-row select')
    );
    sel?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(navCalls.length).toBe(0);
  });

  test('shows Loading… while fetching children on manual expansion (no flicker)', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));
    const data = {
      updateIssue: vi.fn(),
      getIssue: vi.fn(async (id) => ({ id }))
    };
    const stores4 = new Map();
    const listeners4 = new Set();
    /** @param {string} id */
    const getStore4 = (id) => {
      let s = stores4.get(id);
      if (!s) {
        s = createSubscriptionIssueStore(id);
        stores4.set(id, s);
        s.subscribe(() => {
          for (const fn of Array.from(listeners4)) {
            try {
              fn();
            } catch {
              /* ignore */
            }
          }
        });
      }
      return s;
    };
    const issueStores4 = {
      getStore: getStore4,
      /** @param {string} id */
      snapshotFor(id) {
        return getStore4(id).snapshot().slice();
      },
      /** @param {() => void} fn */
      subscribe(fn) {
        listeners4.add(fn);
        return () => listeners4.delete(fn);
      }
    };
    const subscriptions = createSubscriptionStore(async () => {});
    issueStores4.getStore('tab:epics').applyPush({
      type: 'snapshot',
      id: 'tab:epics',
      revision: 1,
      issues: [
        {
          id: 'UI-40',
          title: 'Auto Expanded',
          issue_type: 'epic',
          dependents: []
        },
        {
          id: 'UI-41',
          title: 'Manual Expand',
          issue_type: 'epic',
          dependents: [{ id: 'UI-42' }]
        }
      ]
    });
    const view = createEpicsView(
      mount,
      /** @type {any} */ (data),
      () => {},
      subscriptions,
      /** @type {any} */ (issueStores4)
    );
    await view.load();
    // Expand the second group manually
    const groups = Array.from(mount.querySelectorAll('.epic-group'));
    const manual = groups.find(
      (g) => g.getAttribute('data-epic-id') === 'UI-41'
    );
    expect(manual).toBeDefined();
    manual
      ?.querySelector('.epic-header')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // Immediately after click, expect Loading…
    const text = manual?.querySelector('.epic-children')?.textContent || '';
    expect(text.includes('Loading…')).toBe(true);
    // Provide epic detail snapshot (no rendering assertion here)
    issueStores4.getStore('detail:UI-41');
    issueStores4.getStore('detail:UI-41').applyPush({
      type: 'snapshot',
      id: 'detail:UI-41',
      revision: 1,
      issues: [
        {
          id: 'UI-41',
          title: 'Epic Manual',
          issue_type: 'epic',
          dependents: [
            {
              id: 'UI-42',
              title: 'Child',
              status: 'open',
              priority: 2,
              issue_type: 'task'
            }
          ]
        }
      ]
    });
    // Verify mapping via store presence
    const d = issueStores4.snapshotFor('detail:UI-41');
    expect(d.length).toBe(1);
    expect(d[0]?.id).toBe('UI-41');
  });

  test('clicking the editable title does not navigate and enters edit mode', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));
    const data = {
      updateIssue: vi.fn(),
      getIssue: vi.fn(async (id) => ({ id }))
    };
    const stores5 = new Map();
    const listeners5 = new Set();
    /** @param {string} id */
    const getStore5 = (id) => {
      let s = stores5.get(id);
      if (!s) {
        s = createSubscriptionIssueStore(id);
        stores5.set(id, s);
        s.subscribe(() => {
          for (const fn of Array.from(listeners5)) {
            try {
              fn();
            } catch {
              /* ignore */
            }
          }
        });
      }
      return s;
    };
    const issueStores5 = {
      getStore: getStore5,
      /** @param {string} id */
      snapshotFor(id) {
        return getStore5(id).snapshot().slice();
      },
      /** @param {() => void} fn */
      subscribe(fn) {
        listeners5.add(fn);
        return () => listeners5.delete(fn);
      }
    };
    const subscriptions2 = createSubscriptionStore(async () => {});
    issueStores5.getStore('tab:epics').applyPush({
      type: 'snapshot',
      id: 'tab:epics',
      revision: 1,
      issues: [
        {
          id: 'UI-30',
          title: 'Epic Title Click',
          issue_type: 'epic',
          dependents: [{ id: 'UI-31' }]
        }
      ]
    });
    /** @type {string[]} */
    const navCalls = [];
    const view = createEpicsView(
      mount,
      /** @type {any} */ (data),
      (id) => navCalls.push(id),
      subscriptions2,
      /** @type {any} */ (issueStores5)
    );
    await view.load();
    issueStores5.getStore('detail:UI-30');
    issueStores5.getStore('detail:UI-30').applyPush({
      type: 'snapshot',
      id: 'detail:UI-30',
      revision: 1,
      issues: [
        {
          id: 'UI-30',
          title: 'Epic Title Click',
          issue_type: 'epic',
          dependents: [
            {
              id: 'UI-31',
              title: 'Clickable Title',
              status: 'open',
              priority: 2,
              issue_type: 'task'
            }
          ]
        }
      ]
    });
    await view.load();
    const titleSpan = /** @type {HTMLElement|null} */ (
      mount.querySelector('tr.epic-row td:nth-child(3) .editable')
    );
    expect(titleSpan).not.toBeNull();
    titleSpan?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    // Should not have navigated
    expect(navCalls.length).toBe(0);
    // Should render an input for title now
    const input = /** @type {HTMLInputElement|null} */ (
      mount.querySelector('tr.epic-row td:nth-child(3) input[type="text"]')
    );
    expect(input).not.toBeNull();
  });

  test('renders resizable column headers and persists a drag', async () => {
    window.localStorage.removeItem('beads-ui.columns.epics');
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));
    const data = {
      updateIssue: vi.fn(),
      getIssue: vi.fn(async (id) => ({ id }))
    };
    const stores6 = new Map();
    const listeners6 = new Set();
    /** @param {string} id */
    const getStore6 = (id) => {
      let s = stores6.get(id);
      if (!s) {
        s = createSubscriptionIssueStore(id);
        stores6.set(id, s);
        s.subscribe(() => {
          for (const fn of Array.from(listeners6)) {
            try {
              fn();
            } catch {
              /* ignore */
            }
          }
        });
      }
      return s;
    };
    const issueStores6 = {
      getStore: getStore6,
      /** @param {string} id */
      snapshotFor(id) {
        return getStore6(id).snapshot().slice();
      },
      /** @param {() => void} fn */
      subscribe(fn) {
        listeners6.add(fn);
        return () => listeners6.delete(fn);
      }
    };
    const subscriptions3 = createSubscriptionStore(async () => {});
    issueStores6.getStore('tab:epics').applyPush({
      type: 'snapshot',
      id: 'tab:epics',
      revision: 1,
      issues: [
        {
          id: 'UI-40',
          title: 'Epic Columns',
          issue_type: 'epic',
          dependents: [{ id: 'UI-41' }]
        }
      ]
    });
    const view = createEpicsView(
      mount,
      /** @type {any} */ (data),
      () => {},
      subscriptions3,
      /** @type {any} */ (issueStores6)
    );
    await view.load();
    issueStores6.getStore('detail:UI-40').applyPush({
      type: 'snapshot',
      id: 'detail:UI-40',
      revision: 1,
      issues: [
        {
          id: 'UI-40',
          title: 'Epic Columns',
          issue_type: 'epic',
          dependents: [
            {
              id: 'UI-41',
              title: 'Child',
              status: 'open',
              priority: 2,
              issue_type: 'task'
            }
          ]
        }
      ]
    });
    await view.load();

    const handles = mount.querySelectorAll('.epic-children th .col-resizer');
    handles[0].dispatchEvent(
      new MouseEvent('pointerdown', { clientX: 300, bubbles: true })
    );
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 270 }));
    window.dispatchEvent(new MouseEvent('pointerup', {}));

    expect(handles.length).toBe(7);
    const first_col = /** @type {HTMLElement} */ (
      mount.querySelector('.epic-children colgroup > col')
    );
    expect(first_col.style.width).toBe('70px');
    const stored = JSON.parse(
      window.localStorage.getItem('beads-ui.columns.epics') || '[]'
    );
    expect(stored[0]).toBe(70);
    window.localStorage.removeItem('beads-ui.columns.epics');
  });

  test('renders a search input in the header', async () => {
    const { mount, view } = createEpicsHarness([
      { id: 'UI-50', title: 'Table ergonomics', issue_type: 'epic' }
    ]);

    await view.load();

    const input = /** @type {HTMLInputElement|null} */ (
      mount.querySelector('.panel__header input[type="search"]')
    );
    expect(input).not.toBeNull();
    expect(input?.placeholder).toBe('Search…');
  });

  test('filters epics by title', async () => {
    const { mount, view } = createEpicsHarness([
      { id: 'UI-50', title: 'Table ergonomics', issue_type: 'epic' },
      { id: 'UI-51', title: 'Keyboard navigation', issue_type: 'epic' }
    ]);
    await view.load();

    await typeSearch(mount, 'keyboard');

    expect(visibleEpicIds(mount)).toEqual(['UI-51']);
  });

  test('filters epics by id', async () => {
    const { mount, view } = createEpicsHarness([
      { id: 'UI-50', title: 'Table ergonomics', issue_type: 'epic' },
      { id: 'UI-51', title: 'Keyboard navigation', issue_type: 'epic' }
    ]);
    await view.load();

    await typeSearch(mount, 'ui-50');

    expect(visibleEpicIds(mount)).toEqual(['UI-50']);
  });

  test('keeps the search input while filtering', async () => {
    const { mount, view } = createEpicsHarness([
      { id: 'UI-50', title: 'Table ergonomics', issue_type: 'epic' }
    ]);
    await view.load();

    await typeSearch(mount, 'table');

    const input = /** @type {HTMLInputElement} */ (
      mount.querySelector('input[type="search"]')
    );
    expect(input.value).toBe('table');
  });

  test('matches child issues by title', async () => {
    const { mount, view, seedSearchList } = createEpicsHarness([
      { id: 'UI-50', title: 'Table ergonomics', issue_type: 'epic' },
      { id: 'UI-51', title: 'Keyboard navigation', issue_type: 'epic' }
    ]);
    await view.load();
    seedSearchList([
      { id: 'UI-60', title: 'Resize columns', status: 'open', parent: 'UI-50' },
      { id: 'UI-61', title: 'Arrow keys', status: 'open', parent: 'UI-51' }
    ]);

    await typeSearch(mount, 'arrow');

    expect(visibleEpicIds(mount)).toEqual(['UI-51']);
    expect(visibleRowTitles(mount)).toEqual(['Arrow keys']);
  });

  test('matches child issues by id', async () => {
    const { mount, view, seedSearchList } = createEpicsHarness([
      { id: 'UI-50', title: 'Table ergonomics', issue_type: 'epic' }
    ]);
    await view.load();
    seedSearchList([
      { id: 'UI-60', title: 'Resize columns', status: 'open', parent: 'UI-50' }
    ]);

    await typeSearch(mount, 'ui-60');

    expect(visibleEpicIds(mount)).toEqual(['UI-50']);
    expect(visibleRowTitles(mount)).toEqual(['Resize columns']);
  });

  test('matches closed child issues', async () => {
    const { mount, view, seedSearchList } = createEpicsHarness([
      { id: 'UI-50', title: 'Table ergonomics', issue_type: 'epic' }
    ]);
    await view.load();
    seedSearchList(
      [
        {
          id: 'UI-62',
          title: 'Old spike',
          status: 'closed',
          parent: 'UI-50'
        }
      ],
      'epics:search-closed'
    );

    await typeSearch(mount, 'spike');

    expect(visibleEpicIds(mount)).toEqual(['UI-50']);
    expect(visibleRowTitles(mount)).toEqual(['Old spike']);
  });

  test('shows only the matching children of an epic', async () => {
    const { mount, view, seedSearchList } = createEpicsHarness([
      { id: 'UI-50', title: 'Table ergonomics', issue_type: 'epic' }
    ]);
    await view.load();
    seedSearchList([
      { id: 'UI-60', title: 'Resize columns', status: 'open', parent: 'UI-50' },
      { id: 'UI-63', title: 'Sort columns', status: 'open', parent: 'UI-50' }
    ]);

    await typeSearch(mount, 'resize');

    expect(visibleRowTitles(mount)).toEqual(['Resize columns']);
  });

  test('shows all children when the epic itself matches', async () => {
    const { mount, view, seedSearchList } = createEpicsHarness([
      { id: 'UI-50', title: 'Table ergonomics', issue_type: 'epic' }
    ]);
    await view.load();
    seedSearchList([
      { id: 'UI-60', title: 'Resize columns', status: 'open', parent: 'UI-50' },
      { id: 'UI-63', title: 'Sort columns', status: 'open', parent: 'UI-50' }
    ]);

    await typeSearch(mount, 'ergonomics');

    expect(visibleRowTitles(mount)).toEqual(['Resize columns', 'Sort columns']);
  });

  test('reports when nothing matches the search', async () => {
    const { mount, view, seedSearchList } = createEpicsHarness([
      { id: 'UI-50', title: 'Table ergonomics', issue_type: 'epic' }
    ]);
    await view.load();
    seedSearchList([
      { id: 'UI-60', title: 'Resize columns', status: 'open', parent: 'UI-50' }
    ]);

    await typeSearch(mount, 'nothing here');

    expect(visibleEpicIds(mount)).toEqual([]);
    expect(mount.textContent).toContain('No matching epics or issues.');
  });

  test('reports an empty epics list without a search', async () => {
    const { mount, view } = createEpicsHarness([]);

    await view.load();

    expect(mount.textContent).toContain('No epics found.');
  });

  test('persists the search term', async () => {
    const { mount, view } = createEpicsHarness([
      { id: 'UI-50', title: 'Table ergonomics', issue_type: 'epic' }
    ]);
    await view.load();

    await typeSearch(mount, 'table');

    expect(window.localStorage.getItem('beads-ui.epics.search')).toBe('table');
  });

  test('restores the persisted search term', async () => {
    window.localStorage.setItem('beads-ui.epics.search', 'keyboard');

    const { mount, view } = createEpicsHarness([
      { id: 'UI-50', title: 'Table ergonomics', issue_type: 'epic' },
      { id: 'UI-51', title: 'Keyboard navigation', issue_type: 'epic' }
    ]);
    await view.load();

    const input = /** @type {HTMLInputElement} */ (
      mount.querySelector('input[type="search"]')
    );
    expect(input.value).toBe('keyboard');
    expect(visibleEpicIds(mount)).toEqual(['UI-51']);
  });

  test('expands the first matching epic', async () => {
    window.localStorage.setItem('beads-ui.epics.search', 'keyboard');
    const { mount, view } = createEpicsHarness([
      { id: 'UI-50', title: 'Table ergonomics', issue_type: 'epic' },
      { id: 'UI-51', title: 'Keyboard navigation', issue_type: 'epic' }
    ]);

    await view.load();

    const header = /** @type {HTMLElement} */ (
      mount.querySelector('.epic-group[data-epic-id="UI-51"] .epic-header')
    );
    expect(header.getAttribute('aria-expanded')).toBe('true');
  });
});
