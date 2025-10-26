import { describe, expect, test } from 'vitest';
import { createIssuesStore } from '../data/issues-store.js';
import { createSubscriptionStore } from '../data/subscriptions-store.js';
import { createListView } from './list.js';

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
    const issuesStore = createIssuesStore();
    const subscriptions = createSubscriptionStore(async () => {});
    // subscribe tab:issues → all-issues
    await subscriptions.subscribeList('tab:issues', { type: 'all-issues' });
    // push membership and entities
    subscriptions._applyDelta('all-issues', {
      added: issues.map((i) => i.id),
      updated: [],
      removed: []
    });
    issuesStore._applyEnvelope({
      topic: 'issues',
      revision: 1,
      snapshot: true,
      added: issues,
      updated: [],
      removed: []
    });

    const view = createListView(
      mount,
      async () => [],
      (hash) => {
        window.location.hash = hash;
      },
      undefined,
      issuesStore,
      subscriptions
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
    const issuesStore = createIssuesStore();
    const subscriptions = createSubscriptionStore(async () => {});
    await subscriptions.subscribeList('tab:issues', { type: 'all-issues' });
    subscriptions._applyDelta('all-issues', {
      added: issues.map((i) => i.id),
      updated: [],
      removed: []
    });
    issuesStore._applyEnvelope({
      topic: 'issues',
      revision: 1,
      snapshot: true,
      added: issues,
      updated: [],
      removed: []
    });
    const view = createListView(
      mount,
      async () => [],
      undefined,
      undefined,
      issuesStore,
      subscriptions
    );
    await view.load();
    const select = /** @type {HTMLSelectElement} */ (
      mount.querySelector('select')
    );
    const input = /** @type {HTMLInputElement} */ (
      mount.querySelector('input[type="search"]')
    );

    // Filter by status
    select.value = 'open';
    select.dispatchEvent(new Event('change'));
    await Promise.resolve();
    expect(mount.querySelectorAll('tr.issue-row').length).toBe(1);

    // Search filters further
    select.value = 'all';
    select.dispatchEvent(new Event('change'));
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
    const issuesStore = createIssuesStore();
    const subscriptions = createSubscriptionStore(async () => {});
    await subscriptions.subscribeList('tab:issues', { type: 'all-issues' });
    subscriptions._applyDelta('all-issues', {
      added: issues.map((i) => i.id),
      updated: [],
      removed: []
    });
    issuesStore._applyEnvelope({
      topic: 'issues',
      revision: 1,
      snapshot: true,
      added: issues,
      updated: [],
      removed: []
    });
    const view = createListView(
      mount,
      async () => [],
      undefined,
      undefined,
      issuesStore,
      subscriptions
    );
    await view.load();

    // Initially shows all
    expect(mount.querySelectorAll('tr.issue-row').length).toBe(4);

    const typeSelect = /** @type {HTMLSelectElement} */ (
      mount.querySelector('select[aria-label="Filter by type"]')
    );
    // Select bug
    typeSelect.value = 'bug';
    typeSelect.dispatchEvent(new Event('change'));
    await Promise.resolve();
    const bug_only = Array.from(mount.querySelectorAll('tr.issue-row')).map(
      (el) => el.getAttribute('data-issue-id') || ''
    );
    expect(bug_only).toEqual(['UI-1', 'UI-3']);

    // Switch to feature
    typeSelect.value = 'feature';
    typeSelect.dispatchEvent(new Event('change'));
    await Promise.resolve();
    const feature_only = Array.from(mount.querySelectorAll('tr.issue-row')).map(
      (el) => el.getAttribute('data-issue-id') || ''
    );
    expect(feature_only).toEqual(['UI-2']);

    // Combine with search while bug selected
    typeSelect.value = 'bug';
    typeSelect.dispatchEvent(new Event('change'));
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

    const issuesStore = createIssuesStore();
    const subscriptions = createSubscriptionStore(async () => {});
    await subscriptions.subscribeList('tab:issues', { type: 'all-issues' });
    // initial: all issues
    subscriptions._applyDelta('all-issues', {
      added: allIssues.map((i) => i.id),
      updated: [],
      removed: []
    });
    issuesStore._applyEnvelope({
      topic: 'issues',
      revision: 1,
      snapshot: true,
      added: allIssues,
      updated: [],
      removed: []
    });
    const view = createListView(
      mount,
      async () => [],
      undefined,
      undefined,
      issuesStore,
      subscriptions
    );
    await view.load();
    const statusSelect = /** @type {HTMLSelectElement} */ (
      mount.querySelector('select')
    );
    statusSelect.value = 'ready';
    statusSelect.dispatchEvent(new Event('change'));
    // switch subscription key and apply ready membership
    await subscriptions.subscribeList('tab:issues', { type: 'ready-issues' });
    subscriptions._applyDelta('ready-issues', {
      added: readyIssues.map((i) => i.id),
      updated: [],
      removed: []
    });
    await view.load();

    // Apply type filter (feature)
    const typeSelect = /** @type {HTMLSelectElement} */ (
      mount.querySelector('select[aria-label="Filter by type"]')
    );
    typeSelect.value = 'feature';
    typeSelect.dispatchEvent(new Event('change'));
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

    const issuesStore = createIssuesStore();
    const subscriptions = createSubscriptionStore(async () => {});
    await subscriptions.subscribeList('tab:issues', { type: 'all-issues' });
    subscriptions._applyDelta('all-issues', {
      added: issues.map((i) => i.id),
      updated: [],
      removed: []
    });
    issuesStore._applyEnvelope({
      topic: 'issues',
      revision: 1,
      snapshot: true,
      added: issues,
      updated: [],
      removed: []
    });
    const view = createListView(
      mount,
      async () => [],
      undefined,
      store,
      issuesStore,
      subscriptions
    );
    await view.load();

    // Only bug issues visible
    const rows = Array.from(mount.querySelectorAll('tr.issue-row')).map(
      (el) => el.getAttribute('data-issue-id') || ''
    );
    expect(rows).toEqual(['UI-1', 'UI-3']);

    const typeSelect = /** @type {HTMLSelectElement} */ (
      mount.querySelector('select[aria-label="Filter by type"]')
    );
    expect(typeSelect.value).toBe('bug');
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

    const issuesStore = createIssuesStore();
    const subscriptions = createSubscriptionStore(async () => {});
    await subscriptions.subscribeList('tab:issues', { type: 'all-issues' });
    subscriptions._applyDelta('all-issues', {
      added: allIssues.map((i) => i.id),
      updated: [],
      removed: []
    });
    issuesStore._applyEnvelope({
      topic: 'issues',
      revision: 1,
      snapshot: true,
      added: allIssues,
      updated: [],
      removed: []
    });
    const view = createListView(
      mount,
      async () => [],
      undefined,
      undefined,
      issuesStore,
      subscriptions
    );
    await view.load();
    expect(mount.querySelectorAll('tr.issue-row').length).toBe(2);

    const select = /** @type {HTMLSelectElement} */ (
      mount.querySelector('select')
    );
    select.value = 'ready';
    select.dispatchEvent(new Event('change'));
    await subscriptions.subscribeList('tab:issues', { type: 'ready-issues' });
    subscriptions._applyDelta('ready-issues', {
      added: readyIssues.map((i) => i.id),
      updated: [],
      removed: []
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

    const issuesStore = createIssuesStore();
    const subscriptions = createSubscriptionStore(async () => {});
    await subscriptions.subscribeList('tab:issues', { type: 'all-issues' });
    subscriptions._applyDelta('all-issues', {
      added: allIssues.map((i) => i.id),
      updated: [],
      removed: []
    });
    issuesStore._applyEnvelope({
      topic: 'issues',
      revision: 1,
      snapshot: true,
      added: allIssues,
      updated: [],
      removed: []
    });
    const view = createListView(
      mount,
      async () => [],
      undefined,
      undefined,
      issuesStore,
      subscriptions
    );
    await view.load();
    expect(mount.querySelectorAll('tr.issue-row').length).toBe(2);

    const select = /** @type {HTMLSelectElement} */ (
      mount.querySelector('select')
    );

    // Switch to ready (subscription now maps to ready-issues)
    select.value = 'ready';
    select.dispatchEvent(new Event('change'));
    await subscriptions.subscribeList('tab:issues', { type: 'ready-issues' });
    subscriptions._applyDelta('ready-issues', {
      added: readyIssues.map((i) => i.id),
      updated: [],
      removed: []
    });
    await view.load();
    expect(mount.querySelectorAll('tr.issue-row').length).toBe(1);

    // Switch back to all; view should compose from all-issues membership
    select.value = 'all';
    select.dispatchEvent(new Event('change'));
    await subscriptions.subscribeList('tab:issues', { type: 'all-issues' });
    subscriptions._applyDelta('all-issues', {
      added: allIssues.map((i) => i.id),
      updated: [],
      removed: []
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
      state: { selected_id: null, filters: { status: 'open', search: 'ga' } },
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

    const issuesStore = createIssuesStore();
    const subscriptions = createSubscriptionStore(async () => {});
    await subscriptions.subscribeList('tab:issues', { type: 'all-issues' });
    subscriptions._applyDelta('all-issues', {
      added: issues.map((i) => i.id),
      updated: [],
      removed: []
    });
    issuesStore._applyEnvelope({
      topic: 'issues',
      revision: 1,
      snapshot: true,
      added: issues,
      updated: [],
      removed: []
    });
    const view = createListView(
      mount,
      async () => [],
      undefined,
      store,
      issuesStore,
      subscriptions
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
    const select = /** @type {HTMLSelectElement} */ (
      mount.querySelector('select')
    );
    const input = /** @type {HTMLInputElement} */ (
      mount.querySelector('input[type="search"]')
    );
    expect(select.value).toBe('open');
    expect(input.value).toBe('ga');
  });
});
