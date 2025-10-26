import { describe, expect, test } from 'vitest';
import { createSubscriptionIssueStore } from './subscription-issue-store.js';

describe('subscription issue store', () => {
  test('applies snapshot and returns sorted snapshot', () => {
    const store = createSubscriptionIssueStore('s1');
    store.applyPush({
      type: 'snapshot',
      id: 's1',
      revision: 1,
      issues: [
        { id: 'B', priority: 2, updated_at: 10_000, closed_at: null },
        { id: 'A', priority: 1, updated_at: 20_000, closed_at: null }
      ]
    });
    const snap = /** @type {any[]} */ (store.snapshot());
    expect(Array.isArray(snap)).toBe(true);
    expect(snap.map((it) => it.id)).toEqual(['A', 'B']);
    expect(store.size()).toBe(2);
  });

  test('upsert updates in place and preserves identity', () => {
    const store = createSubscriptionIssueStore('s1');
    store.applyPush({
      type: 'snapshot',
      id: 's1',
      revision: 1,
      issues: [{ id: 'X', title: 'x', updated_at: 10_000, closed_at: null }]
    });
    const before = store.getById('X');
    expect(before?.title).toBe('x');
    store.applyPush({
      type: 'upsert',
      id: 's1',
      revision: 2,
      issue: {
        id: 'X',
        title: 'X!',
        updated_at: 10_060,
        closed_at: null
      }
    });
    const after = store.getById('X');
    expect(after?.title).toBe('X!');
    expect(after).toBe(before); // identity preserved
  });

  test('ignores stale upsert by revision and timestamp', () => {
    const store = createSubscriptionIssueStore('s1');
    store.applyPush({
      type: 'snapshot',
      id: 's1',
      revision: 5,
      issues: [{ id: 'X', title: 'x', updated_at: 10_600, closed_at: null }]
    });
    // stale revision
    store.applyPush({
      type: 'upsert',
      id: 's1',
      revision: 4,
      issue: {
        id: 'X',
        title: 'old',
        updated_at: 10_540,
        closed_at: null
      }
    });
    expect(store.getById('X')?.title).toBe('x');
    // equal revision is ignored
    store.applyPush({
      type: 'upsert',
      id: 's1',
      revision: 5,
      issue: {
        id: 'X',
        title: 'same',
        updated_at: 10_660,
        closed_at: null
      }
    });
    expect(store.getById('X')?.title).toBe('x');
    // higher revision but stale timestamp is ignored
    store.applyPush({
      type: 'upsert',
      id: 's1',
      revision: 6,
      issue: {
        id: 'X',
        title: 'stale',
        updated_at: 10_000,
        closed_at: null
      }
    });
    expect(store.getById('X')?.title).toBe('x');
  });

  test('delete removes item', () => {
    const store = createSubscriptionIssueStore('s1');
    store.applyPush({
      type: 'snapshot',
      id: 's1',
      revision: 1,
      issues: [
        { id: 'A', updated_at: 10_000, closed_at: null },
        { id: 'B', updated_at: 10_000, closed_at: null }
      ]
    });
    store.applyPush({ type: 'delete', id: 's1', revision: 2, issue_id: 'A' });
    expect(store.size()).toBe(1);
    expect(store.getById('A')).toBeUndefined();
    const ids = /** @type {any[]} */ (store.snapshot()).map((x) => x.id);
    expect(ids).toEqual(['B']);
  });

  test('subscribe emits exactly once per applyPush', () => {
    const store = createSubscriptionIssueStore('s1');
    let count = 0;
    store.subscribe(() => {
      count += 1;
    });
    store.applyPush({
      type: 'snapshot',
      id: 's1',
      revision: 1,
      issues: [{ id: 'A', updated_at: 10_000, closed_at: null }]
    });
    store.applyPush({
      type: 'upsert',
      id: 's1',
      revision: 2,
      issue: {
        id: 'A',
        title: 't',
        updated_at: 10_060,
        closed_at: null
      }
    });
    expect(count).toBe(2);
  });

  test('dispose clears listeners and state', () => {
    const store = createSubscriptionIssueStore('s1');
    let hit = 0;
    store.subscribe(() => {
      hit += 1;
    });
    store.dispose();
    store.applyPush({
      type: 'snapshot',
      id: 's1',
      revision: 1,
      issues: [{ id: 'A', updated_at: 10_000, closed_at: null }]
    });
    expect(hit).toBe(0);
    expect(store.size()).toBe(0);
  });
});
