import { describe, expect, test, vi } from 'vitest';
import {
  SubscriptionRegistry,
  computeDelta,
  keyOf,
  toItemsMap
} from './subscriptions.js';

describe('subscriptions registry', () => {
  test('keyOf sorts params for stable keys', () => {
    const a = keyOf({ type: 'list', params: { status: 'open', limit: 50 } });
    const b = keyOf({ type: 'list', params: { limit: 50, status: 'open' } });
    expect(a).toBe('list?limit=50&status=open');
    expect(b).toBe('list?limit=50&status=open');
  });

  test('computeDelta returns added/updated/removed', () => {
    const prev = toItemsMap([
      { id: 'UI-1', updated_at: 1 },
      { id: 'UI-2', updated_at: 2 }
    ]);
    const next = toItemsMap([
      { id: 'UI-2', updated_at: 3 },
      { id: 'UI-3', updated_at: 1 }
    ]);
    const d = computeDelta(prev, next);
    expect(d.added).toEqual(['UI-3']);
    expect(d.updated).toEqual(['UI-2']);
    expect(d.removed).toEqual(['UI-1']);
  });

  test('attach/detach and disconnect-driven eviction', () => {
    const reg = new SubscriptionRegistry();
    /** @type {any} */
    const wsA = { OPEN: 1, readyState: 1, send: vi.fn() };
    /** @type {any} */
    const wsB = { OPEN: 1, readyState: 1, send: vi.fn() };

    const spec = { type: 'list', params: { status: 'open' } };
    const { key } = reg.attach(spec, wsA);
    reg.attach(spec, wsB);

    const entry1 = reg.get(key);
    expect(entry1 && entry1.subscribers.size).toBe(2);

    const removedA = reg.detach(spec, wsA);
    expect(removedA).toBe(true);
    const entry2 = reg.get(key);
    expect(entry2 && entry2.subscribers.size).toBe(1);

    // Disconnecting B should sweep it and remove empty entry
    reg.onDisconnect(wsB);
    const entry3 = reg.get(key);
    expect(entry3).toBeNull();
  });

  test('applyItems stores map and publishDelta sends to subscribers', () => {
    const reg = new SubscriptionRegistry();
    /** @type {Array<string>} */
    const sent = [];
    /** @type {any} */
    const ws = {
      OPEN: 1,
      readyState: 1,
      /** @param {string} msg */
      send(msg) {
        sent.push(String(msg));
      }
    };

    const spec = { type: 'list', params: { ready: true } };
    const { key } = reg.attach(spec, ws);

    const d1 = reg.applyItems(key, [
      { id: 'A', updated_at: 1 },
      { id: 'B', updated_at: 1 }
    ]);
    expect(d1.added.sort()).toEqual(['A', 'B']);
    expect(d1.updated).toEqual([]);
    expect(d1.removed).toEqual([]);

    const d2 = reg.applyItems(key, [
      { id: 'B', updated_at: 2 },
      { id: 'C', updated_at: 1 }
    ]);
    expect(d2.added).toEqual(['C']);
    expect(d2.updated).toEqual(['B']);
    expect(d2.removed).toEqual(['A']);

    reg.publishDelta(key, d2);
    const merged = sent
      .map((m) => {
        try {
          return JSON.parse(m);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    expect(merged.length).toBe(1);
    expect(merged[0] && merged[0].type).toBe('list-delta');
    expect(merged[0] && merged[0].payload && merged[0].payload.key).toBe(key);
  });
});
