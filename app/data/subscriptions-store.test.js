/**
 * @import { MessageType } from '../protocol.js'
 */
import { describe, expect, test } from 'vitest';
import { createSubscriptionStore } from './subscriptions-store.js';

describe('client subscription store', () => {
  test('applies delta sequences to itemsById', async () => {
    /** @type {(type: any, payload?: any) => Promise<any>} */
    const send = async () => ({ ok: true });
    const store = createSubscriptionStore(send);

    const spec = { type: 'all-issues' };
    const key = store._subKeyOf(spec);
    const unsub = await store.subscribeList('s1', spec);

    // Initial add
    store._applyDelta(key, {
      added: ['UI-1', 'UI-2'],
      updated: [],
      removed: []
    });
    expect(store.selectors.count('s1')).toBe(2);
    expect(store.selectors.has('s1', 'UI-1')).toBe(true);
    expect(store.selectors.has('s1', 'UI-2')).toBe(true);

    // Update should be idempotent presence toggle (exists)
    store._applyDelta(key, { added: [], updated: ['UI-2'], removed: [] });
    expect(store.selectors.count('s1')).toBe(2);

    // Add one, remove one
    store._applyDelta(key, { added: ['UI-3'], updated: [], removed: ['UI-1'] });
    const ids = store.selectors.getIds('s1').sort();
    expect(ids).toEqual(['UI-2', 'UI-3']);

    await unsub();
  });

  test('fans out deltas to multiple subscribers of same key', async () => {
    const send = async () => ({ ok: true });
    const store = createSubscriptionStore(send);
    const spec = { type: 'in-progress-issues' };
    const key = store._subKeyOf(spec);

    const unsub1 = await store.subscribeList('s1', spec);
    const unsub2 = await store.subscribeList('s2', spec);

    store._applyDelta(key, { added: ['UI-10'], updated: [], removed: [] });
    expect(store.selectors.has('s1', 'UI-10')).toBe(true);
    expect(store.selectors.has('s2', 'UI-10')).toBe(true);

    await unsub2();
    store._applyDelta(key, { added: [], updated: [], removed: ['UI-10'] });
    expect(store.selectors.has('s1', 'UI-10')).toBe(false);
    // s2 unsubscribed; its local store is gone
    expect(store.selectors.count('s2')).toBe(0);

    await unsub1();
  });

  test('wireEvents applies deltas from onEvent handler', async () => {
    const send = async () => ({ ok: true });
    const store = createSubscriptionStore(send);
    const spec = { type: 'closed-issues' };
    const key = store._subKeyOf(spec);

    /** @type {(payload: any) => void} */
    let handler = () => {
      throw new Error('list-delta handler was not wired');
    };
    /** @type {(type: MessageType, handler: (payload: unknown) => void) => void} */
    const onEvent = (type, h) => {
      if (type === 'list-delta') {
        handler = /** @type {any} */ (h);
      }
    };
    store.wireEvents(/** @type {any} */ (onEvent));

    await store.subscribeList('sA', spec);
    expect(store.selectors.count('sA')).toBe(0);

    handler({ key, delta: { added: ['UI-20'], updated: [], removed: [] } });
    expect(store.selectors.getIds('sA')).toEqual(['UI-20']);
  });

  test('unsubscribe clears local store and mapping', async () => {
    const send = async () => ({ ok: true });
    const store = createSubscriptionStore(send);
    const spec = { type: 'blocked-issues' };
    const key = store._subKeyOf(spec);

    const unsub = await store.subscribeList('sZ', spec);
    store._applyDelta(key, { added: ['UI-7'], updated: [], removed: [] });
    expect(store.selectors.count('sZ')).toBe(1);

    await unsub();
    expect(store.selectors.count('sZ')).toBe(0);
    expect(store.selectors.getIds('sZ')).toEqual([]);
  });
});
