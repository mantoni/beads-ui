import { describe, expect, test, vi } from 'vitest';
import { bootstrap } from './main.js';

// Mock ws client factory to inject a controllable client
/** @type {any} */
let CLIENT = null;
vi.mock('./ws.js', () => ({
  createWsClient: () => CLIENT
}));

describe('main websocket toast notifications', () => {
  test('shows toast on connection loss and on reconnect', async () => {
    vi.useFakeTimers();
    CLIENT = {
      // Minimal send used during bootstrap (push-only tests avoid read RPCs)
      send: vi.fn(async (type) => {
        if (type === 'show-issue') {
          return { id: 'UI-1' };
        }
        return [];
      }),
      /**
       * @param {string} type
       * @param {(p:any)=>void} handler
       */
      on(type, handler) {
        this._handler = handler;
        void type;
        return () => {};
      },
      /**
       * @param {(s: 'connecting'|'open'|'closed'|'reconnecting')=>void} handler
       */
      onConnection(handler) {
        this._conn = handler;
        return () => {};
      },
      /**
       * @param {'connecting'|'open'|'closed'|'reconnecting'} state
       */
      triggerConn(state) {
        if (this._conn) {
          this._conn(state);
        }
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

    // Simulate reconnecting -> toast appears
    CLIENT.triggerConn('reconnecting');
    await Promise.resolve();
    const lost = /** @type {HTMLElement} */ (document.querySelector('.toast'));
    expect(lost).not.toBeNull();
    expect((lost.textContent || '').toLowerCase()).toContain('connection lost');

    // Simulate open after disconnect -> success toast
    CLIENT.triggerConn('open');
    await Promise.resolve();
    const toasts = Array.from(document.querySelectorAll('.toast'));
    expect(
      toasts.some((t) =>
        (t.textContent || '').toLowerCase().includes('reconnected')
      )
    ).toBe(true);

    // Let timers flush auto-dismiss to avoid leaking DOM between tests
    await vi.advanceTimersByTimeAsync(5000);
    vi.useRealTimers();
  });
});
