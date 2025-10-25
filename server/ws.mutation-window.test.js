import { createServer } from 'node:http';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { runBd } from './bd.js';
import { fetchListForSubscription } from './list-adapters.js';
import { attachWsServer, handleMessage, scheduleListRefresh } from './ws.js';

vi.mock('./bd.js', () => ({ runBdJson: vi.fn(), runBd: vi.fn() }));
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

function makeSocket() {
  return {
    sent: /** @type {string[]} */ ([]),
    readyState: 1,
    OPEN: 1,
    /** @param {string} msg */
    send(msg) {
      this.sent.push(String(msg));
    }
  };
}

/**
 * @param {import('ws').WebSocketServer} wss
 */
async function subscribeTwoLists(wss) {
  const a = makeSocket();
  const b = makeSocket();
  wss.clients.add(/** @type {any} */ (a));
  wss.clients.add(/** @type {any} */ (b));
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
}

describe('mutation window gating', () => {
  test('watcher-first resolves gate and refreshes once', async () => {
    const server = createServer();
    const { wss } = attachWsServer(server, {
      path: '/ws',
      refresh_debounce_ms: 50
    });

    await subscribeTwoLists(wss);

    // Clear any refresh calls from initial subscriptions
    const mFetch = /** @type {import('vitest').Mock} */ (
      fetchListForSubscription
    );
    mFetch.mockClear();

    // Prepare mutation stubs
    const mRun = /** @type {import('vitest').Mock} */ (runBd);
    mRun.mockResolvedValueOnce({ code: 0, stdout: 'UI-99', stderr: '' });

    // Fire a mutation
    const ws = makeSocket();
    await handleMessage(
      /** @type {any} */ (ws),
      Buffer.from(
        JSON.stringify({
          id: 'create1',
          type: /** @type {any} */ ('create-issue'),
          payload: { title: 'X' }
        })
      )
    );

    // Simulate watcher event arriving before timeout
    scheduleListRefresh();

    // Allow pending promises and microtasks to flush
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    // Exactly one refresh pass over active specs
    expect(mFetch.mock.calls.length).toBe(2);
  });

  test('timeout-first triggers refresh after 500ms', async () => {
    const server = createServer();
    const { wss } = attachWsServer(server, {
      path: '/ws',
      refresh_debounce_ms: 50
    });

    await subscribeTwoLists(wss);

    const mFetch = /** @type {import('vitest').Mock} */ (
      fetchListForSubscription
    );
    mFetch.mockClear();

    const mRun = /** @type {import('vitest').Mock} */ (runBd);
    mRun.mockResolvedValueOnce({ code: 0, stdout: 'UI-100', stderr: '' });

    const ws = makeSocket();
    await handleMessage(
      /** @type {any} */ (ws),
      Buffer.from(
        JSON.stringify({
          id: 'create2',
          type: /** @type {any} */ ('create-issue'),
          payload: { title: 'Y' }
        })
      )
    );

    // Before timeout, no refreshes triggered
    await vi.advanceTimersByTimeAsync(499);
    expect(mFetch.mock.calls.length).toBe(0);

    // After timeout, one refresh per active spec
    await vi.advanceTimersByTimeAsync(1);
    expect(mFetch.mock.calls.length).toBe(2);
  });
});
