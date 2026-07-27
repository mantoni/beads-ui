import { describe, expect, test } from 'vitest';
import { createStore } from './state.js';

describe('state store', () => {
  test('get/set/subscribe works and dedupes unchanged', () => {
    const store = createStore();
    const seen = [];
    const off = store.subscribe((s) => seen.push(s));

    store.setState({ selected_id: 'UI-1' });
    store.setState({ filters: { status: ['open'] } });
    // no-op (equal selection, fresh array)
    store.setState({ filters: { status: ['open'] } });
    off();

    expect(seen.length).toBe(2);
    const state = store.getState();
    expect(state.selected_id).toBe('UI-1');
    expect(state.filters.status).toEqual(['open']);
  });

  test('defaults the status filter to an empty selection', () => {
    const store = createStore();

    expect(store.getState().filters.status).toEqual([]);
  });

  test('normalizes a legacy scalar status filter', () => {
    const store = createStore({
      filters: { status: /** @type {any} */ ('open'), search: '', type: '' }
    });

    expect(store.getState().filters.status).toEqual(['open']);
  });
});
