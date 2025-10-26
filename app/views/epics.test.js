import { describe, expect, test, vi } from 'vitest';
import { createIssuesStore } from '../data/issues-store.js';
import {
  createSubscriptionStore,
  subKeyOf
} from '../data/subscriptions-store.js';
import { createEpicsView } from './epics.js';

describe('views/epics', () => {
  test('loads groups from store and expands to show non-closed children, navigates on click', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));
    const data = {
      updateIssue: vi.fn(),
      getIssue: vi.fn(async (id) => ({ id }))
    };
    const issuesStore = createIssuesStore();
    const subscriptions = createSubscriptionStore(async () => {});
    // Seed issues snapshot: epic + children entities
    issuesStore._applyEnvelope({
      topic: 'issues',
      revision: 1,
      snapshot: true,
      added: [
        {
          id: 'UI-1',
          title: 'Epic One',
          issue_type: 'epic',
          dependents: [{ id: 'UI-2' }, { id: 'UI-3' }]
        },
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
      ],
      updated: [],
      removed: []
    });
    /** @type {string[]} */
    const navCalls = [];
    const view = createEpicsView(
      mount,
      /** @type {any} */ (data),
      (id) => navCalls.push(id),
      issuesStore,
      subscriptions
    );
    await view.load();
    // Simulate server sending children membership for epic UI-1
    const key = subKeyOf({
      type: 'issues-for-epic',
      params: { epic_id: 'UI-1' }
    });
    subscriptions._applyDelta(key, {
      added: ['UI-2', 'UI-3'],
      updated: [],
      removed: []
    });
    await view.load();
    const header = mount.querySelector('.epic-header');
    expect(header).not.toBeNull();
    // After expansion, only non-closed child should be present
    const rows = mount.querySelectorAll('tr.epic-row');
    expect(rows.length).toBe(1);
    rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(navCalls[0]).toBe('UI-2');
  });

  test('sorts children by priority then updated_at', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));
    const data = {
      updateIssue: vi.fn(),
      getIssue: vi.fn(async (id) => ({ id }))
    };
    const issuesStore = createIssuesStore();
    const subscriptions = createSubscriptionStore(async () => {});
    issuesStore._applyEnvelope({
      topic: 'issues',
      revision: 1,
      snapshot: true,
      added: [
        {
          id: 'UI-10',
          title: 'Epic Sort',
          issue_type: 'epic',
          dependents: [{ id: 'UI-11' }, { id: 'UI-12' }, { id: 'UI-13' }]
        },
        {
          id: 'UI-11',
          title: 'Low priority, newest within p1',
          status: 'open',
          priority: 1,
          issue_type: 'task',
          updated_at: '2025-10-22T10:00:00.000Z'
        },
        {
          id: 'UI-12',
          title: 'Low priority, older',
          status: 'open',
          priority: 1,
          issue_type: 'task',
          updated_at: '2025-10-20T10:00:00.000Z'
        },
        {
          id: 'UI-13',
          title: 'Higher priority number (lower precedence)',
          status: 'open',
          priority: 2,
          issue_type: 'task',
          updated_at: '2025-10-23T10:00:00.000Z'
        }
      ],
      updated: [],
      removed: []
    });
    const view = createEpicsView(
      mount,
      /** @type {any} */ (data),
      () => {},
      issuesStore,
      subscriptions
    );
    await view.load();
    const key = subKeyOf({
      type: 'issues-for-epic',
      params: { epic_id: 'UI-10' }
    });
    subscriptions._applyDelta(key, {
      added: ['UI-11', 'UI-12', 'UI-13'],
      updated: [],
      removed: []
    });
    await view.load();
    const rows = Array.from(mount.querySelectorAll('tr.epic-row'));
    const ids = rows.map((r) =>
      /** @type {HTMLElement} */ (
        r.querySelector('td.mono')
      )?.textContent?.trim()
    );
    expect(ids).toEqual(['#11', '#12', '#13']);
  });

  test('clicking inputs/selects inside a row does not navigate', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));
    const data = {
      updateIssue: vi.fn(),
      getIssue: vi.fn(async (id) => ({ id }))
    };
    const issuesStore = createIssuesStore();
    const subscriptions = createSubscriptionStore(async () => {});
    issuesStore._applyEnvelope({
      topic: 'issues',
      revision: 1,
      snapshot: true,
      added: [
        {
          id: 'UI-20',
          title: 'Epic Click Guard',
          issue_type: 'epic',
          dependents: [{ id: 'UI-21' }]
        },
        {
          id: 'UI-21',
          title: 'Editable',
          status: 'open',
          priority: 2,
          issue_type: 'task',
          updated_at: '2025-10-21T10:00:00.000Z'
        }
      ],
      updated: [],
      removed: []
    });
    /** @type {string[]} */
    const navCalls = [];
    const view = createEpicsView(
      mount,
      /** @type {any} */ (data),
      (id) => navCalls.push(id),
      issuesStore,
      subscriptions
    );
    await view.load();
    // Membership for epic
    const key = subKeyOf({
      type: 'issues-for-epic',
      params: { epic_id: 'UI-20' }
    });
    subscriptions._applyDelta(key, {
      added: ['UI-21'],
      updated: [],
      removed: []
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
    const issuesStore = createIssuesStore();
    const subscriptions = createSubscriptionStore(async () => {});
    issuesStore._applyEnvelope({
      topic: 'issues',
      revision: 1,
      snapshot: true,
      added: [
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
        },
        {
          id: 'UI-42',
          title: 'Child',
          status: 'open',
          priority: 2,
          issue_type: 'task'
        }
      ],
      updated: [],
      removed: []
    });
    const view = createEpicsView(
      mount,
      /** @type {any} */ (data),
      () => {},
      issuesStore,
      subscriptions
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
    // Simulate server sending membership for the epic; then reload
    const key = subKeyOf({
      type: 'issues-for-epic',
      params: { epic_id: 'UI-41' }
    });
    subscriptions._applyDelta(key, {
      added: ['UI-42'],
      updated: [],
      removed: []
    });
    // Verify mapping, leave rendering verification to push fixtures (UI-158)
    expect(subscriptions.selectors.getIds('epic:UI-41')).toEqual(['UI-42']);
  });

  test('clicking the editable title does not navigate and enters edit mode', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));
    const data = {
      updateIssue: vi.fn(),
      getIssue: vi.fn(async (id) => ({ id }))
    };
    const issuesStore = createIssuesStore();
    const subscriptions = createSubscriptionStore(async () => {});
    issuesStore._applyEnvelope({
      topic: 'issues',
      revision: 1,
      snapshot: true,
      added: [
        {
          id: 'UI-30',
          title: 'Epic Title Click',
          issue_type: 'epic',
          dependents: [{ id: 'UI-31' }]
        },
        {
          id: 'UI-31',
          title: 'Clickable Title',
          status: 'open',
          priority: 2,
          issue_type: 'task'
        }
      ],
      updated: [],
      removed: []
    });
    /** @type {string[]} */
    const navCalls = [];
    const view = createEpicsView(
      mount,
      /** @type {any} */ (data),
      (id) => navCalls.push(id),
      issuesStore,
      subscriptions
    );
    await view.load();
    const key = subKeyOf({
      type: 'issues-for-epic',
      params: { epic_id: 'UI-30' }
    });
    subscriptions._applyDelta(key, {
      added: ['UI-31'],
      updated: [],
      removed: []
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
});
