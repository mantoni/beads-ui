import { describe, expect, test, vi } from 'vitest';
import { bootstrap } from './main.js';

// Provide a mutable client instance for module-level mock
/** @type {any} */
let CLIENT = null;
vi.mock('./ws.js', () => ({
  createWsClient: () => CLIENT
}));

describe('live updates: issues-changed handling', () => {
  test('refreshes list only when on issues view and preserves scroll', async () => {
    /** @type {{ send: import('vitest').Mock, on: (t: string, h: (p:any)=>void)=>void, trigger: (t:string, p:any)=>void }} */
    CLIENT = {
      send: vi.fn(async (type) => {
        if (type === 'list-issues') {
          return [
            { id: 'UI-1', title: 'A', status: 'open' },
            { id: 'UI-2', title: 'B', status: 'open' }
          ];
        }
        if (type === 'show-issue') {
          return { id: 'UI-1' };
        }
        if (type === 'epic-status') {
          return [];
        }
        return null;
      }),
      /**
       * @param {string} _type
       * @param {(p:any)=>void} handler
       */
      on(_type, handler) {
        this._handler = handler;
        return () => {};
      },
      /**
       * @param {string} type
       * @param {any} payload
       */
      trigger(type, payload) {
        if (type === 'issues-changed' && this._handler) this._handler(payload);
      },
      close() {},
      getState() {
        return 'open';
      }
    };

    document.body.innerHTML = '<main id="app"></main>';
    const root = /** @type {HTMLElement} */ (document.getElementById('app'));

    bootstrap(root);
    await Promise.resolve();

    // Simulate a scrolled list container
    const listRoot = /** @type {HTMLElement} */ (
      document.getElementById('list-root')
    );
    if (listRoot) {
      listRoot.scrollTop = 120;
    }

    const callsBefore = CLIENT.send.mock.calls.length;
    CLIENT.trigger('issues-changed', { ts: Date.now() });
    await Promise.resolve();

    const callsAfter = CLIENT.send.mock.calls.length;
    // Push-only path: no network fetch for list view
    const newCalls = CLIENT.send.mock.calls.slice(callsBefore);
    const types = newCalls.map(/** @param {any} c */ (c) => c[0]);
    expect(types).toEqual([]);

    // Scroll should remain
    const listRootAfter = /** @type {HTMLElement} */ (
      document.getElementById('list-root')
    );
    expect(listRootAfter.scrollTop).toBe(120);
    expect(callsAfter).toBe(callsBefore);
  });

  test('refreshes detail only when detail is visible and id matches hint', async () => {
    /** @type {{ send: import('vitest').Mock, on: (t: string, h: (p:any)=>void)=>void, trigger: (t:string, p:any)=>void }} */
    CLIENT = {
      send: vi.fn(async (type, payload) => {
        if (type === 'list-issues') {
          return [];
        }
        if (type === 'show-issue') {
          return { id: payload.id };
        }
        if (type === 'epic-status') {
          return [];
        }
        return null;
      }),
      /**
       * @param {string} _type
       * @param {(p:any)=>void} handler
       */
      on(_type, handler) {
        this._handler = handler;
        return () => {};
      },
      /**
       * @param {string} type
       * @param {any} payload
       */
      trigger(type, payload) {
        if (type === 'issues-changed' && this._handler) this._handler(payload);
      },
      close() {},
      getState() {
        return 'open';
      }
    };

    // Navigate to detail view
    window.location.hash = '#/issue/UI-1';
    document.body.innerHTML = '<main id="app"></main>';
    const root = /** @type {HTMLElement} */ (document.getElementById('app'));

    bootstrap(root);
    await Promise.resolve();

    CLIENT.send.mockClear();
    CLIENT.trigger('issues-changed', {
      ts: Date.now(),
      hint: { ids: ['UI-1'] }
    });
    await Promise.resolve();

    const calls = CLIENT.send.mock.calls.map(/** @param {any} c */ (c) => c[0]);
    expect(calls).toEqual(['show-issue']);
  });

  test('refreshes epics when epics view visible', async () => {
    CLIENT = {
      send: vi.fn(async (type) => {
        if (type === 'epic-status') {
          return [];
        }
        return [];
      }),
      /**
       * @param {string} _type
       * @param {(p:any)=>void} handler
       */
      on(_type, handler) {
        this._handler = handler;
        return () => {};
      },
      /**
       * @param {string} type
       * @param {any} payload
       */
      trigger(type, payload) {
        if (type === 'issues-changed' && this._handler) this._handler(payload);
      },
      close() {},
      getState() {
        return 'open';
      }
    };

    window.location.hash = '#/epics';
    document.body.innerHTML = '<main id="app"></main>';
    const root = /** @type {HTMLElement} */ (document.getElementById('app'));
    bootstrap(root);
    await Promise.resolve();

    // Ignore initial load
    CLIENT.send.mockClear();
    CLIENT.trigger('issues-changed', { ts: Date.now() });
    await Promise.resolve();

    const calls = CLIENT.send.mock.calls.map(/** @param {any} c */ (c) => c[0]);
    expect(calls).toEqual(['epic-status']);
  });

  test('refreshes board when board view visible', async () => {
    CLIENT = {
      send: vi.fn(async (type) => {
        if (type === 'list-issues') {
          return [];
        }
        if (type === 'epic-status') {
          return [];
        }
        return [];
      }),
      /**
       * @param {string} _type
       * @param {(p:any)=>void} handler
       */
      on(_type, handler) {
        this._handler = handler;
        return () => {};
      },
      /**
       * @param {string} type
       * @param {any} payload
       */
      trigger(type, payload) {
        if (type === 'issues-changed' && this._handler) this._handler(payload);
      },
      close() {},
      getState() {
        return 'open';
      }
    };

    window.location.hash = '#/board';
    document.body.innerHTML = '<main id="app"></main>';
    const root = /** @type {HTMLElement} */ (document.getElementById('app'));
    bootstrap(root);
    await Promise.resolve();

    CLIENT.send.mockClear();
    CLIENT.trigger('issues-changed', { ts: Date.now() });
    await Promise.resolve();

    const calls = CLIENT.send.mock.calls.map(/** @param {any} c */ (c) => c[0]);
    // Push-only path: board does not fetch list-issues on push
    expect(
      calls.filter(/** @param {any} t */ (t) => t === 'list-issues').length
    ).toBe(0);
  });
});
