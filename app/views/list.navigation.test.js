import { describe, expect, test } from 'vitest';
import { createIssuesStore } from '../data/issues-store.js';
import { createSubscriptionStore } from '../data/subscriptions-store.js';
import { createListView } from './list.js';

describe('views/list navigation', () => {
  test('ArrowDown moves focus to same column in next row', async () => {
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
        status: 'open',
        priority: 2,
        issue_type: 'bug'
      },
      {
        id: 'UI-3',
        title: 'Three',
        status: 'open',
        priority: 3,
        issue_type: 'feature'
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

    // Focus Title cell (3rd column) in first row
    const first_title = /** @type {HTMLElement} */ (
      mount.querySelector(
        'tbody tr.issue-row:nth-child(1) td:nth-child(3) .editable'
      )
    );
    first_title.focus();
    expect(document.activeElement).toBe(first_title);

    // Press ArrowDown → expect Title cell in next row to gain focus
    first_title.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })
    );

    const second_title = /** @type {HTMLElement} */ (
      mount.querySelector(
        'tbody tr.issue-row:nth-child(2) td:nth-child(3) .editable'
      )
    );
    expect(document.activeElement).toBe(second_title);
  });

  test('ArrowUp moves focus to same column in previous row', async () => {
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
        status: 'open',
        priority: 2,
        issue_type: 'bug'
      },
      {
        id: 'UI-3',
        title: 'Three',
        status: 'open',
        priority: 3,
        issue_type: 'feature'
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

    const third_title = /** @type {HTMLElement} */ (
      mount.querySelector(
        'tbody tr.issue-row:nth-child(3) td:nth-child(3) .editable'
      )
    );
    third_title.focus();
    third_title.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })
    );

    const second_title = /** @type {HTMLElement} */ (
      mount.querySelector(
        'tbody tr.issue-row:nth-child(2) td:nth-child(3) .editable'
      )
    );
    expect(document.activeElement).toBe(second_title);
  });

  test('does not intercept inside select controls', async () => {
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
        status: 'open',
        priority: 2,
        issue_type: 'bug'
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

    // Focus Status select (4th column) in first row
    const status_select = /** @type {HTMLSelectElement} */ (
      mount.querySelector(
        'tbody tr.issue-row:nth-child(1) td:nth-child(4) select'
      )
    );
    status_select.focus();
    status_select.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })
    );

    // Expect focus to remain on the same select (native behavior preserved)
    expect(document.activeElement).toBe(status_select);
  });

  test('preserves column when moving from ID button', async () => {
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
        status: 'open',
        priority: 2,
        issue_type: 'bug'
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

    const id_btn_row1 = /** @type {HTMLButtonElement} */ (
      mount.querySelector(
        'tbody tr.issue-row:nth-child(1) td:nth-child(1) button'
      )
    );
    id_btn_row1.focus();
    id_btn_row1.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })
    );

    const id_btn_row2 = /** @type {HTMLButtonElement} */ (
      mount.querySelector(
        'tbody tr.issue-row:nth-child(2) td:nth-child(1) button'
      )
    );
    expect(document.activeElement).toBe(id_btn_row2);
  });
});
