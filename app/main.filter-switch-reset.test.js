import { describe, expect, test, vi } from 'vitest';
import { bootstrap } from './main.js';
import { createWsClient } from './ws.js';

// Mock WS client to allow pushing server events and observing RPCs
vi.mock('./ws.js', () => {
  /** @type {Record<string, (p: any) => void>} */
  const handlers = {};
  const singleton = {
    /**
     * @param {import('./protocol.js').MessageType} type
     * @param {any} payload
     */
    async send(type, payload) {
      void type;
      void payload;
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
    /** Trigger a server push event in tests */
    /**
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

describe('issues view — store resets on spec change', () => {
  test('accepts lower-revision snapshot for new list after filter change', async () => {
    const client = /** @type {any} */ (createWsClient());
    window.location.hash = '#/issues';
    document.body.innerHTML = '<main id="app"></main>';
    const root = /** @type {HTMLElement} */ (document.getElementById('app'));

    bootstrap(root);
    await Promise.resolve();

    // Seed tab:issues with a higher revision for the default list
    client._trigger('snapshot', {
      type: 'snapshot',
      id: 'tab:issues',
      revision: 5,
      issues: [
        {
          id: 'A-1',
          title: 'a',
          status: 'open',
          created_at: 10,
          updated_at: 10
        }
      ]
    });
    await Promise.resolve();

    // Switch to in_progress (different spec key)
    const statusSelect = /** @type {HTMLSelectElement} */ (
      document.querySelector('#issues-root select')
    );
    statusSelect.value = 'in_progress';
    statusSelect.dispatchEvent(new Event('change'));
    await Promise.resolve();

    // Now deliver a snapshot for the new spec with a LOWER revision
    const inProg = [
      {
        id: 'P-1',
        title: 'prog 1',
        status: 'in_progress',
        created_at: 200,
        updated_at: 200
      }
    ];
    client._trigger('snapshot', {
      type: 'snapshot',
      id: 'tab:issues',
      revision: 1,
      issues: inProg
    });
    await Promise.resolve();
    await Promise.resolve();

    const rows = Array.from(
      document.querySelectorAll('#list-root tr.issue-row')
    ).map((el) => el.getAttribute('data-issue-id') || '');
    expect(rows).toEqual(['P-1']);
  });
});
