import { describe, expect, test } from 'vitest';
import { createSubscriptionIssueStore } from '../data/subscription-issue-store.js';
import { createListView } from './list.js';

/**
 * Read the labels of a group inside the status dropdown.
 *
 * @param {HTMLElement} mount - The container element.
 * @param {string} group - `scope` or `status`.
 * @returns {string[]}
 */
function groupLabels(mount, group) {
  const dropdown = mount.querySelectorAll('.filter-dropdown')[0];
  return Array.from(
    dropdown.querySelectorAll(`.filter-dropdown__option--${group}`)
  ).map((el) => (el.textContent || '').trim());
}

/**
 * Click the scope radio with the given label.
 *
 * @param {HTMLElement} mount - The container element.
 * @param {string} label - Visible label of the radio.
 */
function selectScope(mount, label) {
  const dropdown = mount.querySelectorAll('.filter-dropdown')[0];
  const option = Array.from(
    dropdown.querySelectorAll('.filter-dropdown__option--scope')
  ).find((opt) => (opt.textContent || '').trim() === label);
  const radio = /** @type {HTMLInputElement} */ (
    option?.querySelector('input[type="radio"]')
  );
  radio.click();
}

/**
 * Click the status checkbox with the given label.
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
 * Read the status checkbox with the given label.
 *
 * @param {HTMLElement} mount - The container element.
 * @param {string} label - Visible label of the checkbox.
 * @returns {HTMLInputElement}
 */
function statusCheckbox(mount, label) {
  const dropdown = mount.querySelectorAll('.filter-dropdown')[0];
  const option = Array.from(
    dropdown.querySelectorAll('.filter-dropdown__option--status')
  ).find((opt) => (opt.textContent || '').trim() === label);
  return /** @type {HTMLInputElement} */ (
    option?.querySelector('input[type="checkbox"]')
  );
}

/**
 * Read the scope radio with the given label.
 *
 * @param {HTMLElement} mount - The container element.
 * @param {string} label - Visible label of the radio.
 * @returns {HTMLInputElement}
 */
function scopeRadio(mount, label) {
  const dropdown = mount.querySelectorAll('.filter-dropdown')[0];
  const option = Array.from(
    dropdown.querySelectorAll('.filter-dropdown__option--scope')
  ).find((opt) => (opt.textContent || '').trim() === label);
  return /** @type {HTMLInputElement} */ (
    option?.querySelector('input[type="radio"]')
  );
}

/**
 * Minimal store double recording the last `filters.status` written.
 *
 * @param {any} [initial_filters]
 */
function createTestStore(initial_filters) {
  /** @type {any} */
  const store = {
    state: {
      selected_id: null,
      view: 'issues',
      filters: initial_filters || { status: [], search: '', type: '' }
    },
    /** @type {((s: any) => void)[]} */
    subs: [],
    getState() {
      return store.state;
    },
    /** @param {any} patch */
    setState(patch) {
      store.state = {
        ...store.state,
        ...(patch || {}),
        filters: { ...store.state.filters, ...(patch.filters || {}) }
      };
      for (const fn of store.subs) {
        fn(store.state);
      }
    },
    /** @param {(s: any) => void} fn */
    subscribe(fn) {
      store.subs.push(fn);
      return () => {
        store.subs = store.subs.filter(
          /** @param {(s: any) => void} f */ (f) => f !== fn
        );
      };
    }
  };
  return store;
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

/**
 * Mount a list view over the given issues.
 *
 * @param {any[]} issues - Issues delivered as the initial snapshot.
 * @param {any} [store] - Optional state store double.
 */
async function mountList(issues, store) {
  document.body.innerHTML = '<aside id="mount" class="panel"></aside>';
  const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
  const issue_stores = createTestIssueStores();
  issue_stores.getStore('tab:issues').applyPush({
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
    issue_stores
  );
  await view.load();
  return { mount, view, issue_stores };
}

/**
 * Ids of the currently rendered rows.
 *
 * @param {HTMLElement} mount - The container element.
 * @returns {string[]}
 */
function rowIds(mount) {
  return Array.from(mount.querySelectorAll('tr.issue-row')).map(
    (el) => el.getAttribute('data-issue-id') || ''
  );
}

const ISSUES = [
  { id: 'UI-1', title: 'Alpha', status: 'open', priority: 1 },
  { id: 'UI-2', title: 'Beta', status: 'blocked', priority: 2 },
  { id: 'UI-3', title: 'Gamma', status: 'in_progress', priority: 3 }
];

describe('views/list — status scope vs status filters', () => {
  test('renders Ready as a scope radio, not a status checkbox', async () => {
    const { mount } = await mountList(ISSUES);

    const dropdown = mount.querySelectorAll('.filter-dropdown')[0];
    const trigger = /** @type {HTMLButtonElement} */ (
      dropdown.querySelector('.filter-dropdown__trigger')
    );
    trigger.click();

    const menu = dropdown.querySelector('.filter-dropdown__menu');
    expect(
      Array.from(menu?.querySelectorAll('.filter-dropdown__group-label') || [])
        .map((el) => (el.textContent || '').trim())
        .join('|')
    ).toBe('Scope|Status');
    expect(menu?.querySelectorAll('.filter-dropdown__divider').length).toBe(1);
    expect(groupLabels(mount, 'scope')).toEqual(['By status', 'Ready only']);
    expect(groupLabels(mount, 'status')).toEqual([
      'Open',
      'In progress',
      'Blocked',
      'Deferred',
      'Closed',
      'Pinned'
    ]);
  });

  test('leaving the Ready scope for a status narrows to that status', async () => {
    const store = createTestStore();
    const { mount } = await mountList(ISSUES, store);

    selectScope(mount, 'Ready only');
    await Promise.resolve();
    selectScope(mount, 'By status');
    await Promise.resolve();
    toggleStatus(mount, 'Open');
    await Promise.resolve();

    expect(store.getState().filters.status).toEqual(['open']);
    expect(rowIds(mount)).toEqual(['UI-1']);
  });

  test('a status toggle that reaches the Ready scope clears it', async () => {
    const store = createTestStore();
    const { mount } = await mountList(ISSUES, store);

    selectScope(mount, 'Ready only');
    await Promise.resolve();
    // The checkbox is disabled in the UI, so no user can build a mixed
    // selection this way; the handler still has to hold the invariant for the
    // paths the UI does not gate (persisted state, another tab, the store).
    const box = statusCheckbox(mount, 'Open');
    box.dispatchEvent(new Event('change'));
    await Promise.resolve();

    expect(store.getState().filters.status).toEqual(['open']);
    expect(scopeRadio(mount, 'By status').checked).toBe(true);
    expect(rowIds(mount)).toEqual(['UI-1']);
  });

  test('selecting the Ready scope clears the stored statuses', async () => {
    const store = createTestStore();
    const { mount } = await mountList(ISSUES, store);

    toggleStatus(mount, 'Open');
    await Promise.resolve();
    toggleStatus(mount, 'Blocked');
    await Promise.resolve();
    selectScope(mount, 'Ready only');
    await Promise.resolve();

    expect(store.getState().filters.status).toEqual(['ready']);
    expect(statusCheckbox(mount, 'Open').checked).toBe(false);
    expect(statusCheckbox(mount, 'Blocked').checked).toBe(false);
  });

  test('disables the status checkboxes while Ready only is selected', async () => {
    const { mount } = await mountList(ISSUES);

    selectScope(mount, 'Ready only');
    await Promise.resolve();

    expect(statusCheckbox(mount, 'Open').disabled).toBe(true);
    expect(statusCheckbox(mount, 'Closed').disabled).toBe(true);

    selectScope(mount, 'By status');
    await Promise.resolve();

    expect(statusCheckbox(mount, 'Open').disabled).toBe(false);
  });

  test('renders the union of several selected statuses', async () => {
    const { mount } = await mountList(ISSUES);

    toggleStatus(mount, 'Open');
    await Promise.resolve();
    toggleStatus(mount, 'Blocked');
    await Promise.resolve();

    expect(rowIds(mount)).toEqual(['UI-1', 'UI-2']);
  });

  test('drops the Ready scope from a mixed persisted selection', async () => {
    const store = createTestStore({
      status: ['ready', 'blocked'],
      search: '',
      type: ''
    });

    const { mount } = await mountList(ISSUES, store);

    expect(rowIds(mount)).toEqual(['UI-2']);
    expect(scopeRadio(mount, 'By status').checked).toBe(true);
    expect(statusCheckbox(mount, 'Blocked').checked).toBe(true);
  });
});
