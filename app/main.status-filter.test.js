import { beforeEach, describe, expect, test, vi } from 'vitest';
import { bootstrap } from './main.js';
import { createWsClient } from './ws.js';

/**
 * Click the scope radio with the given label in the status dropdown.
 *
 * @param {string} label - Visible label of the radio.
 */
function selectScope(label) {
  const dropdown = document.querySelectorAll('.filter-dropdown')[0];
  const trigger = /** @type {HTMLButtonElement} */ (
    dropdown.querySelector('.filter-dropdown__trigger')
  );
  trigger.click();
  const option = Array.from(
    dropdown.querySelectorAll('.filter-dropdown__option--scope')
  ).find((opt) => (opt.textContent || '').trim() === label);
  const radio = /** @type {HTMLInputElement} */ (
    option?.querySelector('input[type="radio"]')
  );
  radio.click();
}

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

describe('issues view — status filter model', () => {
  /** @type {any} */
  let client;

  beforeEach(async () => {
    calls.length = 0;
    window.localStorage.clear();
    client = /** @type {any} */ (createWsClient());
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
  });

  test('leaving the Ready scope for a status narrows to that status', async () => {
    selectScope('Ready only');
    await settle();

    selectScope('All issues');
    await settle();
    toggleStatus('Open');
    await settle();

    expect(lastIssuesSpecType()).toBe('all-issues');
    client._trigger('snapshot', {
      type: 'snapshot',
      id: 'tab:issues',
      revision: 2,
      issues: ALL_ISSUES
    });
    await settle();
    expect(rowIds()).toEqual(['A-1']);
  });

  test('selecting Ready after a status subscribes to ready issues', async () => {
    toggleStatus('Open');
    await settle();

    selectScope('Ready only');
    await settle();

    expect(lastIssuesSpecType()).toBe('ready-issues');
    client._trigger('snapshot', {
      type: 'snapshot',
      id: 'tab:issues',
      revision: 2,
      issues: [ALL_ISSUES[2]]
    });
    await settle();
    expect(rowIds()).toEqual(['C-1']);
  });

  test('two statuses subscribe to all issues and filter client-side', async () => {
    toggleStatus('Open');
    await settle();
    toggleStatus('Blocked');
    await settle();

    expect(lastIssuesSpecType()).toBe('all-issues');
    client._trigger('snapshot', {
      type: 'snapshot',
      id: 'tab:issues',
      revision: 2,
      issues: ALL_ISSUES
    });
    await settle();
    expect(rowIds()).toEqual(['A-1', 'B-1']);
  });

  test('a single stored status keeps its dedicated subscription', async () => {
    toggleStatus('In progress');
    await settle();

    expect(lastIssuesSpecType()).toBe('in-progress-issues');
  });

  test('in progress plus another status widens to all issues', async () => {
    toggleStatus('In progress');
    await settle();
    toggleStatus('Blocked');
    await settle();

    expect(lastIssuesSpecType()).toBe('all-issues');
  });

  test('fast toggles settle on the subscription of the final selection', async () => {
    // No awaits in between: both toggles land before any subscription resolves.
    toggleStatus('In progress');
    selectScope('Ready only');
    await settle();

    expect(lastIssuesSpecType()).toBe('ready-issues');

    // Newer revision for the ready list arrives first…
    client._trigger('snapshot', {
      type: 'snapshot',
      id: 'tab:issues',
      revision: 3,
      issues: [ALL_ISSUES[0], ALL_ISSUES[2]]
    });
    await settle();
    // …then a stale snapshot of the abandoned list, which must not win.
    client._trigger('snapshot', {
      type: 'snapshot',
      id: 'tab:issues',
      revision: 2,
      issues: [ALL_ISSUES[2]]
    });
    await settle();

    expect(rowIds()).toEqual(['A-1', 'C-1']);
  });

  test('fast toggles back out of the Ready scope keep the last selection', async () => {
    selectScope('Ready only');
    selectScope('All issues');
    toggleStatus('In progress');
    await settle();

    expect(lastIssuesSpecType()).toBe('in-progress-issues');

    client._trigger('snapshot', {
      type: 'snapshot',
      id: 'tab:issues',
      revision: 3,
      issues: [ALL_ISSUES[2]]
    });
    await settle();
    client._trigger('snapshot', {
      type: 'snapshot',
      id: 'tab:issues',
      revision: 2,
      issues: ALL_ISSUES
    });
    await settle();

    expect(rowIds()).toEqual(['C-1']);
  });
});
