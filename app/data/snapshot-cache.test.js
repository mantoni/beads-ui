import { describe, expect, test, vi } from 'vitest';
import { createSnapshotCache } from './snapshot-cache.js';

describe('snapshot cache', () => {
  test('reads back cached items for the same workspace and spec', () => {
    const storage = /** @type {Storage} */ (window.localStorage);
    const cache = createSnapshotCache(storage);
    const spec = { type: 'all-issues' };
    const items = [{ id: 'UI-1', title: 'One' }];

    cache.write('/repo', spec, items);

    expect(cache.read('/repo', spec)).toEqual(items);
  });

  test('returns null for stale cache entries', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-20T12:00:00Z'));
    const storage = /** @type {Storage} */ (window.localStorage);
    const cache = createSnapshotCache(storage);
    const spec = { type: 'all-issues' };
    cache.write('/repo', spec, [{ id: 'UI-1' }]);

    vi.setSystemTime(new Date('2026-04-28T12:00:01Z'));

    expect(cache.read('/repo', spec)).toBeNull();
    vi.useRealTimers();
  });
});
