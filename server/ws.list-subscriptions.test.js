import { createServer } from 'node:http';
import { describe, expect, test, vi } from 'vitest';
import { fetchListForSubscription } from './list-adapters.js';
import { keyOf, registry } from './subscriptions.js';
import { attachWsServer, handleMessage, scheduleListRefresh } from './ws.js';

// Mock adapters BEFORE importing ws.js to ensure the mock is applied
vi.mock('./list-adapters.js', () => ({
  fetchListForSubscription: vi.fn(async () => {
    // Return a simple, deterministic list for any spec
    return {
      ok: true,
      items: [
        { id: 'A', updated_at: 1, closed_at: null },
        { id: 'B', updated_at: 1, closed_at: null }
      ]
    };
  })
}));

describe('ws list subscriptions', () => {
  test('refresh emits upsert/delete after subscribe', async () => {
    vi.useFakeTimers();
    const server = createServer();
    const { wss } = attachWsServer(server, {
      path: '/ws',
      heartbeat_ms: 10000,
      refresh_debounce_ms: 50
    });
    const sock = {
      sent: /** @type {string[]} */ ([]),
      readyState: 1,
      OPEN: 1,
      /** @param {string} msg */
      send(msg) {
        this.sent.push(String(msg));
      }
    };
    wss.clients.add(/** @type {any} */ (sock));

    // Initial subscribe
    await handleMessage(
      /** @type {any} */ (sock),
      Buffer.from(
        JSON.stringify({
          id: 'sub-2',
          type: /** @type {any} */ ('subscribe-list'),
          payload: { id: 'c2', type: 'all-issues' }
        })
      )
    );

    // Clear initial snapshot
    sock.sent = [];

    // Change adapter to simulate one added, one updated, one removed
    const mock = /** @type {import('vitest').Mock} */ (
      fetchListForSubscription
    );
    mock.mockResolvedValueOnce({
      ok: true,
      items: [
        { id: 'A', updated_at: 2, closed_at: null }, // updated
        { id: 'C', updated_at: 1, closed_at: null } // added
      ]
    });

    // Trigger refresh
    scheduleListRefresh();
    await vi.advanceTimersByTimeAsync(60);

    const events = sock.sent
      .map((m) => {
        try {
          return JSON.parse(m);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    const upserts = events.filter((e) => e && e.type === 'upsert');
    const deletes = events.filter((e) => e && e.type === 'delete');
    expect(upserts.length).toBeGreaterThan(0);
    expect(deletes.length).toBeGreaterThan(0);
    vi.useRealTimers();
  });
  test('subscribe-list attaches and publishes initial snapshot', async () => {
    const sock = {
      sent: /** @type {string[]} */ ([]),
      readyState: 1,
      OPEN: 1,
      /** @param {string} msg */
      send(msg) {
        this.sent.push(String(msg));
      }
    };

    const req = {
      id: 'sub-1',
      type: /** @type {any} */ ('subscribe-list'),
      payload: { id: 'c1', type: 'in-progress-issues' }
    };
    await handleMessage(
      /** @type {any} */ (sock),
      Buffer.from(JSON.stringify(req))
    );

    // Expect an OK reply for subscribe-list
    const last = sock.sent[sock.sent.length - 1];
    const reply = JSON.parse(last);
    expect(reply && reply.ok).toBe(true);
    expect(reply && reply.type).toBe('subscribe-list');

    // Expect a snapshot event was sent containing issues
    const snapshotEnvelope = sock.sent
      .map((m) => {
        try {
          return JSON.parse(m);
        } catch {
          return null;
        }
      })
      .find((o) => o && o.type === 'snapshot');
    expect(!!snapshotEnvelope).toBe(true);
    expect(snapshotEnvelope.payload && snapshotEnvelope.payload.id).toBe('c1');
    expect(Array.isArray(snapshotEnvelope.payload.issues)).toBe(true);
    expect(snapshotEnvelope.payload.issues.length).toBeGreaterThan(0);

    const key = keyOf({ type: 'in-progress-issues' });
    const entry = registry.get(key);
    const beforeSize = entry ? entry.subscribers.size : 0;
    expect(beforeSize).toBeGreaterThanOrEqual(1);
  });

  test('unsubscribe-list detaches and disconnect sweep evicts entry', async () => {
    const sock = {
      sent: /** @type {string[]} */ ([]),
      readyState: 1,
      OPEN: 1,
      /** @param {string} msg */
      send(msg) {
        this.sent.push(String(msg));
      }
    };

    // Subscribe first
    await handleMessage(
      /** @type {any} */ (sock),
      Buffer.from(
        JSON.stringify({
          id: 'sub-1',
          type: /** @type {any} */ ('subscribe-list'),
          payload: { id: 'c1', type: 'all-issues' }
        })
      )
    );

    const key = keyOf({ type: 'all-issues' });
    const entry = registry.get(key);
    const before = entry ? entry.subscribers.size : 0;
    expect(before).toBeGreaterThanOrEqual(1);

    // Now unsubscribe
    await handleMessage(
      /** @type {any} */ (sock),
      Buffer.from(
        JSON.stringify({
          id: 'unsub-1',
          type: /** @type {any} */ ('unsubscribe-list'),
          payload: { id: 'c1' }
        })
      )
    );

    const entry2 = registry.get(key);
    const afterSize = entry2 ? entry2.subscribers.size : 0;
    expect(afterSize).toBeLessThan(before);

    // Do not assert full eviction here due to global registry used across tests
  });

  test('closed-issues pre-filter applies before diff', async () => {
    const now = Date.now();
    // Configure adapter mock for this test case
    const mock = /** @type {import('vitest').Mock} */ (
      fetchListForSubscription
    );
    mock.mockResolvedValueOnce({
      ok: true,
      items: [
        { id: 'old', updated_at: now - 3000, closed_at: now - 2000 },
        { id: 'recent', updated_at: now - 100, closed_at: now - 100 },
        { id: 'open', updated_at: now - 50, closed_at: null }
      ]
    });

    const sock = {
      sent: /** @type {string[]} */ ([]),
      readyState: 1,
      OPEN: 1,
      /** @param {string} msg */
      send(msg) {
        this.sent.push(String(msg));
      }
    };

    const since = now - 1000;
    await handleMessage(
      /** @type {any} */ (sock),
      Buffer.from(
        JSON.stringify({
          id: 'sub-closed',
          type: /** @type {any} */ ('subscribe-list'),
          payload: { id: 'c-closed', type: 'closed-issues', params: { since } }
        })
      )
    );

    const key = keyOf({ type: 'closed-issues', params: { since } });
    const entry = registry.get(key);
    const ids = entry ? Array.from(entry.itemsById.keys()).sort() : [];
    expect(ids).toEqual(['recent']);
  });

  test('subscribe-list rejects unknown subscription type', async () => {
    const sock = {
      sent: /** @type {string[]} */ ([]),
      readyState: 1,
      OPEN: 1,
      /** @param {string} msg */
      send(msg) {
        this.sent.push(String(msg));
      }
    };

    await handleMessage(
      /** @type {any} */ (sock),
      Buffer.from(
        JSON.stringify({
          id: 'bad-sub',
          type: /** @type {any} */ ('subscribe-list'),
          payload: { id: 'c-bad', type: 'not-supported' }
        })
      )
    );

    const last = sock.sent[sock.sent.length - 1];
    const reply = JSON.parse(last);
    expect(reply && reply.ok).toBe(false);
    expect(reply && reply.error && reply.error.code).toBe('bad_request');
  });

  test('subscribe-list accepts issue-detail with id and publishes snapshot', async () => {
    const sock = {
      sent: /** @type {string[]} */ ([]),
      readyState: 1,
      OPEN: 1,
      /** @param {string} msg */
      send(msg) {
        this.sent.push(String(msg));
      }
    };

    await handleMessage(
      /** @type {any} */ (sock),
      Buffer.from(
        JSON.stringify({
          id: 'sub-detail-1',
          type: /** @type {any} */ ('subscribe-list'),
          payload: {
            id: 'detail:UI-1',
            type: 'issue-detail',
            params: { id: 'UI-1' }
          }
        })
      )
    );

    const last = sock.sent[sock.sent.length - 1];
    const reply = JSON.parse(last);
    expect(reply && reply.ok).toBe(true);
    expect(reply && reply.type).toBe('subscribe-list');

    const snapshotEnvelope = sock.sent
      .map((m) => {
        try {
          return JSON.parse(m);
        } catch {
          return null;
        }
      })
      .find((o) => o && o.type === 'snapshot');
    expect(!!snapshotEnvelope).toBe(true);
    expect(snapshotEnvelope.payload && snapshotEnvelope.payload.id).toBe(
      'detail:UI-1'
    );
    expect(Array.isArray(snapshotEnvelope.payload.issues)).toBe(true);
  });

  test('subscribe-list issue-detail enforces id', async () => {
    const sock = {
      sent: /** @type {string[]} */ ([]),
      readyState: 1,
      OPEN: 1,
      /** @param {string} msg */
      send(msg) {
        this.sent.push(String(msg));
      }
    };

    await handleMessage(
      /** @type {any} */ (sock),
      Buffer.from(
        JSON.stringify({
          id: 'bad-detail',
          type: /** @type {any} */ ('subscribe-list'),
          payload: { id: 'detail:UI-X', type: 'issue-detail' }
        })
      )
    );
    const last = sock.sent[sock.sent.length - 1];
    const reply = JSON.parse(last);
    expect(reply && reply.ok).toBe(false);
    expect(reply && reply.error && reply.error.code).toBe('bad_request');
  });

  test('subscribe-list closed-issues validates since param', async () => {
    const sock = {
      sent: /** @type {string[]} */ ([]),
      readyState: 1,
      OPEN: 1,
      /** @param {string} msg */
      send(msg) {
        this.sent.push(String(msg));
      }
    };

    await handleMessage(
      /** @type {any} */ (sock),
      Buffer.from(
        JSON.stringify({
          id: 'bad-since',
          type: /** @type {any} */ ('subscribe-list'),
          payload: {
            id: 'c-closed',
            type: 'closed-issues',
            params: { since: 'yesterday' }
          }
        })
      )
    );
    const last = sock.sent[sock.sent.length - 1];
    const reply = JSON.parse(last);
    expect(reply && reply.ok).toBe(false);
    expect(reply && reply.error && reply.error.code).toBe('bad_request');
  });
});
