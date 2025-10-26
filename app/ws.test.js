import { describe, expect, test, vi } from 'vitest';
import { createWsClient } from './ws.js';

/**
 * @returns {any[]}
 */
function setupFakeWebSocket() {
  /** @type {any[]} */
  const sockets = [];
  class FakeWebSocket {
    /** @param {string} url */
    constructor(url) {
      this.url = url;
      this.readyState = 0; // CONNECTING
      this.OPEN = 1;
      this.CLOSING = 2;
      this.CLOSED = 3;
      /** @type {{ open: Array<(ev:any)=>void>, message: Array<(ev:any)=>void>, error: Array<(ev:any)=>void>, close: Array<(ev:any)=>void> }} */
      this._listeners = { open: [], message: [], error: [], close: [] };
      /** @type {string[]} */
      this.sent = [];
      sockets.push(this);
    }
    /**
     * @param {'open'|'message'|'error'|'close'} type
     * @param {(ev:any)=>void} fn
     */
    addEventListener(type, fn) {
      this._listeners[type].push(fn);
    }
    /**
     * @param {'open'|'message'|'error'|'close'} type
     * @param {(ev:any)=>void} fn
     */
    removeEventListener(type, fn) {
      const a = this._listeners[type];
      const i = a.indexOf(fn);
      if (i !== -1) {
        a.splice(i, 1);
      }
    }
    /**
     * @param {'open'|'message'|'error'|'close'} type
     * @param {any} ev
     */
    _dispatch(type, ev) {
      for (const fn of this._listeners[type]) {
        try {
          fn(ev);
        } catch {
          // ignore
        }
      }
    }
    openNow() {
      this.readyState = this.OPEN;
      this._dispatch('open', {});
    }
    /** @param {string} data */
    send(data) {
      this.sent.push(String(data));
    }
    /** @param {any} obj */
    emitMessage(obj) {
      this._dispatch('message', { data: JSON.stringify(obj) });
    }
    close() {
      this.readyState = this.CLOSED;
      this._dispatch('close', {});
    }
  }
  vi.stubGlobal('WebSocket', FakeWebSocket);
  return sockets;
}

describe('app/ws client', () => {
  test('correlates replies for concurrent sends', async () => {
    const sockets = setupFakeWebSocket();
    const client = createWsClient({
      backoff: { initialMs: 5, maxMs: 5, jitterRatio: 0 }
    });
    // open connection
    sockets[0].openNow();

    const p1 = client.send('list-issues', { filters: {} });
    const p2 = client.send('show-issue', { id: 'UI-1' });

    // Parse the last two frames to extract ids
    const frames = sockets[0].sent
      .slice(-2)
      .map((/** @type {string} */ s) => JSON.parse(s));
    const id1 = frames[0].id;
    const id2 = frames[1].id;

    // Reply out of order
    sockets[0].emitMessage({
      id: id2,
      ok: true,
      type: 'show-issue',
      payload: { id: 'UI-1' }
    });
    sockets[0].emitMessage({
      id: id1,
      ok: true,
      type: 'list-issues',
      payload: [{ id: 'UI-1' }]
    });

    await expect(p2).resolves.toEqual({ id: 'UI-1' });
    await expect(p1).resolves.toEqual([{ id: 'UI-1' }]);
  });

  test('reconnects after close', async () => {
    vi.useFakeTimers();
    const sockets = setupFakeWebSocket();
    const client = createWsClient({
      backoff: { initialMs: 10, maxMs: 10, jitterRatio: 0 }
    });

    // First connection opens
    sockets[0].openNow();

    // Close the socket to trigger reconnect
    sockets[0].close();
    // Advance timers for reconnect
    await vi.advanceTimersByTimeAsync(10);

    // Second socket should exist and open
    expect(sockets.length).toBeGreaterThan(1);
    sockets[1].openNow();
    // No automatic subscribe frames in v2; just ensure reconnect occurred
    expect(Array.isArray(sockets[1].sent)).toBe(true);

    vi.useRealTimers();
    client.close();
  });

  test('dispatches server events and logs unknown types', async () => {
    const sockets = setupFakeWebSocket();
    const logger = { ...console, warn: vi.fn(), error: vi.fn() };
    const client = createWsClient({ logger });
    sockets[0].openNow();

    /** @type {any[]} */
    const events = [];
    client.on('snapshot', (p) => events.push(p));
    sockets[0].emitMessage({
      id: 'evt-1',
      ok: true,
      type: 'snapshot',
      payload: {
        type: 'snapshot',
        id: 'any',
        revision: 1,
        issues: []
      }
    });
    expect(events.length).toBe(1);

    // No handler registered for create-issue -> warn
    sockets[0].emitMessage({
      id: 'evt-2',
      ok: true,
      type: 'create-issue',
      payload: {}
    });
    expect(logger.warn).toHaveBeenCalled();
    client.close();
  });

  // Removed: subscription ack frames; no warnings to test
});
