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
    expect(args).toEqual(['list', '--json']);
  });

  test('mapSubscriptionToBdArgs returns args for epics', () => {
    const args = mapSubscriptionToBdArgs({ type: 'epics' });
    expect(args).toEqual(['list', '--type', 'epic', '--status', 'all', '--json']);
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
    expect(args).toEqual(['list', '--json', '--status', 'in_progress']);
  });

  test('mapSubscriptionToBdArgs returns args for closed-issues', () => {
    const args = mapSubscriptionToBdArgs({ type: 'closed-issues' });
    expect(args).toEqual(['list', '--json', '--status', 'closed']);
  });

  test('mapSubscriptionToBdArgs returns args for issue-detail', () => {
    const args = mapSubscriptionToBdArgs({
      type: 'issue-detail',
      params: { id: 'UI-123' }
    });
    expect(args).toEqual(['show', 'UI-123', '--json']);
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
