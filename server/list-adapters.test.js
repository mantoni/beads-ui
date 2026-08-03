import { beforeEach, describe, expect, test, vi } from 'vitest';
import { runBdJson } from './bd.js';
import {
  fetchListForSubscription,
  mapSubscriptionToBdArgs
} from './list-adapters.js';

vi.mock('./bd.js', () => ({ runBdJson: vi.fn() }));

describe('list adapters for subscription types', () => {
  beforeEach(() => {
    /** @type {import('vitest').Mock} */ (runBdJson).mockReset();
  });

  test('mapSubscriptionToBdArgs returns args for all-issues', () => {
    const args = mapSubscriptionToBdArgs({ type: 'all-issues' });
    // `--limit 0` = unlimited; without it bd list truncates at its default 50
    expect(args).toEqual(['list', '--json', '--tree=false', '--limit', '0']);
  });

  test('mapSubscriptionToBdArgs returns args for epics', () => {
    const args = mapSubscriptionToBdArgs({ type: 'epics' });
    expect(args).toEqual(['epic', 'status', '--json']);
  });

  test('mapSubscriptionToBdArgs returns args for blocked-issues', () => {
    const args = mapSubscriptionToBdArgs({ type: 'blocked-issues' });
    // We choose dedicated subcommand mapping for blocked
    expect(args).toEqual(['blocked', '--json']);
  });

  test('mapSubscriptionToBdArgs returns args for ready-issues', () => {
    const args = mapSubscriptionToBdArgs({ type: 'ready-issues' });
    expect(args).toEqual(['ready', '--limit', '1000', '--json']);
  });

  test('mapSubscriptionToBdArgs returns args for in-progress-issues', () => {
    const args = mapSubscriptionToBdArgs({ type: 'in-progress-issues' });
    // `--limit 0` = unlimited; without it bd list truncates at its default 50
    expect(args).toEqual([
      'list',
      '--json',
      '--tree=false',
      '--status',
      'in_progress',
      '--limit',
      '0'
    ]);
  });

  test('mapSubscriptionToBdArgs returns args for closed-issues', () => {
    const args = mapSubscriptionToBdArgs({ type: 'closed-issues' });
    expect(args).toEqual([
      'list',
      '--json',
      '--tree=false',
      '--status',
      'closed',
      '--limit',
      '1000'
    ]);
  });

  test('mapSubscriptionToBdArgs returns args for status-blocked-issues', () => {
    const args = mapSubscriptionToBdArgs({ type: 'status-blocked-issues' });
    // `bd blocked` only reports dependency-blocked issues, so issues whose
    // stored status is `blocked` need their own list query.
    // `--limit 0` = unlimited; without it bd list truncates at its default 50
    expect(args).toEqual([
      'list',
      '--json',
      '--tree=false',
      '--status',
      'blocked',
      '--limit',
      '0'
    ]);
  });

  test('mapSubscriptionToBdArgs returns args for issue-detail', () => {
    const args = mapSubscriptionToBdArgs({
      type: 'issue-detail',
      params: { id: 'UI-123' }
    });
    expect(args).toEqual(['show', 'UI-123', '--json', '--include-dependents']);
  });

  test('fetchListForSubscription returns normalized items (Date.parse)', async () => {
    /** @type {import('vitest').Mock} */ (runBdJson).mockResolvedValue({
      code: 0,
      stdoutJson: [
        {
          id: 'A-1',
          updated_at: '2024-01-01T00:00:00.000Z',
          closed_at: null,
          extra: 'x'
        },
        {
          id: 'A-2',
          updated_at: '2024-01-01T00:00:01.000Z',
          closed_at: '2024-01-01T00:00:05.000Z'
        },
        { id: 3, updated_at: 'not-a-date' }
      ]
    });
    const res = await fetchListForSubscription({ type: 'all-issues' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.items.length).toBe(3);
      expect(res.items[0]).toMatchObject({
        id: 'A-1',
        updated_at: Date.parse('2024-01-01T00:00:00.000Z'),
        closed_at: null
      });
      expect(res.items[1]).toMatchObject({
        id: 'A-2',
        updated_at: Date.parse('2024-01-01T00:00:01.000Z'),
        closed_at: Date.parse('2024-01-01T00:00:05.000Z')
      });
      // id coerced to string, closed_at defaults to null
      expect(res.items[2]).toMatchObject({
        id: '3',
        updated_at: 0,
        closed_at: null
      });
    }
  });

  test('filters tombstoned epics', async () => {
    /** @type {import('vitest').Mock} */ (runBdJson).mockResolvedValue({
      code: 0,
      stdoutJson: [
        {
          epic: {
            id: 'E-1',
            status: 'open',
            issue_type: 'epic',
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
            closed_at: null
          },
          total_children: 1,
          closed_children: 0,
          eligible_for_close: false
        },
        {
          epic: {
            id: 'E-2',
            status: 'tombstone',
            issue_type: 'epic',
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
            closed_at: null,
            deleted_at: '2024-02-01T00:00:00.000Z'
          },
          total_children: 0,
          closed_children: 0,
          eligible_for_close: false
        }
      ]
    });

    const res = await fetchListForSubscription({ type: 'epics' });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.items).toHaveLength(1);
      expect(res.items[0]).toMatchObject({
        id: 'E-1',
        status: 'open'
      });
    }
  });

  test('issue-detail for an epic enriches dependents with real child timestamps', async () => {
    // `bd show <id> --json --include-dependents` returns dependents whose
    // created_at/updated_at are zeroed (Go's 0001-01-01). The real values are
    // fetched from a second `bd show <id> --children --json` call and merged.
    /** @type {import('vitest').Mock} */ (runBdJson).mockImplementation(
      async (/** @type {string[]} */ args) => {
        if (args.includes('--children')) {
          return {
            code: 0,
            stdoutJson: {
              'E-1': [
                {
                  id: 'C-2',
                  created_at: '2025-10-22T09:14:01Z',
                  updated_at: '2025-10-24T10:24:05Z',
                  closed_at: null
                },
                {
                  id: 'C-1',
                  created_at: '2025-10-20T09:00:00Z',
                  updated_at: '2025-10-21T09:00:00Z',
                  closed_at: '2025-10-25T09:00:00Z'
                }
              ]
            }
          };
        }
        return {
          code: 0,
          stdoutJson: {
            id: 'E-1',
            issue_type: 'epic',
            created_at: '2025-10-19T09:00:00Z',
            updated_at: '2025-10-26T09:00:00Z',
            closed_at: null,
            dependents: [
              {
                id: 'C-1',
                title: 'One',
                status: 'open',
                created_at: '0001-01-01T00:00:00Z',
                updated_at: '0001-01-01T00:00:00Z'
              },
              {
                id: 'C-2',
                title: 'Two',
                status: 'closed',
                created_at: '0001-01-01T00:00:00Z',
                updated_at: '0001-01-01T00:00:00Z'
              }
            ]
          }
        };
      }
    );

    const res = await fetchListForSubscription({
      type: 'issue-detail',
      params: { id: 'E-1' }
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      const epic = res.items[0];
      const dependents = /** @type {any[]} */ (epic.dependents);
      const c1 = dependents.find((d) => d.id === 'C-1');
      const c2 = dependents.find((d) => d.id === 'C-2');
      // Real timestamps merged in as epoch-ms numbers, not zeroed.
      expect(c1.created_at).toBe(Date.parse('2025-10-20T09:00:00Z'));
      expect(c1.updated_at).toBe(Date.parse('2025-10-21T09:00:00Z'));
      expect(c1.closed_at).toBe(Date.parse('2025-10-25T09:00:00Z'));
      expect(c2.created_at).toBe(Date.parse('2025-10-22T09:14:01Z'));
      expect(c2.updated_at).toBe(Date.parse('2025-10-24T10:24:05Z'));
      expect(c2.closed_at).toBe(null);
    }
  });

  test('issue-detail keeps dependents unchanged when the children call fails', async () => {
    // A failed cosmetic --children call must not break the whole epic fetch.
    /** @type {import('vitest').Mock} */ (runBdJson).mockImplementation(
      async (/** @type {string[]} */ args) => {
        if (args.includes('--children')) {
          return { code: 2, stderr: 'boom' };
        }
        return {
          code: 0,
          stdoutJson: {
            id: 'E-1',
            issue_type: 'epic',
            created_at: '2025-10-19T09:00:00Z',
            updated_at: '2025-10-26T09:00:00Z',
            closed_at: null,
            dependents: [
              {
                id: 'C-1',
                title: 'One',
                status: 'open',
                created_at: '0001-01-01T00:00:00Z',
                updated_at: '0001-01-01T00:00:00Z'
              }
            ]
          }
        };
      }
    );

    const res = await fetchListForSubscription({
      type: 'issue-detail',
      params: { id: 'E-1' }
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      const dependents = /** @type {any[]} */ (res.items[0].dependents);
      // Left as the zero-time sentinel; the client renders it as blank.
      expect(dependents[0].created_at).toBe('0001-01-01T00:00:00Z');
    }
  });

  test('issue-detail leaves a dependent untouched when absent from the children map', async () => {
    /** @type {import('vitest').Mock} */ (runBdJson).mockImplementation(
      async (/** @type {string[]} */ args) => {
        if (args.includes('--children')) {
          return {
            code: 0,
            stdoutJson: {
              'E-1': [
                {
                  id: 'C-1',
                  created_at: '2025-10-20T09:00:00Z',
                  updated_at: '2025-10-21T09:00:00Z',
                  closed_at: null
                }
              ]
            }
          };
        }
        return {
          code: 0,
          stdoutJson: {
            id: 'E-1',
            issue_type: 'epic',
            created_at: '2025-10-19T09:00:00Z',
            updated_at: '2025-10-26T09:00:00Z',
            closed_at: null,
            dependents: [
              {
                id: 'C-1',
                title: 'One',
                status: 'open',
                created_at: '0001-01-01T00:00:00Z',
                updated_at: '0001-01-01T00:00:00Z'
              },
              {
                id: 'C-2',
                title: 'Two',
                status: 'open',
                created_at: '0001-01-01T00:00:00Z',
                updated_at: '0001-01-01T00:00:00Z'
              }
            ]
          }
        };
      }
    );

    const res = await fetchListForSubscription({
      type: 'issue-detail',
      params: { id: 'E-1' }
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      const dependents = /** @type {any[]} */ (res.items[0].dependents);
      const c1 = dependents.find((d) => d.id === 'C-1');
      const c2 = dependents.find((d) => d.id === 'C-2');
      expect(c1.created_at).toBe(Date.parse('2025-10-20T09:00:00Z'));
      // Not in the children map → left as the sentinel, not overwritten.
      expect(c2.created_at).toBe('0001-01-01T00:00:00Z');
    }
  });

  test('issue-detail for a non-epic does not fetch children', async () => {
    /** @type {import('vitest').Mock} */ (runBdJson).mockResolvedValue({
      code: 0,
      stdoutJson: {
        id: 'T-1',
        issue_type: 'task',
        created_at: '2025-10-19T09:00:00Z',
        updated_at: '2025-10-26T09:00:00Z',
        closed_at: null,
        dependents: [{ id: 'T-2', title: 'Dep', status: 'open' }]
      }
    });

    const res = await fetchListForSubscription({
      type: 'issue-detail',
      params: { id: 'T-1' }
    });

    expect(res.ok).toBe(true);
    // Only the primary `show --include-dependents` call, no `--children` call.
    const mock = /** @type {import('vitest').Mock} */ (runBdJson);
    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock.mock.calls[0][0]).not.toContain('--children');
  });

  test('fetchListForSubscription surfaces bd error', async () => {
    /** @type {import('vitest').Mock} */ (runBdJson).mockResolvedValue({
      code: 2,
      stderr: 'boom'
    });
    const res = await fetchListForSubscription({ type: 'all-issues' });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('bd_error');
      expect(res.error.message).toContain('boom');
      expect(res.error.details && res.error.details.exit_code).toBe(2);
    }
  });

  test('fetchListForSubscription returns error for unknown type', async () => {
    const res = await fetchListForSubscription(
      /** @type {any} */ ({ type: 'unknown' })
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('bad_request');
      expect(res.error.message).toMatch(/Unknown subscription type/);
    }
  });
});
