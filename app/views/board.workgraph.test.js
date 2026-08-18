import { describe, expect, test } from 'vitest';
import { createSubscriptionIssueStore } from '../data/subscription-issue-store.js';
import { createBoardView } from './board.js';

describe('views/board workgraph metadata', () => {
  test('renders phase and lease badges from issue metadata', async () => {
    const { mount } = await setupBoard({
      workgraph_phase: 'implementing',
      workgraph_risk_tier: 'medium',
      lease_holder: 'workgraph-run/abc123',
      lease_expires_at: futureIso()
    });

    const phase = mount.querySelector('.wg-badge--phase');
    const lease = mount.querySelector('.wg-badge--lease');

    expect(phase?.textContent).toBe('implementing');
    expect(phase?.classList.contains('is-implementing')).toBe(true);
    expect(lease?.textContent).toContain('workgraph-run');
  });

  test('renders no workgraph badges without metadata', async () => {
    const { mount } = await setupBoard(undefined);

    expect(mount.querySelector('.wg-badge')).toBe(null);
  });

  test('blocks a drop on an issue with a live lease', async () => {
    const { mount, calls } = await setupBoard({
      lease_holder: 'workgraph-run/abc123',
      lease_expires_at: futureIso()
    });

    dropOn(mount, 'ready-col', 'WG-1');
    await flush();

    expect(calls).toEqual([]);
  });

  test('allows a drop when the lease is expired', async () => {
    const { mount, calls } = await setupBoard({
      lease_holder: 'workgraph-run/abc123',
      lease_expires_at: '2020-01-01T00:00:00Z'
    });

    dropOn(mount, 'ready-col', 'WG-1');
    await flush();

    expect(calls).toEqual([['update-status', { id: 'WG-1', status: 'open' }]]);
  });
});

/**
 * ISO timestamp comfortably in the future relative to test runtime.
 */
function futureIso() {
  return new Date(Date.now() + 10 * 60_000).toISOString();
}

/**
 * Flush pending microtasks so the async transport call settles.
 */
async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

/**
 * Mount a board holding one in-progress issue carrying the given metadata
 * and capture the mutations dispatched through the transport.
 *
 * @param {Record<string, unknown> | undefined} metadata
 * @returns {Promise<{ mount: HTMLElement, calls: Array<[string, unknown]> }>}
 */
async function setupBoard(metadata) {
  document.body.innerHTML = '<div id="m"></div>';
  const mount = /** @type {HTMLElement} */ (document.getElementById('m'));

  const store = createSubscriptionIssueStore('tab:board:in-progress');
  /** @type {Set<() => void>} */
  const listeners = new Set();
  store.subscribe(() => {
    for (const fn of Array.from(listeners)) {
      fn();
    }
  });
  store.applyPush({
    type: 'snapshot',
    id: 'tab:board:in-progress',
    revision: 1,
    issues: [
      {
        id: 'WG-1',
        title: 'wg issue',
        status: 'in_progress',
        priority: 1,
        created_at: 10_000,
        updated_at: 10_000,
        issue_type: 'task',
        ...(metadata ? { metadata } : {})
      }
    ]
  });
  const issueStores = {
    /** @param {string} id */
    snapshotFor(id) {
      return id === 'tab:board:in-progress' ? store.snapshot().slice() : [];
    },
    /** @param {() => void} fn */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }
  };

  /** @type {Array<[string, unknown]>} */
  const calls = [];
  const view = createBoardView(
    mount,
    null,
    () => {},
    undefined,
    undefined,
    issueStores,
    async (type, payload) => {
      calls.push([type, payload]);
      return null;
    }
  );
  await view.load();
  return { mount, calls };
}

/**
 * Dispatch a `drop` event on a board column with a stubbed dataTransfer.
 * jsdom has no DataTransfer implementation, so the payload is stubbed.
 *
 * @param {HTMLElement} mount
 * @param {string} col_id
 * @param {string} issue_id
 */
function dropOn(mount, col_id, issue_id) {
  const col = /** @type {HTMLElement} */ (mount.querySelector(`#${col_id}`));
  const ev = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'dataTransfer', {
    value: {
      getData() {
        return issue_id;
      }
    }
  });
  col.dispatchEvent(ev);
}
