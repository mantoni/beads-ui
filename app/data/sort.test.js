import { describe, expect, test } from 'vitest';
import { compareByKey, compareIdsNatural, nextSortState } from './sort.js';

/**
 * Sort a copy of items by a column key/direction and return their ids.
 *
 * @param {Array<{ id: string, created_at?: number|string, updated_at?: number|string }>} items
 * @param {'id'|'created_at'|'updated_at'} key
 * @param {'asc'|'desc'} dir
 * @returns {string[]}
 */
function sortedIds(items, key, dir) {
  return items
    .slice()
    .sort(compareByKey(key, dir))
    .map((it) => it.id);
}

describe('data/sort compareByKey', () => {
  test('sorts ids naturally so UI-10 follows UI-2', () => {
    const items = [{ id: 'UI-10' }, { id: 'UI-2' }, { id: 'UI-1' }];

    const ids = sortedIds(items, 'id', 'asc');

    expect(ids).toEqual(['UI-1', 'UI-2', 'UI-10']);
  });

  test('reverses id order when direction is desc', () => {
    const items = [{ id: 'UI-1' }, { id: 'UI-10' }, { id: 'UI-2' }];

    const ids = sortedIds(items, 'id', 'desc');

    expect(ids).toEqual(['UI-10', 'UI-2', 'UI-1']);
  });

  test('sorts by created_at ascending (oldest first)', () => {
    const items = [
      { id: 'UI-1', created_at: 300 },
      { id: 'UI-2', created_at: 100 },
      { id: 'UI-3', created_at: 200 }
    ];

    const ids = sortedIds(items, 'created_at', 'asc');

    expect(ids).toEqual(['UI-2', 'UI-3', 'UI-1']);
  });

  test('sorts by created_at descending (newest first)', () => {
    const items = [
      { id: 'UI-1', created_at: 300 },
      { id: 'UI-2', created_at: 100 },
      { id: 'UI-3', created_at: 200 }
    ];

    const ids = sortedIds(items, 'created_at', 'desc');

    expect(ids).toEqual(['UI-1', 'UI-3', 'UI-2']);
  });

  test('sorts by updated_at ascending', () => {
    const items = [
      { id: 'UI-1', updated_at: 50 },
      { id: 'UI-2', updated_at: 40 },
      { id: 'UI-3', updated_at: 60 }
    ];

    const ids = sortedIds(items, 'updated_at', 'asc');

    expect(ids).toEqual(['UI-2', 'UI-1', 'UI-3']);
  });

  test('breaks timestamp ties by natural id ascending regardless of direction', () => {
    const items = [
      { id: 'UI-10', created_at: 100 },
      { id: 'UI-2', created_at: 100 },
      { id: 'UI-1', created_at: 100 }
    ];

    const asc = sortedIds(items, 'created_at', 'asc');
    const desc = sortedIds(items, 'created_at', 'desc');

    expect(asc).toEqual(['UI-1', 'UI-2', 'UI-10']);
    expect(desc).toEqual(['UI-1', 'UI-2', 'UI-10']);
  });

  test('coerces ISO string timestamps to a comparable instant', () => {
    const items = [
      { id: 'UI-1', created_at: '2025-10-23T10:00:00.000Z' },
      { id: 'UI-2', created_at: '2025-10-20T10:00:00.000Z' },
      { id: 'UI-3', created_at: '2025-10-22T10:00:00.000Z' }
    ];

    const ids = sortedIds(items, 'created_at', 'asc');

    expect(ids).toEqual(['UI-2', 'UI-3', 'UI-1']);
  });

  test('treats missing timestamps as the epoch (sorts first ascending)', () => {
    const items = [
      { id: 'UI-1', created_at: 500 },
      { id: 'UI-2' },
      { id: 'UI-3', created_at: 100 }
    ];

    const ids = sortedIds(items, 'created_at', 'asc');

    expect(ids).toEqual(['UI-2', 'UI-3', 'UI-1']);
  });

  test('treats the bd zero-time sentinel as missing, not a real instant', () => {
    // `bd show --include-dependents` returns unenriched children this way.
    const items = [
      { id: 'UI-1', created_at: 500 },
      { id: 'UI-2', created_at: '0001-01-01T00:00:00Z' },
      { id: 'UI-3', created_at: 100 }
    ];

    const ids = sortedIds(items, 'created_at', 'asc');

    expect(ids).toEqual(['UI-2', 'UI-3', 'UI-1']);
  });
});

describe('data/sort compareIdsNatural', () => {
  test('orders by text prefix before the numeric chunk', () => {
    expect(compareIdsNatural('B-1', 'A-2')).toBe(1);
    expect(compareIdsNatural('A-2', 'B-1')).toBe(-1);
  });

  test('a shorter id sorts before its longer prefix-sharing sibling', () => {
    expect(compareIdsNatural('UI-2', 'UI-2a')).toBe(-1);
    expect(compareIdsNatural('UI-2a', 'UI-2')).toBe(1);
  });

  test('returns 0 for identical ids', () => {
    expect(compareIdsNatural('UI-7', 'UI-7')).toBe(0);
  });
});

describe('data/sort nextSortState', () => {
  test('starts a fresh column ascending', () => {
    expect(nextSortState({ key: null, dir: 'asc' }, 'id')).toEqual({
      key: 'id',
      dir: 'asc'
    });
  });

  test('flips ascending to descending on the active column', () => {
    expect(nextSortState({ key: 'id', dir: 'asc' }, 'id')).toEqual({
      key: 'id',
      dir: 'desc'
    });
  });

  test('clears the sort on the third click, restoring default order', () => {
    expect(nextSortState({ key: 'id', dir: 'desc' }, 'id')).toEqual({
      key: null,
      dir: 'asc'
    });
  });

  test('switching to a different column resets to ascending', () => {
    expect(nextSortState({ key: 'id', dir: 'desc' }, 'created_at')).toEqual({
      key: 'created_at',
      dir: 'asc'
    });
  });
});
