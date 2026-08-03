import { describe, expect, test } from 'vitest';
import { compareByKey } from './sort.js';

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
});
