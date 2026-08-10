import { describe, expect, test, vi } from 'vitest';
import { bootstrap } from './main.js';

vi.mock('./ws.js', () => ({
  createWsClient: () => ({
    async send() {
      return null;
    },
    on() {
      return () => {};
    },
    close() {},
    getState() {
      return 'open';
    }
  })
}));

describe('main performance-sensitive persistence', () => {
  test('does not persist unrelated state for selection-only routes', async () => {
    window.localStorage.clear();
    window.location.hash = '#/issues';
    document.body.innerHTML = '<main id="app"></main>';
    const root = /** @type {HTMLElement} */ (document.getElementById('app'));

    bootstrap(root);
    await Promise.resolve();
    const set_item = vi.spyOn(Storage.prototype, 'setItem');

    window.location.hash = '#/issues?issue=UI-LOCAL';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await Promise.resolve();

    const unrelated_writes = set_item.mock.calls.filter(([key]) =>
      ['beads-ui.filters', 'beads-ui.board', 'beads-ui.view'].includes(
        String(key)
      )
    );
    expect(unrelated_writes).toEqual([]);
  });
});
