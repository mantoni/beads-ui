import { describe, expect, test, vi } from 'vitest';
import { bootstrap } from './main.js';
import { createWsClient } from './ws.js';

// Mock WS client to drive push envelopes and record RPCs
/** @type {{ type: string, payload: any }[]} */
const calls = [];
vi.mock('./ws.js', () => {
  /** @type {Record<string, (p: any) => void>} */
  const handlers = {};
  /** @type {Set<(s: 'connecting'|'open'|'closed'|'reconnecting') => void>} */
  const connHandlers = new Set();
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

describe('issues view — fast filter switching', () => {
  test('ignores out-of-order snapshots during quick status toggles and renders from stores', async () => {
    const client = /** @type {any} */ (createWsClient());
    window.location.hash = '#/issues';
    document.body.innerHTML = '<main id="app"></main>';
    const root = /** @type {HTMLElement} */ (document.getElementById('app'));

    bootstrap(root);
    // Let router + subscriptions wire
    await Promise.resolve();

    // Initially no rows
    expect(document.querySelectorAll('#list-root .issue-row').length).toBe(0);

    // Deliver an initial snapshot for the default 'all' spec to ensure
    // the per-subscription store exists and view wiring is live.
    client._trigger('snapshot', {
      type: 'snapshot',
      id: 'tab:issues',
      revision: 1,
      issues: []
    });
    await Promise.resolve();

    // Quickly toggle status: all -> ready -> in_progress before any server data
    const statusSelect = /** @type {HTMLSelectElement} */ (
      document.querySelector('#issues-root select')
    );
    // all -> ready
    statusSelect.value = 'ready';
    statusSelect.dispatchEvent(new Event('change'));
    // ready -> in_progress (fast)
    statusSelect.value = 'in_progress';
    statusSelect.dispatchEvent(new Event('change'));
    // Allow store subscriptions and sub_issue_stores.register to run
    await Promise.resolve();
    await Promise.resolve();

    // Now deliver snapshots out-of-order: newer revision first, then stale
    const inProg = [
      {
        id: 'P-1',
        title: 'prog 1',
        status: 'in_progress',
        created_at: 200,
        updated_at: 200
      },
      {
        id: 'P-2',
        title: 'prog 2',
        status: 'in_progress',
        created_at: 210,
        updated_at: 210
      }
    ];
    const ready = [
      {
        id: 'R-1',
        title: 'ready 1',
        status: 'open',
        created_at: 100,
        updated_at: 100
      }
    ];

    // Newer revision for in-progress
    client._trigger('snapshot', {
      type: 'snapshot',
      id: 'tab:issues',
      revision: 3,
      issues: inProg
    });
    await Promise.resolve();
    await Promise.resolve();

    // Older revision for the previously selected ready list — must be ignored
    client._trigger('snapshot', {
      type: 'snapshot',
      id: 'tab:issues',
      revision: 2,
      issues: ready
    });
    await Promise.resolve();
    await Promise.resolve();

    const rows = Array.from(
      document.querySelectorAll('#list-root tr.issue-row')
    ).map((el) => el.getAttribute('data-issue-id') || '');
    expect(rows).toEqual(['P-1', 'P-2']);

    // Ensure no list-issues RPCs are made (push-only source of truth)
    const sentListIssues = calls.filter((c) => c.type === 'list-issues');
    expect(sentListIssues.length).toBe(0);
  });
});
