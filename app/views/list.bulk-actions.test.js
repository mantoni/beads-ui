import { describe, expect, test, vi } from 'vitest';
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

/**
 * @returns {Promise<void>}
 */
async function flushUpdates() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

/**
 * @param {HTMLElement} mount
 * @param {string} issue_id
 */
function toggleIssueCheckbox(mount, issue_id) {
  const checkbox = /** @type {HTMLInputElement} */ (
    mount.querySelector(
      `tr.issue-row[data-issue-id="${issue_id}"] .row-select-checkbox`
    )
  );
  checkbox.click();
}

/**
 * @param {HTMLElement} mount
 * @param {string} label
 */
function clickBulkButton(mount, label) {
  const button = Array.from(mount.querySelectorAll('.bulk-toolbar button')).find(
    (el) => el.textContent?.trim() === label
  );
  const html_button = /** @type {HTMLButtonElement} */ (button);
  html_button.click();
}

describe('views/list bulk actions', () => {
  test('toggles all row checkboxes from header and shows selected count', async () => {
    document.body.innerHTML = '<aside id="mount" class="panel"></aside>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
    const issues = [
      { id: 'UI-1', title: 'One', status: 'open' },
      { id: 'UI-2', title: 'Two', status: 'open' }
    ];
    const issue_stores = createTestIssueStores();
    issue_stores.getStore('tab:issues').applyPush({
      type: 'snapshot',
      id: 'tab:issues',
      revision: 1,
      issues
    });

    const view = createListView(
      mount,
      async () => ({}),
      undefined,
      undefined,
      undefined,
      issue_stores
    );
    await view.load();

    expect(mount.querySelector('.bulk-toolbar')).toBeNull();

    const select_all = /** @type {HTMLInputElement} */ (
      mount.querySelector('.row-select-all-checkbox')
    );
    select_all.click();

    await flushUpdates();

    const row_boxes = Array.from(
      mount.querySelectorAll('.row-select-checkbox')
    ).map((el) => /** @type {HTMLInputElement} */ (el).checked);
    expect(row_boxes).toEqual([true, true]);
    expect(mount.querySelector('.bulk-toolbar__count')?.textContent).toContain(
      '2 issues selected'
    );

    select_all.click();

    await flushUpdates();

    expect(mount.querySelector('.bulk-toolbar')).toBeNull();
  });

  test('closes selected rows with one bulk action', async () => {
    document.body.innerHTML = '<aside id="mount" class="panel"></aside>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
    const issues = [
      { id: 'UI-1', title: 'One', status: 'open' },
      { id: 'UI-2', title: 'Two', status: 'in_progress' }
    ];
    const issue_stores = createTestIssueStores();
    issue_stores.getStore('tab:issues').applyPush({
      type: 'snapshot',
      id: 'tab:issues',
      revision: 1,
      issues
    });
    const send = vi.fn(async () => ({}));
    const view = createListView(
      mount,
      send,
      undefined,
      undefined,
      undefined,
      issue_stores
    );
    await view.load();

    toggleIssueCheckbox(mount, 'UI-2');
    clickBulkButton(mount, 'Close selected');

    await flushUpdates();

    const calls = send.mock.calls
      .filter(([type]) => type === 'update-status')
      .map(([, payload]) => payload);
    expect(calls).toEqual([{ id: 'UI-2', status: 'closed' }]);
  });

  test('reopens selected rows with one bulk action', async () => {
    document.body.innerHTML = '<aside id="mount" class="panel"></aside>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
    const issues = [
      { id: 'UI-1', title: 'One', status: 'closed' },
      { id: 'UI-2', title: 'Two', status: 'closed' }
    ];
    const issue_stores = createTestIssueStores();
    issue_stores.getStore('tab:issues').applyPush({
      type: 'snapshot',
      id: 'tab:issues',
      revision: 1,
      issues
    });
    const send = vi.fn(async () => ({}));
    const view = createListView(
      mount,
      send,
      undefined,
      undefined,
      undefined,
      issue_stores
    );
    await view.load();

    toggleIssueCheckbox(mount, 'UI-1');
    toggleIssueCheckbox(mount, 'UI-2');
    clickBulkButton(mount, 'Reopen selected');

    await flushUpdates();

    const calls = send.mock.calls
      .filter(([type]) => type === 'update-status')
      .map(([, payload]) => payload);
    expect(calls).toEqual([
      { id: 'UI-1', status: 'open' },
      { id: 'UI-2', status: 'open' }
    ]);
  });

  test('changes priority for all selected rows', async () => {
    document.body.innerHTML = '<aside id="mount" class="panel"></aside>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
    const issues = [
      { id: 'UI-1', title: 'One', status: 'open', priority: 1 },
      { id: 'UI-2', title: 'Two', status: 'open', priority: 2 }
    ];
    const issue_stores = createTestIssueStores();
    issue_stores.getStore('tab:issues').applyPush({
      type: 'snapshot',
      id: 'tab:issues',
      revision: 1,
      issues
    });
    const send = vi.fn(async () => ({}));
    const prompt_spy = vi.spyOn(window, 'prompt').mockReturnValue('4');

    const view = createListView(
      mount,
      send,
      undefined,
      undefined,
      undefined,
      issue_stores
    );
    await view.load();

    toggleIssueCheckbox(mount, 'UI-1');
    toggleIssueCheckbox(mount, 'UI-2');
    clickBulkButton(mount, 'Change priority');

    await flushUpdates();

    const calls = send.mock.calls
      .filter(([type]) => type === 'update-priority')
      .map(([, payload]) => payload);
    expect(calls).toEqual([
      { id: 'UI-1', priority: 4 },
      { id: 'UI-2', priority: 4 }
    ]);

    prompt_spy.mockRestore();
  });

  test('edits labels across selected rows using diff operations', async () => {
    document.body.innerHTML = '<aside id="mount" class="panel"></aside>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
    const issues = [
      {
        id: 'UI-1',
        title: 'One',
        status: 'open',
        labels: ['frontend', 'legacy']
      },
      { id: 'UI-2', title: 'Two', status: 'open', labels: ['legacy'] }
    ];
    const issue_stores = createTestIssueStores();
    issue_stores.getStore('tab:issues').applyPush({
      type: 'snapshot',
      id: 'tab:issues',
      revision: 1,
      issues
    });
    const send = vi.fn(async () => ({}));
    const prompt_spy = vi
      .spyOn(window, 'prompt')
      .mockReturnValue('frontend, backend');

    const view = createListView(
      mount,
      send,
      undefined,
      undefined,
      undefined,
      issue_stores
    );
    await view.load();

    toggleIssueCheckbox(mount, 'UI-1');
    toggleIssueCheckbox(mount, 'UI-2');
    clickBulkButton(mount, 'Edit labels');

    await flushUpdates();

    const calls = send.mock.calls
      .filter(([type]) => type === 'label-add' || type === 'label-remove')
      .map(([type, payload]) => `${type}:${payload.id}:${payload.label}`)
      .sort();
    expect(calls).toEqual(
      [
        'label-remove:UI-1:legacy',
        'label-add:UI-1:backend',
        'label-remove:UI-2:legacy',
        'label-add:UI-2:frontend',
        'label-add:UI-2:backend'
      ].sort()
    );

    prompt_spy.mockRestore();
  });
});
