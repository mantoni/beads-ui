import { describe, expect, test, vi } from 'vitest';
import { bootstrap } from './main.js';
import { createWsClient } from './ws.js';

// Mock WS client to drive push envelopes and connection state
vi.mock('./ws.js', () => {
  /** @type {Record<string, (p: any) => void>} */
  const handlers = {};
  /** @type {Set<(s: 'connecting'|'open'|'closed'|'reconnecting') => void>} */
  const connHandlers = new Set();
  /** @type {Array<[string, any]>} */
  const sent = [];
  const singleton = {
    /** Test helper: every message the client was asked to send */
    _sent: sent,
    /**
     * @param {import('./protocol.js').MessageType} type
     * @param {any} payload
     */
    async send(type, payload) {
      // Subscriptions are fire-and-forget in tests, but recorded so tests can
      // assert which subscriptions a view requests.
      sent.push([String(type), payload]);
      return null;
    },
    /**
     * @param {import('./protocol.js').MessageType} type
     * @param {(p:any)=>void} handler
     */
    on(type, handler) {
      handlers[type] = handler;
      return () => {
        delete handlers[type];
      };
    },
    /** Test helper: trigger a server event */
    /**
     * @param {import('./protocol.js').MessageType} type
     * @param {any} payload
     */
    _trigger(type, payload) {
      if (handlers[type]) {
        handlers[type](payload);
      }
    },
    /**
     * @param {(s:'connecting'|'open'|'closed'|'reconnecting')=>void} fn
     */
    onConnection(fn) {
      connHandlers.add(fn);
      return () => connHandlers.delete(fn);
    },
    /** Test helper: emit connection state */
    /** @param {'connecting'|'open'|'closed'|'reconnecting'} s */
    _emitConn(s) {
      for (const fn of Array.from(connHandlers)) {
        try {
          fn(s);
        } catch {
          /* ignore */
        }
      }
    },
    close() {},
    getState() {
      return 'open';
    }
  };
  return { createWsClient: () => singleton };
});

describe('push stores integration (board view)', () => {
  test('updates only the matching column on push events (multi-sub isolation)', async () => {
    const client = /** @type {any} */ (createWsClient());
    window.location.hash = '#/board';
    document.body.innerHTML = '<main id="app"></main>';
    const root = /** @type {HTMLElement} */ (document.getElementById('app'));

    bootstrap(root);
    // Allow router + subscriptions to wire
    await Promise.resolve();

    // Initial board: no cards
    expect(document.querySelectorAll('#ready-col .board-card').length).toBe(0);
    expect(
      document.querySelectorAll('#in-progress-col .board-card').length
    ).toBe(0);

    // Send per-subscription snapshots
    client._trigger('snapshot', {
      type: 'snapshot',
      id: 'tab:board:ready',
      revision: 1,
      issues: [
        { id: 'R-1', title: 'ready 1', priority: 1, updated_at: 10_000 },
        { id: 'R-2', title: 'ready 2', priority: 2, updated_at: 11_000 }
      ]
    });
    client._trigger('snapshot', {
      type: 'snapshot',
      id: 'tab:board:in-progress',
      revision: 1,
      issues: [{ id: 'P-1', title: 'prog 1', updated_at: 20_000 }]
    });
    await Promise.resolve();

    // Verify columns reflect only their subscription data
    expect(document.querySelectorAll('#ready-col .board-card').length).toBe(2);
    expect(
      document.querySelectorAll('#in-progress-col .board-card').length
    ).toBe(1);

    // Upsert into Ready only
    client._trigger('upsert', {
      type: 'upsert',
      id: 'tab:board:ready',
      revision: 2,
      issue: { id: 'R-3', title: 'ready 3', priority: 1, updated_at: 12_000 }
    });
    await Promise.resolve();

    expect(document.querySelectorAll('#ready-col .board-card').length).toBe(3);
    // In-progress unaffected
    expect(
      document.querySelectorAll('#in-progress-col .board-card').length
    ).toBe(1);

    // Delete from In-progress only
    client._trigger('delete', {
      type: 'delete',
      id: 'tab:board:in-progress',
      revision: 2,
      issue_id: 'P-1'
    });
    await Promise.resolve();

    expect(
      document.querySelectorAll('#in-progress-col .board-card').length
    ).toBe(0);
    // Ready unaffected
    expect(document.querySelectorAll('#ready-col .board-card').length).toBe(3);
  });

  test('reconnect replay does not duplicate entries', async () => {
    const client = /** @type {any} */ (createWsClient());
    window.location.hash = '#/board';
    document.body.innerHTML = '<main id="app"></main>';
    const root = /** @type {HTMLElement} */ (document.getElementById('app'));

    bootstrap(root);
    await Promise.resolve();

    // Initial snapshot
    client._trigger('snapshot', {
      type: 'snapshot',
      id: 'tab:board:ready',
      revision: 1,
      issues: [
        { id: 'R-1', title: 'r1', priority: 1, updated_at: 10_000 },
        { id: 'R-2', title: 'r2', priority: 2, updated_at: 10_100 }
      ]
    });
    await Promise.resolve();
    expect(document.querySelectorAll('#ready-col .board-card').length).toBe(2);

    // Simulate reconnect cycle and server replaying the same snapshot
    client._emitConn('reconnecting');
    client._emitConn('open');
    client._trigger('snapshot', {
      type: 'snapshot',
      id: 'tab:board:ready',
      revision: 1,
      issues: [
        { id: 'R-1', title: 'r1', priority: 1, updated_at: 10_000 },
        { id: 'R-2', title: 'r2', priority: 2, updated_at: 10_100 }
      ]
    });
    await Promise.resolve();
    // Still exactly two cards; no duplicates
    expect(document.querySelectorAll('#ready-col .board-card').length).toBe(2);

    // Newer upsert after replay updates item without duplication
    client._trigger('upsert', {
      type: 'upsert',
      id: 'tab:board:ready',
      revision: 2,
      issue: { id: 'R-2', title: 'r2!', priority: 2, updated_at: 10_200 }
    });
    await Promise.resolve();
    expect(document.querySelectorAll('#ready-col .board-card').length).toBe(2);
  });

  test('subscribes to both blocked sources when the board is shown', async () => {
    const client = /** @type {any} */ (createWsClient());
    client._sent.length = 0;
    window.location.hash = '#/board';
    document.body.innerHTML = '<main id="app"></main>';
    const root = /** @type {HTMLElement} */ (document.getElementById('app'));

    bootstrap(root);
    await Promise.resolve();
    await Promise.resolve();

    const requested = client._sent
      .filter((/** @type {[string, any]} */ e) => e[0] === 'subscribe-list')
      .map((/** @type {[string, any]} */ e) => e[1]);
    expect(
      requested.find((/** @type {any} */ p) => p.id === 'tab:board:blocked')
        ?.type
    ).toBe('blocked-issues');
    expect(
      requested.find(
        (/** @type {any} */ p) => p.id === 'tab:board:status-blocked'
      )?.type
    ).toBe('status-blocked-issues');
  });

  test('renders both blocked sources into the Blocked column, deduped', async () => {
    const client = /** @type {any} */ (createWsClient());
    window.location.hash = '#/board';
    document.body.innerHTML = '<main id="app"></main>';
    const root = /** @type {HTMLElement} */ (document.getElementById('app'));

    bootstrap(root);
    await Promise.resolve();

    // Dependency-blocked (from `bd blocked`; own status is open)
    client._trigger('snapshot', {
      type: 'snapshot',
      id: 'tab:board:blocked',
      revision: 1,
      issues: [
        { id: 'D-1', title: 'dep blocked', priority: 1, updated_at: 10_000 },
        { id: 'X-1', title: 'both', priority: 1, updated_at: 10_100 }
      ]
    });
    // Stored-status blocked (from `bd list --status blocked`)
    client._trigger('snapshot', {
      type: 'snapshot',
      id: 'tab:board:status-blocked',
      revision: 1,
      issues: [
        { id: 'S-1', title: 'status blocked', priority: 1, updated_at: 10_200 },
        { id: 'X-1', title: 'both', priority: 1, updated_at: 10_100 }
      ]
    });
    await Promise.resolve();

    const ids = Array.from(
      document.querySelectorAll('#blocked-col .board-card')
    ).map((el) => el.getAttribute('data-issue-id'));
    expect(ids.slice().sort()).toEqual(['D-1', 'S-1', 'X-1']);
  });
});
