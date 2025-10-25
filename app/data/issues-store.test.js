import { describe, expect, test } from 'vitest';
import { createIssuesStore } from './issues-store.js';

describe('data/issues-store', () => {
  test('applies snapshot then updates with revision gating', () => {
    const store = createIssuesStore();
    const changes = [];
    store.subscribe(() => changes.push('change'));

    // snapshot always applies, even with low revision
    store._applyEnvelope({
      topic: 'issues',
      revision: 0,
      snapshot: true,
      added: [{ id: 'UI-1', title: 'X' }],
      updated: [],
      removed: []
    });
    expect(store.getAll().length).toBe(1);

    // snapshot
    store._applyEnvelope({
      topic: 'issues',
      revision: 1,
      snapshot: true,
      added: [
        { id: 'UI-1', title: 'One' },
        { id: 'UI-2', title: 'Two' }
      ],
      updated: [],
      removed: []
    });
    expect(store.getMany(['UI-1', 'UI-2']).map((x) => x.title)).toEqual([
      'One',
      'Two'
    ]);
    expect(changes.length).toBe(2);

    // stale revision should be ignored
    store._applyEnvelope({
      topic: 'issues',
      revision: 1,
      added: [],
      updated: [{ id: 'UI-1', title: 'Stale' }],
      removed: []
    });
    expect(store.getById('UI-1')?.title).toBe('One');

    // update
    store._applyEnvelope({
      topic: 'issues',
      revision: 2,
      added: [],
      updated: [{ id: 'UI-1', title: 'One v2' }],
      removed: []
    });
    expect(store.getById('UI-1')?.title).toBe('One v2');

    // removal
    store._applyEnvelope({
      topic: 'issues',
      revision: 3,
      added: [],
      updated: [],
      removed: ['UI-2']
    });
    expect(store.getById('UI-2')).toBe(null);
    expect(store.getAll().length).toBe(1);
    expect(changes.length).toBe(4);
  });
});
