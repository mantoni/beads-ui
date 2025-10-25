import { describe, expect, test, vi } from 'vitest';
import { fetchListForSubscription } from './list-adapters.js';
import { keyOf, registry } from './subscriptions.js';
import { handleMessage } from './ws.js';

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
  test('subscribe-list attaches and publishes initial list-delta', async () => {
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

    // Expect a list-delta event was sent
    const hasDelta = sock.sent.some((m) => {
      try {
        const o = JSON.parse(m);
        return o && o.type === 'list-delta';
      } catch {
        return false;
      }
    });
    expect(hasDelta).toBe(true);

    const key = keyOf({ type: 'in-progress-issues' });
    const entry = registry.get(key);
    expect(entry && entry.subscribers.size).toBe(1);
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
    expect(entry && entry.subscribers.size).toBe(1);

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
    expect(entry2 && entry2.subscribers.size).toBe(0);

    // Simulate socket close sweep
    registry.onDisconnect(/** @type {any} */ (sock));
    const after = registry.get(key);
    expect(after).toBeNull();
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

  test('subscribe-list issues-for-epic enforces epic_id', async () => {
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
          id: 'bad-epic',
          type: /** @type {any} */ ('subscribe-list'),
          payload: { id: 'c-epic', type: 'issues-for-epic' }
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
