import { describe, expect, test } from 'vitest';
import { createIssuesStore } from './issues-store.js';
import { createListSelectors } from './list-selectors.js';
import { createSubscriptionStore } from './subscriptions-store.js';

/**
 * Helper to build stores and selectors bound together.
 */
function setup() {
  const client_send = async () => ({ ok: true });
  const subs = createSubscriptionStore(/** @type {any} */ (client_send));
  const issues = createIssuesStore();
  subs.wireEvents(() => {});
  issues.wireEvents(() => {});
  const selectors = createListSelectors(subs, issues);
  return { subs, issues, selectors };
}

describe('list-selectors', () => {
  test('returns empty arrays for empty stores', async () => {
    const { subs, selectors } = setup();
    await subs.subscribeList('tab:issues', { type: 'all-issues' });
    expect(selectors.selectIssuesFor('tab:issues')).toEqual([]);
    await subs.subscribeList('tab:board:ready', { type: 'ready-issues' });
    expect(selectors.selectBoardColumn('tab:board:ready', 'ready')).toEqual([]);
  });

  test('selectIssuesFor returns priority asc then updated desc', async () => {
    const { subs, issues, selectors } = setup();

    // Subscribe and add membership
    const spec = { type: 'all-issues' };
    await subs.subscribeList('tab:issues', spec);
    const key = subs._subKeyOf(spec);
    subs._applyDelta(key, {
      added: ['A', 'B', 'C'],
      updated: [],
      removed: []
    });

    // Push issues with varying priority and updated_at
    issues._applyEnvelope({
      topic: 'issues',
      revision: 1,
      snapshot: true,
      added: [
        { id: 'A', priority: 2, updated_at: '2025-10-25T10:00:00Z' },
        { id: 'B', priority: 1, updated_at: '2025-10-25T09:00:00Z' },
        { id: 'C', priority: 1, updated_at: '2025-10-25T11:00:00Z' }
      ],
      updated: [],
      removed: []
    });

    const out = selectors.selectIssuesFor('tab:issues').map((x) => x.id);
    // priority asc: B,C first (1), then A (2); within same priority sort by updated desc
    expect(out).toEqual(['C', 'B', 'A']);
  });

  test('selectBoardColumn sorts ready like list, in_progress by updated desc, closed by closed_at desc', async () => {
    const { subs, issues, selectors } = setup();

    await subs.subscribeList('tab:board:ready', { type: 'ready-issues' });
    await subs.subscribeList('tab:board:in-progress', {
      type: 'in-progress-issues'
    });
    await subs.subscribeList('tab:board:closed', { type: 'closed-issues' });

    subs._applyDelta(subs._subKeyOf({ type: 'ready-issues' }), {
      added: ['R1', 'R2', 'R3'],
      updated: [],
      removed: []
    });
    subs._applyDelta(subs._subKeyOf({ type: 'in-progress-issues' }), {
      added: ['P1', 'P2', 'P3'],
      updated: [],
      removed: []
    });
    subs._applyDelta(subs._subKeyOf({ type: 'closed-issues' }), {
      added: ['C1', 'C2', 'C3'],
      updated: [],
      removed: []
    });

    issues._applyEnvelope({
      topic: 'issues',
      revision: 1,
      snapshot: true,
      added: [
        { id: 'R1', priority: 2, updated_at: '2025-10-25T10:00:00Z' },
        { id: 'R2', priority: 1, updated_at: '2025-10-25T09:00:00Z' },
        { id: 'R3', priority: 1, updated_at: '2025-10-25T11:00:00Z' },
        { id: 'P1', updated_at: '2025-10-26T08:00:00Z' },
        { id: 'P2', updated_at: '2025-10-26T09:00:00Z' },
        { id: 'P3', updated_at: '2025-10-26T07:00:00Z' },
        {
          id: 'C1',
          closed_at: '2025-10-26T05:00:00Z',
          updated_at: '2025-10-25T20:00:00Z'
        },
        {
          id: 'C2',
          closed_at: '2025-10-26T06:00:00Z',
          updated_at: '2025-10-25T20:00:00Z'
        },
        {
          id: 'C3',
          closed_at: '2025-10-26T04:00:00Z',
          updated_at: '2025-10-26T07:30:00Z'
        }
      ],
      updated: [],
      removed: []
    });

    const ready = selectors
      .selectBoardColumn('tab:board:ready', 'ready')
      .map((x) => x.id);
    expect(ready).toEqual(['R3', 'R2', 'R1']);

    const inprog = selectors
      .selectBoardColumn('tab:board:in-progress', 'in_progress')
      .map((x) => x.id);
    expect(inprog).toEqual(['P2', 'P1', 'P3']);

    const closed = selectors
      .selectBoardColumn('tab:board:closed', 'closed')
      .map((x) => x.id);
    // closed_at desc: C2, C1, C3
    expect(closed).toEqual(['C2', 'C1', 'C3']);
  });

  test('selectEpicChildren uses epic:{id} client id and list sorting', async () => {
    const { subs, issues, selectors } = setup();
    await subs.subscribeList('epic:42', {
      type: 'issues-for-epic',
      params: { epic_id: '42' }
    });
    const key = subs._subKeyOf({
      type: 'issues-for-epic',
      params: { epic_id: '42' }
    });
    subs._applyDelta(key, { added: ['E1', 'E2'], updated: [], removed: [] });
    issues._applyEnvelope({
      topic: 'issues',
      revision: 1,
      snapshot: true,
      added: [
        { id: 'E1', priority: 1, updated_at: '2025-10-26T10:00:00Z' },
        { id: 'E2', priority: 1, updated_at: '2025-10-26T09:00:00Z' }
      ],
      updated: [],
      removed: []
    });
    const out = selectors.selectEpicChildren('42').map((x) => x.id);
    expect(out).toEqual(['E1', 'E2']);
  });

  test('subscribe triggers once per issues envelope', async () => {
    const { issues, selectors } = setup();
    let calls = 0;
    const off = selectors.subscribe(() => {
      calls += 1;
    });
    issues._applyEnvelope({
      topic: 'issues',
      revision: 1,
      snapshot: true,
      added: [],
      updated: [],
      removed: []
    });
    expect(calls).toBe(1);
    off();
  });
});
