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

    // Filter by status using chip toggle
    const openChip = /** @type {HTMLButtonElement} */ (
      mount.querySelector('.filter-chip--open')
    );
    openChip.click();
    await Promise.resolve();
    expect(mount.querySelectorAll('tr.issue-row').length).toBe(1);

    // Clear status filter and search
    openChip.click(); // toggle off to show all
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

    const bugChip = /** @type {HTMLButtonElement} */ (
      mount.querySelector('.filter-chip--bug')
    );
    const featureChip = /** @type {HTMLButtonElement} */ (
      mount.querySelector('.filter-chip--feature')
    );
    // Select bug
    bugChip.click();
    await Promise.resolve();
    const bug_only = Array.from(mount.querySelectorAll('tr.issue-row')).map(
      (el) => el.getAttribute('data-issue-id') || ''
    );
    expect(bug_only).toEqual(['UI-1', 'UI-3']);

    // Toggle off bug, toggle on feature
    bugChip.click();
    featureChip.click();
    await Promise.resolve();
    const feature_only = Array.from(mount.querySelectorAll('tr.issue-row')).map(
      (el) => el.getAttribute('data-issue-id') || ''
    );
    expect(feature_only).toEqual(['UI-2']);

    // Toggle off feature, toggle on bug, combine with search
    featureChip.click();
    bugChip.click();
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

    // Apply type filter (feature) using toggle chip
    const featureChip = /** @type {HTMLButtonElement} */ (
      mount.querySelector('.filter-chip--feature')
    );
    featureChip.click();
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

    // Bug chip should be active
    const bugChip = /** @type {HTMLButtonElement} */ (
      mount.querySelector('.filter-chip--bug')
    );
    expect(bugChip.classList.contains('is-active')).toBe(true);
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
    const openChip = /** @type {HTMLButtonElement} */ (
      mount.querySelector('.filter-chip--open')
    );
    const input = /** @type {HTMLInputElement} */ (
      mount.querySelector('input[type="search"]')
    );
    expect(openChip.classList.contains('is-active')).toBe(true);
    expect(input.value).toBe('ga');
  });

  test('filters by multiple statuses with toggle chips', async () => {
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

    // Find status filter chips
    const openChip = mount.querySelector('.filter-chip--open');
    const inProgressChip = mount.querySelector('.filter-chip--in_progress');

    expect(openChip).not.toBeNull();
    expect(inProgressChip).not.toBeNull();

    // Click open chip to select it
    openChip?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    // Should show only open issues
    let rows = Array.from(mount.querySelectorAll('tr.issue-row')).map(
      (el) => el.getAttribute('data-issue-id') || ''
    );
    expect(rows).toEqual(['UI-1']);

    // Click in_progress chip to add it (multi-select)
    inProgressChip?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    // Should show both open and in_progress
    rows = Array.from(mount.querySelectorAll('tr.issue-row')).map(
      (el) => el.getAttribute('data-issue-id') || ''
    );
    expect(rows).toEqual(['UI-1', 'UI-2']);
  });

  test('filters by multiple types with toggle chips', async () => {
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

    // Find type filter chips
    const bugChip = mount.querySelector('.filter-chip--bug');
    const featureChip = mount.querySelector('.filter-chip--feature');

    expect(bugChip).not.toBeNull();
    expect(featureChip).not.toBeNull();

    // Click bug chip
    bugChip?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    let rows = Array.from(mount.querySelectorAll('tr.issue-row')).map(
      (el) => el.getAttribute('data-issue-id') || ''
    );
    expect(rows).toEqual(['UI-1']);

    // Click feature chip to add it
    featureChip?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    rows = Array.from(mount.querySelectorAll('tr.issue-row')).map(
      (el) => el.getAttribute('data-issue-id') || ''
    );
    expect(rows).toEqual(['UI-1', 'UI-2']);
  });

  test('deselecting all chips shows all issues', async () => {
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

    // Click open to filter
    const openChip = mount.querySelector('.filter-chip--open');
    openChip?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    expect(mount.querySelectorAll('tr.issue-row').length).toBe(1);

    // Click open again to deselect - should show all
    openChip?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    expect(mount.querySelectorAll('tr.issue-row').length).toBe(2);
  });
});
