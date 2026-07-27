import { beforeEach, describe, expect, test, vi } from 'vitest';
import { bootstrap } from './main.js';
import { createWsClient } from './ws.js';

/**
 * Click the status checkbox with the given label in the status dropdown.
 *
 * @param {string} label - Visible label of the checkbox.
 */
function toggleStatus(label) {
  const dropdown = document.querySelectorAll('.filter-dropdown')[0];
  const trigger = /** @type {HTMLButtonElement} */ (
    dropdown.querySelector('.filter-dropdown__trigger')
  );
  trigger.click();
  const option = Array.from(
    dropdown.querySelectorAll('.filter-dropdown__option--status')
  ).find((opt) => (opt.textContent || '').trim() === label);
  const checkbox = /** @type {HTMLInputElement} */ (
    option?.querySelector('input[type="checkbox"]')
  );
  checkbox.click();
}

/**
 * Labels of the status checkboxes that are currently checked.
 *
 * @returns {string[]}
 */
function checkedStatusLabels() {
  const dropdown = document.querySelectorAll('.filter-dropdown')[0];
  return Array.from(
    dropdown.querySelectorAll('.filter-dropdown__option--status')
  )
    .filter((opt) => {
      const box = /** @type {HTMLInputElement|null} */ (
        opt.querySelector('input[type="checkbox"]')
      );
      return Boolean(box && box.checked);
    })
    .map((opt) => (opt.textContent || '').trim());
}

/**
 * The label of the selected scope radio.
 *
 * @returns {string}
 */
function selectedScopeLabel() {
  const dropdown = document.querySelectorAll('.filter-dropdown')[0];
  const option = Array.from(
    dropdown.querySelectorAll('.filter-dropdown__option--scope')
  ).find((opt) => {
    const radio = /** @type {HTMLInputElement|null} */ (
      opt.querySelector('input[type="radio"]')
    );
    return Boolean(radio && radio.checked);
  });
  return option ? (option.textContent || '').trim() : '';
}

/**
 * The persisted status filter as stored in localStorage.
 *
 * @returns {unknown}
 */
function storedStatusFilter() {
  const raw = window.localStorage.getItem('beads-ui.filters');
  return raw ? JSON.parse(raw).status : undefined;
}

/**
 * The spec type of the most recent `tab:issues` subscription request.
 *
 * @returns {string}
 */
function lastIssuesSpecType() {
  const subs = calls.filter(
    (c) => c.type === 'subscribe-list' && c.payload?.id === 'tab:issues'
  );
  return subs.length > 0 ? String(subs[subs.length - 1].payload.type) : '';
}

/**
 * Ids of the currently rendered rows.
 *
 * @returns {string[]}
 */
function rowIds() {
  return Array.from(document.querySelectorAll('#list-root tr.issue-row')).map(
    (el) => el.getAttribute('data-issue-id') || ''
  );
}

/**
 * Let queued microtasks (subscriptions, store notifications) settle.
 */
async function settle() {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
  }
}

const ALL_ISSUES = [
  {
    id: 'A-1',
    title: 'open one',
    status: 'open',
    created_at: 10,
    updated_at: 10
  },
  {
    id: 'B-1',
    title: 'blocked one',
    status: 'blocked',
    created_at: 20,
    updated_at: 20
  },
  {
    id: 'C-1',
    title: 'in progress one',
    status: 'in_progress',
    created_at: 30,
    updated_at: 30
  }
];

// Mock WS client to drive push envelopes and record RPCs
/** @type {{ type: string, payload: any }[]} */
const calls = [];
vi.mock('./ws.js', () => {
  /** @type {Record<string, (p: any) => void>} */
  const handlers = {};
  const singleton = {
    /**
     * @param {import('./protocol.js').MessageType} type
     * @param {any} payload
     */
    async send(type, payload) {
      calls.push({ type, payload });
      return null;
    },
    /**
     * @param {import('./protocol.js').MessageType} type
     * @param {(p: any) => void} handler
     */
    on(type, handler) {
      handlers[type] = handler;
      return () => {
        delete handlers[type];
      };
    },
    /**
     * Test helper: trigger a server event.
     *
     * @param {import('./protocol.js').MessageType} type
     * @param {any} payload
     */
    _trigger(type, payload) {
      if (handlers[type]) {
        handlers[type](payload);
      }
    },
    onConnection() {
      return () => {};
    },
    close() {},
    getState() {
      return 'open';
    }
  };
  return { createWsClient: () => singleton };
});

/**
 * Boot the app into a fresh DOM, keeping localStorage — a page reload.
 *
 * @returns {Promise<any>} The mock ws client.
 */
async function reload() {
  calls.length = 0;
  const client = /** @type {any} */ (createWsClient());
  window.location.hash = '#/issues';
  document.body.innerHTML = '<main id="app"></main>';
  const root = /** @type {HTMLElement} */ (document.getElementById('app'));

  bootstrap(root);
  await settle();
  client._trigger('snapshot', {
    type: 'snapshot',
    id: 'tab:issues',
    revision: 1,
    issues: ALL_ISSUES
  });
  await settle();
  return client;
}

describe('issues view — status filter persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('persists a multi-status selection as an array', async () => {
    await reload();

    toggleStatus('Open');
    await settle();
    toggleStatus('Blocked');
    await settle();

    expect(storedStatusFilter()).toEqual(['open', 'blocked']);
  });

  test('restores a multi-status selection after a reload', async () => {
    await reload();
    toggleStatus('Open');
    await settle();
    toggleStatus('Blocked');
    await settle();

    await reload();

    expect(checkedStatusLabels()).toEqual(['Open', 'Blocked']);
    expect(rowIds()).toEqual(['A-1', 'B-1']);
  });

  test('restores the Ready scope after a reload', async () => {
    window.localStorage.setItem(
      'beads-ui.filters',
      JSON.stringify({ status: ['ready'], search: '', type: '' })
    );

    await reload();

    expect(selectedScopeLabel()).toBe('Ready only');
    expect(lastIssuesSpecType()).toBe('ready-issues');
  });

  test('resolves a stored ready + status mix to the status', async () => {
    window.localStorage.setItem(
      'beads-ui.filters',
      JSON.stringify({ status: ['ready', 'open'], search: '', type: '' })
    );

    await reload();

    expect(selectedScopeLabel()).toBe('By status');
    expect(checkedStatusLabels()).toEqual(['Open']);
    expect(lastIssuesSpecType()).toBe('all-issues');
    expect(rowIds()).toEqual(['A-1']);
  });

  test('migrates a legacy scalar status to an array', async () => {
    window.localStorage.setItem(
      'beads-ui.filters',
      JSON.stringify({ status: 'open', search: '', type: '' })
    );

    await reload();

    expect(checkedStatusLabels()).toEqual(['Open']);
    expect(rowIds()).toEqual(['A-1']);
  });

  test('migrates the legacy scalar "all" to an empty selection', async () => {
    window.localStorage.setItem(
      'beads-ui.filters',
      JSON.stringify({ status: 'all', search: '', type: '' })
    );

    await reload();

    expect(checkedStatusLabels()).toEqual([]);
    expect(selectedScopeLabel()).toBe('By status');
    expect(rowIds()).toEqual(['A-1', 'B-1', 'C-1']);
  });

  test('drops unknown members of a stored selection', async () => {
    window.localStorage.setItem(
      'beads-ui.filters',
      JSON.stringify({ status: ['bogus', 'blocked'], search: '', type: '' })
    );

    await reload();

    expect(checkedStatusLabels()).toEqual(['Blocked']);
    expect(rowIds()).toEqual(['B-1']);
  });

  test('falls back to an empty selection for an invalid stored value', async () => {
    window.localStorage.setItem(
      'beads-ui.filters',
      JSON.stringify({ status: 42, search: '', type: '' })
    );

    await reload();

    expect(checkedStatusLabels()).toEqual([]);
    expect(rowIds()).toEqual(['A-1', 'B-1', 'C-1']);
  });
});
