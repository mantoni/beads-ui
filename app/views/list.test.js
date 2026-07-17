import { describe, expect, test } from 'vitest';
import { createSubscriptionIssueStore } from '../data/subscription-issue-store.js';
import { createListView } from './list.js';

/**
 * Helper to toggle a filter option in a dropdown.
 *
 * @param {HTMLElement} mount - The container element
 * @param {number} dropdownIndex - 0 = status, 1 = types
 * @param {string} optionText - Text to match in the option label
 */
function toggleFilter(mount, dropdownIndex, optionText) {
  const dropdowns = mount.querySelectorAll('.filter-dropdown');
  const dropdown = dropdowns[dropdownIndex];
  // Open the dropdown
  const trigger = /** @type {HTMLButtonElement} */ (
    dropdown.querySelector('.filter-dropdown__trigger')
  );
  trigger.click();
  // Find and click the checkbox
  const option = Array.from(
    dropdown.querySelectorAll('.filter-dropdown__option')
  ).find((opt) => opt.textContent?.includes(optionText));
  const checkbox = /** @type {HTMLInputElement} */ (
    option?.querySelector('input[type="checkbox"]')
  );
  checkbox.click();
}

/**
 * Check if a filter option is checked in a dropdown.
 *
 * @param {HTMLElement} mount - The container element
 * @param {number} dropdownIndex - 0 = status, 1 = types
 * @param {string} optionText - Text to match in the option label
 * @returns {boolean}
 */
function isFilterChecked(mount, dropdownIndex, optionText) {
  const dropdowns = mount.querySelectorAll('.filter-dropdown');
  const dropdown = dropdowns[dropdownIndex];
  const option = Array.from(
    dropdown.querySelectorAll('.filter-dropdown__option')
  ).find((opt) => opt.textContent?.includes(optionText));
  const checkbox = /** @type {HTMLInputElement} */ (
    option?.querySelector('input[type="checkbox"]')
  );
  return checkbox?.checked ?? false;
}

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

describe('views/list', () => {
  test('renders issues from push stores and navigates on row click', async () => {
    document.body.innerHTML = '<aside id="mount" class="panel"></aside>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
    const issues = [
      {
        id: 'UI-1',
        title: 'One',
        status: 'open',
        priority: 1,
        issue_type: 'task'
      },
      {
        id: 'UI-2',
        title: 'Two',
        status: 'closed',
        priority: 2,
        issue_type: 'bug'
      }
    ];
    const issueStores = createTestIssueStores();
    issueStores.getStore('tab:issues').applyPush({
      type: 'snapshot',
      id: 'tab:issues',
      revision: 1,
      issues
    });

    const view = createListView(
      mount,
      async () => [],
      (hash) => {
        window.location.hash = hash;
      },
      undefined,
      undefined,
      issueStores
    );
    await view.load();
    const rows = mount.querySelectorAll('tr.issue-row');
    expect(rows.length).toBe(2);

    // badge present
    const badges = mount.querySelectorAll('.type-badge');
    expect(badges.length).toBeGreaterThanOrEqual(2);

    const first = /** @type {HTMLElement} */ (rows[0]);
    first.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(window.location.hash).toBe('#/issues?issue=UI-1');
  });

  test('filters by status and search', async () => {
    document.body.innerHTML = '<aside id="mount" class="panel"></aside>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
    const issues = [
      { id: 'UI-1', title: 'Alpha', status: 'open', priority: 1 },
      { id: 'UI-2', title: 'Beta', status: 'in_progress', priority: 2 },
      { id: 'UI-3', title: 'Gamma', status: 'closed', priority: 3 }
    ];
    const issueStores = createTestIssueStores();
    issueStores.getStore('tab:issues').applyPush({
      type: 'snapshot',
      id: 'tab:issues',
      revision: 1,
      issues
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
    const input = /** @type {HTMLInputElement} */ (
      mount.querySelector('input[type="search"]')
    );

    // Filter by status using dropdown checkbox
    toggleFilter(mount, 0, 'Open');
    await Promise.resolve();
    expect(mount.querySelectorAll('tr.issue-row').length).toBe(1);

    // Clear status filter and search
    toggleFilter(mount, 0, 'Open'); // toggle off to show all
    await Promise.resolve();
    input.value = 'ga';
    input.dispatchEvent(new Event('input'));
    const visible = Array.from(mount.querySelectorAll('tr.issue-row')).map(
      (el) => ({
        id: el.getAttribute('data-issue-id') || '',
        text: el.textContent || ''
      })
    );
    expect(visible.length).toBe(1);
    expect(visible[0].id).toBe('UI-3');
    expect(visible[0].text.toLowerCase()).toContain('gamma');
  });

  test('filters by issue type and combines with search', async () => {
    document.body.innerHTML = '<aside id="mount" class="panel"></aside>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
    const issues = [
      {
        id: 'UI-1',
        title: 'Alpha',
        status: 'open',
        priority: 1,
        issue_type: 'bug'
      },
      {
        id: 'UI-2',
        title: 'Beta',
        status: 'open',
        priority: 2,
        issue_type: 'feature'
      },
      {
        id: 'UI-3',
        title: 'Gamma',
        status: 'open',
        priority: 3,
        issue_type: 'bug'
      },
      {
        id: 'UI-4',
        title: 'Delta',
        status: 'open',
        priority: 2,
        issue_type: 'task'
      }
    ];
    const issueStores = createTestIssueStores();
    issueStores.getStore('tab:issues').applyPush({
      type: 'snapshot',
      id: 'tab:issues',
      revision: 1,
      issues
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

    // Initially shows all
    expect(mount.querySelectorAll('tr.issue-row').length).toBe(4);

    // Select bug using dropdown
    toggleFilter(mount, 1, 'Bug');
    await Promise.resolve();
    const bug_only = Array.from(mount.querySelectorAll('tr.issue-row')).map(
      (el) => el.getAttribute('data-issue-id') || ''
    );
    expect(bug_only).toEqual(['UI-1', 'UI-3']);

    // Toggle off bug, toggle on feature
    toggleFilter(mount, 1, 'Bug');
    toggleFilter(mount, 1, 'Feature');
    await Promise.resolve();
    const feature_only = Array.from(mount.querySelectorAll('tr.issue-row')).map(
      (el) => el.getAttribute('data-issue-id') || ''
    );
    expect(feature_only).toEqual(['UI-2']);

    // Toggle off feature, toggle on bug, combine with search
    toggleFilter(mount, 1, 'Feature');
    toggleFilter(mount, 1, 'Bug');
    const input = /** @type {HTMLInputElement} */ (
      mount.querySelector('input[type="search"]')
    );
    input.value = 'ga';
    input.dispatchEvent(new Event('input'));
    await Promise.resolve();
    const filtered = Array.from(mount.querySelectorAll('tr.issue-row')).map(
      (el) => el.getAttribute('data-issue-id') || ''
    );
    expect(filtered).toEqual(['UI-3']);
  });

  test('applies type filters after Ready reload', async () => {
    document.body.innerHTML = '<aside id="mount" class="panel"></aside>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));

    const allIssues = [
      {
        id: 'UI-1',
        title: 'One',
        status: 'open',
        priority: 1,
        issue_type: 'task'
      },
      {
        id: 'UI-2',
        title: 'Two',
        status: 'open',
        priority: 2,
        issue_type: 'feature'
      },
      {
        id: 'UI-3',
        title: 'Three',
        status: 'open',
        priority: 2,
        issue_type: 'bug'
      }
    ];
    const readyIssues = [
      {
        id: 'UI-2',
        title: 'Two',
        status: 'open',
        priority: 2,
        issue_type: 'feature'
      },
      {
        id: 'UI-3',
        title: 'Three',
        status: 'open',
        priority: 2,
        issue_type: 'bug'
      }
    ];

    const issueStores = createTestIssueStores();
    issueStores.getStore('tab:issues').applyPush({
      type: 'snapshot',
      id: 'tab:issues',
      revision: 1,
      issues: allIssues
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
    const statusSelect = /** @type {HTMLSelectElement} */ (
      mount.querySelector('select')
    );
    statusSelect.value = 'ready';
    statusSelect.dispatchEvent(new Event('change'));
    // switch subscription key and apply ready membership
    issueStores.getStore('tab:issues').applyPush({
      type: 'snapshot',
      id: 'tab:issues',
      revision: 2,
      issues: readyIssues
    });
    await view.load();

    // Apply type filter (feature) using dropdown checkbox
    toggleFilter(mount, 1, 'Feature');
    await Promise.resolve();

    const rows = Array.from(mount.querySelectorAll('tr.issue-row')).map(
      (el) => el.getAttribute('data-issue-id') || ''
    );
    expect(rows).toEqual(['UI-2']);

    // No RPC calls expected; derived from stores
  });

  test('initializes type filter from store and reflects in controls', async () => {
    document.body.innerHTML = '<aside id="mount" class="panel"></aside>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));

    const issues = [
      {
        id: 'UI-1',
        title: 'Alpha',
        status: 'open',
        priority: 1,
        issue_type: 'bug'
      },
      {
        id: 'UI-2',
        title: 'Beta',
        status: 'open',
        priority: 2,
        issue_type: 'feature'
      },
      {
        id: 'UI-3',
        title: 'Gamma closed',
        status: 'closed',
        priority: 3,
        issue_type: 'bug'
      }
    ];

    /** @type {{ state: any, subs: ((s:any)=>void)[], getState: () => any, setState: (patch:any)=>void, subscribe: (fn:(s:any)=>void)=>()=>void }} */
    const store = {
      state: {
        selected_id: null,
        filters: { status: 'all', search: '', type: 'bug' }
      },
      subs: [],
      getState() {
        return this.state;
      },
      setState(patch) {
        this.state = {
          ...this.state,
          ...(patch || {}),
          filters: { ...this.state.filters, ...(patch.filters || {}) }
        };
        for (const fn of this.subs) {
          fn(this.state);
        }
      },
      subscribe(fn) {
        this.subs.push(fn);
        return () => {
          this.subs = this.subs.filter((f) => f !== fn);
        };
      }
    };

    const issueStores = createTestIssueStores();
    issueStores.getStore('tab:issues').applyPush({
      type: 'snapshot',
      id: 'tab:issues',
      revision: 1,
      issues
    });
    const view = createListView(
      mount,
      async () => [],
      undefined,
      store,
      undefined,
      issueStores
    );
    await view.load();

    // Only bug issues visible
    const rows = Array.from(mount.querySelectorAll('tr.issue-row')).map(
      (el) => el.getAttribute('data-issue-id') || ''
    );
    expect(rows).toEqual(['UI-1', 'UI-3']);

    // Bug checkbox should be checked in the types dropdown
    expect(isFilterChecked(mount, 1, 'Bug')).toBe(true);
  });

  test('ready filter via select composes from push membership', async () => {
    document.body.innerHTML = '<aside id="mount" class="panel"></aside>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));

    const allIssues = [
      { id: 'UI-1', title: 'One', status: 'open', priority: 1 },
      { id: 'UI-2', title: 'Two', status: 'open', priority: 2 }
    ];
    const readyIssues = [
      { id: 'UI-2', title: 'Two', status: 'open', priority: 2 }
    ];

    const issueStores = createTestIssueStores();
    issueStores.getStore('tab:issues').applyPush({
      type: 'snapshot',
      id: 'tab:issues',
      revision: 1,
      issues: allIssues
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
    expect(mount.querySelectorAll('tr.issue-row').length).toBe(2);

    const select = /** @type {HTMLSelectElement} */ (
      mount.querySelector('select')
    );
    select.value = 'ready';
    select.dispatchEvent(new Event('change'));
    issueStores.getStore('tab:issues').applyPush({
      type: 'snapshot',
      id: 'tab:issues',
      revision: 2,
      issues: readyIssues
    });
    await view.load();
    expect(mount.querySelectorAll('tr.issue-row').length).toBe(1);
  });

  test('switching ready → all reloads full list', async () => {
    document.body.innerHTML = '<aside id="mount" class="panel"></aside>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));

    const allIssues = [
      { id: 'UI-1', title: 'One', status: 'open', priority: 1 },
      { id: 'UI-2', title: 'Two', status: 'closed', priority: 2 }
    ];
    const readyIssues = [
      { id: 'UI-2', title: 'Two', status: 'closed', priority: 2 }
    ];

    // No RPC calls are made in push-only mode

    const issueStores = createTestIssueStores();
    issueStores.getStore('tab:issues').applyPush({
      type: 'snapshot',
      id: 'tab:issues',
      revision: 1,
      issues: allIssues
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
    expect(mount.querySelectorAll('tr.issue-row').length).toBe(2);

    const select = /** @type {HTMLSelectElement} */ (
      mount.querySelector('select')
    );

    // Switch to ready (subscription now maps to ready-issues)
    select.value = 'ready';
    select.dispatchEvent(new Event('change'));
    issueStores.getStore('tab:issues').applyPush({
      type: 'snapshot',
      id: 'tab:issues',
      revision: 2,
      issues: readyIssues
    });
    await view.load();
    expect(mount.querySelectorAll('tr.issue-row').length).toBe(1);

    // Switch back to all; view should compose from all-issues membership
    select.value = 'all';
    select.dispatchEvent(new Event('change'));
    issueStores.getStore('tab:issues').applyPush({
      type: 'snapshot',
      id: 'tab:issues',
      revision: 3,
      issues: allIssues
    });
    await view.load();
    expect(mount.querySelectorAll('tr.issue-row').length).toBe(2);

    // No RPC calls are expected in push-only model
  });

  test('applies persisted filters from store on initial load', async () => {
    document.body.innerHTML = '<aside id="mount" class="panel"></aside>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));

    const issues = [
      { id: 'UI-1', title: 'Alpha', status: 'open', priority: 1 },
      { id: 'UI-2', title: 'Gamma', status: 'open', priority: 2 },
      { id: 'UI-3', title: 'Gamma closed', status: 'closed', priority: 3 }
    ];

    /** @type {{ state: any, subs: ((s:any)=>void)[], getState: () => any, setState: (patch:any)=>void, subscribe: (fn:(s:any)=>void)=>()=>void }} */
    const store = {
      state: { selected_id: null, filters: { status: ['open'], search: 'ga' } },
      subs: [],
      getState() {
        return this.state;
      },
      setState(patch) {
        this.state = {
          ...this.state,
          ...(patch || {}),
          filters: { ...this.state.filters, ...(patch.filters || {}) }
        };
        for (const fn of this.subs) {
          fn(this.state);
        }
      },
      subscribe(fn) {
        this.subs.push(fn);
        return () => {
          this.subs = this.subs.filter((f) => f !== fn);
        };
      }
    };

    const issueStores = createTestIssueStores();
    issueStores.getStore('tab:issues').applyPush({
      type: 'snapshot',
      id: 'tab:issues',
      revision: 1,
      issues
    });
    const view = createListView(
      mount,
      async () => [],
      undefined,
      store,
      undefined,
      issueStores
    );
    await view.load();

    // Expect only UI-2 ("Gamma" open) to be visible
    const items = Array.from(mount.querySelectorAll('tr.issue-row')).map(
      (el) => ({
        id: el.getAttribute('data-issue-id') || '',
        text: el.textContent || ''
      })
    );
    expect(items.length).toBe(1);
    expect(items[0].id).toBe('UI-2');

    // Controls reflect persisted filters
    expect(isFilterChecked(mount, 0, 'Open')).toBe(true);
    const input = /** @type {HTMLInputElement} */ (
      mount.querySelector('input[type="search"]')
    );
    expect(input.value).toBe('ga');
  });

  test('filters by multiple statuses with dropdown checkboxes', async () => {
    document.body.innerHTML = '<aside id="mount" class="panel"></aside>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
    const issues = [
      { id: 'UI-1', title: 'Alpha', status: 'open', priority: 1 },
      { id: 'UI-2', title: 'Beta', status: 'in_progress', priority: 2 },
      { id: 'UI-3', title: 'Gamma', status: 'closed', priority: 3 }
    ];
    const issueStores = createTestIssueStores();
    issueStores.getStore('tab:issues').applyPush({
      type: 'snapshot',
      id: 'tab:issues',
      revision: 1,
      issues
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

    // Click Open checkbox to select it
    toggleFilter(mount, 0, 'Open');
    await Promise.resolve();

    // Should show only open issues
    let rows = Array.from(mount.querySelectorAll('tr.issue-row')).map(
      (el) => el.getAttribute('data-issue-id') || ''
    );
    expect(rows).toEqual(['UI-1']);

    // Click In progress checkbox to add it (multi-select)
    toggleFilter(mount, 0, 'In progress');
    await Promise.resolve();

    // Should show both open and in_progress
    rows = Array.from(mount.querySelectorAll('tr.issue-row')).map(
      (el) => el.getAttribute('data-issue-id') || ''
    );
    expect(rows).toEqual(['UI-1', 'UI-2']);
  });

  test('filters by multiple types with dropdown checkboxes', async () => {
    document.body.innerHTML = '<aside id="mount" class="panel"></aside>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
    const issues = [
      { id: 'UI-1', title: 'A', status: 'open', issue_type: 'bug' },
      { id: 'UI-2', title: 'B', status: 'open', issue_type: 'feature' },
      { id: 'UI-3', title: 'C', status: 'open', issue_type: 'task' },
      { id: 'UI-4', title: 'D', status: 'open', issue_type: 'epic' }
    ];
    const issueStores = createTestIssueStores();
    issueStores.getStore('tab:issues').applyPush({
      type: 'snapshot',
      id: 'tab:issues',
      revision: 1,
      issues
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

    // Click Bug checkbox
    toggleFilter(mount, 1, 'Bug');
    await Promise.resolve();

    let rows = Array.from(mount.querySelectorAll('tr.issue-row')).map(
      (el) => el.getAttribute('data-issue-id') || ''
    );
    expect(rows).toEqual(['UI-1']);

    // Click Feature checkbox to add it
    toggleFilter(mount, 1, 'Feature');
    await Promise.resolve();

    rows = Array.from(mount.querySelectorAll('tr.issue-row')).map(
      (el) => el.getAttribute('data-issue-id') || ''
    );
    expect(rows).toEqual(['UI-1', 'UI-2']);
  });

  test('clicking epic chevron toggles expanded state', async () => {
    document.body.innerHTML = '<aside id="mount" class="panel"></aside>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
    const stores = createTestIssueStores();
    stores.getStore('tab:issues').applyPush({
      type: 'snapshot',
      id: 'tab:issues',
      revision: 1,
      issues: [
        {
          id: 'X-1',
          title: 'Epic A',
          status: 'open',
          priority: 1,
          issue_type: 'epic'
        }
      ]
    });
    // Counters live in tab:epics (separate subscription backed by `bd epic status`)
    stores.getStore('tab:epics').applyPush({
      type: 'snapshot',
      id: 'tab:epics',
      revision: 1,
      issues: [{ id: 'X-1', total_children: 3, closed_children: 1 }]
    });
    const view = createListView(
      mount,
      async () => null,
      () => {},
      undefined,
      undefined,
      stores
    );
    await view.load();
    const chevron = mount.querySelector('[data-epic-id="X-1"] .epic-chevron');
    expect(chevron).toBeTruthy();
    expect(chevron?.getAttribute('aria-expanded')).toBe('false');
    /** @type {HTMLElement} */ (chevron).click();
    await Promise.resolve();
    expect(chevron?.getAttribute('aria-expanded')).toBe('true');
  });

  test('clicking epic chevron twice collapses (toggle is bidirectional)', async () => {
    document.body.innerHTML = '<aside id="mount" class="panel"></aside>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
    const stores = createTestIssueStores();
    stores.getStore('tab:issues').applyPush({
      type: 'snapshot',
      id: 'tab:issues',
      revision: 1,
      issues: [
        {
          id: 'X-1',
          title: 'Epic A',
          status: 'open',
          priority: 1,
          issue_type: 'epic'
        }
      ]
    });
    stores.getStore('tab:epics').applyPush({
      type: 'snapshot',
      id: 'tab:epics',
      revision: 1,
      issues: [{ id: 'X-1', total_children: 1, closed_children: 0 }]
    });
    // Seed children so the expand path has something to render.
    stores.getStore('detail:X-1').applyPush({
      type: 'snapshot',
      id: 'detail:X-1',
      revision: 1,
      issues: [
        {
          id: 'X-1',
          dependents: [
            {
              id: 'X-2',
              title: 'child',
              status: 'open',
              priority: 2,
              issue_type: 'task'
            }
          ]
        }
      ]
    });
    const view = createListView(
      mount,
      async () => null,
      () => {},
      undefined,
      undefined,
      stores
    );
    await view.load();

    const chevron = mount.querySelector('[data-epic-id="X-1"] .epic-chevron');
    expect(chevron).toBeTruthy();

    // Click 1: expand
    /** @type {HTMLElement} */ (chevron).click();
    await Promise.resolve();
    expect(chevron?.getAttribute('aria-expanded')).toBe('true');

    // Click 2: collapse
    /** @type {HTMLElement} */ (chevron).click();
    await Promise.resolve();
    expect(chevron?.getAttribute('aria-expanded')).toBe('false');
    // Child row no longer in DOM after collapse
    expect(mount.querySelector('[data-issue-id="X-2"]')).toBeFalsy();
  });

  test('epic row renders progress bar and hides child duplicates', async () => {
    document.body.innerHTML = '<aside id="mount" class="panel"></aside>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
    const stores = createTestIssueStores();
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
        // Child rows present in the flat list (should be hidden because parent is in list)
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
          status: 'closed',
          priority: 2,
          issue_type: 'task',
          parent: 'X-EPIC'
        },
        // Non-child top-level row (should remain visible)
        {
          id: 'X-4',
          title: 'Standalone',
          status: 'open',
          priority: 2,
          issue_type: 'task'
        }
      ]
    });
    // Counters live in tab:epics
    stores.getStore('tab:epics').applyPush({
      type: 'snapshot',
      id: 'tab:epics',
      revision: 1,
      issues: [{ id: 'X-EPIC', total_children: 2, closed_children: 1 }]
    });
    const view = createListView(
      mount,
      async () => null,
      () => {},
      undefined,
      undefined,
      stores
    );
    await view.load();

    // Epic row present with progress bar
    const epicRow = mount.querySelector('[data-issue-id="X-EPIC"]');
    expect(epicRow).toBeTruthy();
    expect(epicRow?.querySelector('progress')).toBeTruthy();
    expect(epicRow?.textContent).toContain('1/2');

    // Children X-2 and X-3 hidden from top-level (no rows with their IDs)
    expect(mount.querySelector('[data-issue-id="X-2"]')).toBeFalsy();
    expect(mount.querySelector('[data-issue-id="X-3"]')).toBeFalsy();

    // Standalone visible
    expect(mount.querySelector('[data-issue-id="X-4"]')).toBeTruthy();
  });

  test('deselecting all checkboxes shows all issues', async () => {
    document.body.innerHTML = '<aside id="mount" class="panel"></aside>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
    const issues = [
      { id: 'UI-1', title: 'A', status: 'open' },
      { id: 'UI-2', title: 'B', status: 'closed' }
    ];
    const issueStores = createTestIssueStores();
    issueStores.getStore('tab:issues').applyPush({
      type: 'snapshot',
      id: 'tab:issues',
      revision: 1,
      issues
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

    // Initially all shown
    expect(mount.querySelectorAll('tr.issue-row').length).toBe(2);

    // Click Open checkbox to filter
    toggleFilter(mount, 0, 'Open');
    await Promise.resolve();
    expect(mount.querySelectorAll('tr.issue-row').length).toBe(1);

    // Click Open checkbox again to deselect - should show all
    toggleFilter(mount, 0, 'Open');
    await Promise.resolve();
    expect(mount.querySelectorAll('tr.issue-row').length).toBe(2);
  });

  test('status filter applies to expanded children (expanded epic persists)', async () => {
    document.body.innerHTML = '<aside id="mount" class="panel"></aside>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
    const stores = createTestIssueStores();
    // Epic is open — would be filtered out by 'Closed' filter without the
    // expanded-epics-always-render rule. Test exercises both child filtering
    // AND the expanded-epic recovery branch in partitionForTree.
    stores.getStore('tab:issues').applyPush({
      type: 'snapshot',
      id: 'tab:issues',
      revision: 1,
      issues: [
        {
          id: 'X-EPIC',
          title: 'Epic',
          status: 'open',
          priority: 1,
          issue_type: 'epic'
        }
      ]
    });
    stores.getStore('tab:epics').applyPush({
      type: 'snapshot',
      id: 'tab:epics',
      revision: 1,
      issues: [{ id: 'X-EPIC', total_children: 2, closed_children: 1 }]
    });
    // Seed children into the epic's detail store
    // (selectEpicChildren reads `detail:${id}` and returns the entry whose id === epic_id, .dependents)
    stores.getStore('detail:X-EPIC').applyPush({
      type: 'snapshot',
      id: 'detail:X-EPIC',
      revision: 1,
      issues: [
        {
          id: 'X-EPIC',
          dependents: [
            {
              id: 'X-2',
              title: 'open child',
              status: 'open',
              priority: 2,
              issue_type: 'task'
            },
            {
              id: 'X-3',
              title: 'closed child',
              status: 'closed',
              priority: 2,
              issue_type: 'task'
            }
          ]
        }
      ]
    });
    const view = createListView(
      mount,
      async () => null,
      () => {},
      undefined,
      undefined,
      stores
    );
    await view.load();

    // Expand the epic
    /** @type {HTMLElement} */ (
      mount.querySelector('[data-epic-id="X-EPIC"] .epic-chevron')
    ).click();
    await Promise.resolve();

    // Both children visible initially
    expect(mount.querySelector('[data-issue-id="X-2"]')).toBeTruthy();
    expect(mount.querySelector('[data-issue-id="X-3"]')).toBeTruthy();

    // Apply Closed filter
    toggleFilter(mount, 0, 'Closed');
    await Promise.resolve();

    // Epic should still render (expanded epics always render — Key Decision)
    expect(mount.querySelector('[data-epic-id="X-EPIC"]')).toBeTruthy();
    // Open child hidden, closed child visible
    expect(mount.querySelector('[data-issue-id="X-2"]')).toBeFalsy();
    expect(mount.querySelector('[data-issue-id="X-3"]')).toBeTruthy();
  });

  test('non-expanded epic filtered out hides entirely (top-level filter still works)', async () => {
    document.body.innerHTML = '<aside id="mount" class="panel"></aside>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
    const stores = createTestIssueStores();
    stores.getStore('tab:issues').applyPush({
      type: 'snapshot',
      id: 'tab:issues',
      revision: 1,
      issues: [
        {
          id: 'X-EPIC',
          title: 'Epic',
          status: 'open',
          priority: 1,
          issue_type: 'epic'
        },
        {
          id: 'X-5',
          title: 'closed task',
          status: 'closed',
          priority: 2,
          issue_type: 'task'
        }
      ]
    });
    stores.getStore('tab:epics').applyPush({
      type: 'snapshot',
      id: 'tab:epics',
      revision: 1,
      issues: [{ id: 'X-EPIC', total_children: 1, closed_children: 0 }]
    });
    const view = createListView(
      mount,
      async () => null,
      () => {},
      undefined,
      undefined,
      stores
    );
    await view.load();

    // Apply Closed filter — open epic was never expanded, so should be filtered out
    toggleFilter(mount, 0, 'Closed');
    await Promise.resolve();

    expect(mount.querySelector('[data-epic-id="X-EPIC"]')).toBeFalsy();
    expect(mount.querySelector('[data-issue-id="X-5"]')).toBeTruthy();
  });

  test('no auto-expand on initial load', async () => {
    document.body.innerHTML = '<aside id="mount" class="panel"></aside>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
    const stores = createTestIssueStores();
    stores.getStore('tab:issues').applyPush({
      type: 'snapshot',
      id: 'tab:issues',
      revision: 1,
      issues: [
        {
          id: 'X-EPIC',
          title: 'E',
          status: 'open',
          priority: 1,
          issue_type: 'epic'
        }
      ]
    });
    stores.getStore('tab:epics').applyPush({
      type: 'snapshot',
      id: 'tab:epics',
      revision: 1,
      issues: [{ id: 'X-EPIC', total_children: 1, closed_children: 0 }]
    });
    const view = createListView(
      mount,
      async () => null,
      () => {},
      undefined,
      undefined,
      stores
    );
    await view.load();

    const chevron = mount.querySelector(
      '[data-epic-id="X-EPIC"] .epic-chevron'
    );
    expect(chevron?.getAttribute('aria-expanded')).toBe('false');
  });

  test('clicking epic title (not chevron) navigates instead of expanding', async () => {
    document.body.innerHTML = '<aside id="mount" class="panel"></aside>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
    const stores = createTestIssueStores();
    stores.getStore('tab:issues').applyPush({
      type: 'snapshot',
      id: 'tab:issues',
      revision: 1,
      issues: [
        {
          id: 'X-1',
          title: 'Epic A',
          status: 'open',
          priority: 1,
          issue_type: 'epic'
        }
      ]
    });
    stores.getStore('tab:epics').applyPush({
      type: 'snapshot',
      id: 'tab:epics',
      revision: 1,
      issues: [{ id: 'X-1', total_children: 1, closed_children: 0 }]
    });
    const view = createListView(
      mount,
      async () => null,
      () => {},
      undefined,
      undefined,
      stores
    );
    await view.load();

    // Title text uses a span (no inline edit on epic rows — title_renderer
    // emits a plain text span); clicking it should bubble to the row click
    // handler and navigate, NOT expand the epic.
    const titleText = mount.querySelector(
      '[data-issue-id="X-1"] .epic-title-text'
    );
    expect(titleText).toBeTruthy();
    const chevron = mount.querySelector('[data-issue-id="X-1"] .epic-chevron');
    expect(chevron?.getAttribute('aria-expanded')).toBe('false');

    // Click title — should NOT expand (chevron's click target is independent)
    /** @type {HTMLElement} */ (titleText).click();
    await Promise.resolve();
    expect(chevron?.getAttribute('aria-expanded')).toBe('false');
  });
});
