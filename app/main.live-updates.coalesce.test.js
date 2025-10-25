import { describe, expect, test, vi } from 'vitest';
import { bootstrap } from './main.js';

// Provide a mutable client instance for module-level mock
/** @type {any} */
let CLIENT = null;
vi.mock('./ws.js', () => ({
  createWsClient: () => CLIENT
}));

describe('live updates coalescing (UI-114)', () => {
  test('suppresses trailing full refresh after targeted update (list view)', async () => {
    /** @type {{ send: import('vitest').Mock, on: (t: string, h: (p:any)=>void)=>void, trigger: (t:string, p:any)=>void }} */
    CLIENT = {
      send: vi.fn(async (type) => {
        if (type === 'list-issues') {
          return [];
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

    CLIENT.send.mockClear();

    // First, targeted update (id-scoped), then immediate watcher full refresh
    CLIENT.trigger('issues-changed', {
      ts: Date.now(),
      hint: { ids: ['UI-1'] }
    });
    CLIENT.trigger('issues-changed', { ts: Date.now() });
    await Promise.resolve();

    // Push-only path: list view does not fetch
    const calls = CLIENT.send.mock.calls.map(/** @param {any} c */ (c) => c[0]);
    expect(
      calls.filter(/** @param {any} t */ (t) => t === 'list-issues').length
    ).toBe(0);
  });

  test('suppresses trailing full refresh after targeted update (detail view)', async () => {
    /** @type {{ send: import('vitest').Mock, on: (t: string, h: (p:any)=>void)=>void, trigger: (t:string, p:any)=>void }} */
    CLIENT = {
      send: vi.fn(async (type, payload) => {
        if (type === 'show-issue') {
          return { id: payload.id };
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

    // Navigate to detail view for UI-1
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
    CLIENT.trigger('issues-changed', { ts: Date.now() });
    await Promise.resolve();

    const calls = CLIENT.send.mock.calls.map(/** @param {any} c */ (c) => c[0]);
    expect(
      calls.filter(/** @param {any} t */ (t) => t === 'show-issue').length
    ).toBe(1);
  });
});
