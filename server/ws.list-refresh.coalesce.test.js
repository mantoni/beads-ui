import { createServer } from 'node:http';
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { attachWsServer, handleMessage, scheduleListRefresh } from './ws.js';
import { fetchListForSubscription } from './list-adapters.js';

vi.mock('./list-adapters.js', () => ({
  fetchListForSubscription: vi.fn(async () => {
    return {
      ok: true,
      items: [
        { id: 'A', updated_at: 1, closed_at: null },
        { id: 'B', updated_at: 1, closed_at: null }
      ]
    };
  })
}));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ws list refresh coalescing', () => {
  test('schedules one refresh per burst for active specs', async () => {
    const server = createServer();
    const { wss } = attachWsServer(server, {
      path: '/ws',
      heartbeat_ms: 10000,
      refresh_debounce_ms: 50
    });

    // Two connected clients
    const a = {
      sent: /** @type {string[]} */ ([]),
      readyState: 1,
      OPEN: 1,
      /** @param {string} msg */
      send(msg) {
        this.sent.push(String(msg));
      }
    };
    const b = {
      sent: /** @type {string[]} */ ([]),
      readyState: 1,
      OPEN: 1,
      /** @param {string} msg */
      send(msg) {
        this.sent.push(String(msg));
      }
    };
    wss.clients.add(/** @type {any} */ (a));
    wss.clients.add(/** @type {any} */ (b));

    // Subscribe to two different lists
    await handleMessage(
      /** @type {any} */ (a),
      Buffer.from(
        JSON.stringify({
          id: 'l1',
          type: /** @type {any} */ ('subscribe-list'),
          payload: { id: 'c1', type: 'all-issues' }
        })
      )
    );
    await handleMessage(
      /** @type {any} */ (b),
      Buffer.from(
        JSON.stringify({
          id: 'l2',
          type: /** @type {any} */ ('subscribe-list'),
          payload: { id: 'c2', type: 'in-progress-issues' }
        })
      )
    );

    // Clear initial refresh calls from subscribe-list
    const mock = /** @type {import('vitest').Mock} */ (fetchListForSubscription);
    mock.mockClear();

    // Simulate a burst of DB change events
    scheduleListRefresh();
    scheduleListRefresh();
    scheduleListRefresh();

    // Before debounce, nothing ran
    expect(mock.mock.calls.length).toBe(0);
    await vi.advanceTimersByTimeAsync(49);
    expect(mock.mock.calls.length).toBe(0);

    // After debounce window, one refresh per active spec
    await vi.advanceTimersByTimeAsync(1);
    expect(mock.mock.calls.length).toBe(2);
  });
});
