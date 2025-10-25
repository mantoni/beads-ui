import { describe, expect, test } from 'vitest';
import { createBoardView } from './board.js';

describe('views/board persisted closed filter via store', () => {
  test('applies persisted closed_filter and updates store on change', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));

    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    const data = {
      async getReady() {
        return [];
      },
      async getInProgress() {
        return [];
      },
      async getClosed() {
        return [
          { id: 'A', closed_at: new Date(now - 8 * oneDay).toISOString() },
          { id: 'B', closed_at: new Date(now - 2 * oneDay).toISOString() },
          { id: 'C', closed_at: new Date(now).toISOString() }
        ];
      }
    };

    /** @type {{ state: any, subs: ((s:any)=>void)[], getState: () => any, setState: (patch:any)=>void, subscribe: (fn:(s:any)=>void)=>()=>void }} */
    const store = {
      state: {
        selected_id: null,
        view: 'board',
        filters: { status: 'all', search: '', type: '' },
        board: { closed_filter: '7' }
      },
      subs: [],
      getState() {
        return this.state;
      },
      setState(patch) {
        this.state = {
          ...this.state,
          ...(patch || {}),
          filters: { ...this.state.filters, ...(patch.filters || {}) },
          board: { ...this.state.board, ...(patch.board || {}) }
        };
        for (const fn of this.subs) {
          fn(this.state);
        }
      },
      subscribe(fn) {
        this.subs.push(fn);
        return () => {
          this.subs = this.subs.filter((f) => f !== fn);
        };
      }
    };

    const view = createBoardView(
      mount,
      /** @type {any} */ (data),
      () => {},
      store
    );
    await view.load();

    // With persisted '7' days, B and C visible (A is 8 days old)
    let closed_ids = Array.from(
      mount.querySelectorAll('#closed-col .board-card')
    ).map((el) => el.getAttribute('data-issue-id'));
    expect(closed_ids).toEqual(['C', 'B']);

    // Select reflects persisted value
    const select = /** @type {HTMLSelectElement} */ (
      mount.querySelector('#closed-filter')
    );
    expect(select.value).toBe('7');

    // Change to '3' and ensure store updates
    select.value = '3';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(store.getState().board.closed_filter).toBe('3');

    // Now still B and C visible (both within 3 days)
    closed_ids = Array.from(
      mount.querySelectorAll('#closed-col .board-card')
    ).map((el) => el.getAttribute('data-issue-id'));
    expect(closed_ids).toEqual(['C', 'B']);
  });
});
