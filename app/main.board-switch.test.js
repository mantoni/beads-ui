import { describe, expect, test, vi } from 'vitest';
import { bootstrap } from './main.js';

// Mock the Board view to manipulate DOM content deterministically
vi.mock('./views/board.js', () => ({
  /**
   * @param {HTMLElement} mount
   */
  createBoardView: (mount) => ({
    async load() {
      // Simulate a rendered board shell
      mount.innerHTML = '<div class="panel__body board-root"></div>';
    },
    clear() {
      // No-op in this test; we no longer depend on clearing when switching views
    }
  })
}));

// Mock WS client to avoid network and provide minimal data
vi.mock('./ws.js', () => ({
  createWsClient: () => ({
    /**
     * @param {string} type
     */
    async send(type) {
      void type;
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

describe('board visibility on view change', () => {
  test('hides board when leaving and shows again when returning', async () => {
    // Start on issues, then go to board so subscribers are active
    window.location.hash = '#/issues';
    document.body.innerHTML = '<main id="app"></main>';
    const root = /** @type {HTMLElement} */ (document.getElementById('app'));

    bootstrap(root);

    // Allow initial render to flush
    await Promise.resolve();
    await Promise.resolve();

    const boardRoot = /** @type {HTMLElement} */ (
      document.getElementById('board-root')
    );

    // Navigate to board
    window.location.hash = '#/board';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await Promise.resolve();
    await Promise.resolve();

    // Board is visible and rendered with its internal shell
    expect(boardRoot.hidden).toBe(false);
    expect(boardRoot.querySelector('.board-root')).not.toBeNull();

    // Navigate away to issues
    window.location.hash = '#/issues';
    window.dispatchEvent(new HashChangeEvent('hashchange'));

    await Promise.resolve();
    await Promise.resolve();

    // Board route gets hidden but DOM may remain; CSS [hidden] must hide it
    expect(boardRoot.hidden).toBe(true);
    expect(boardRoot.querySelector('.board-root')).not.toBeNull();

    // Go back to Board, content is still there (or re-rendered by load)
    window.location.hash = '#/board';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await Promise.resolve();
    await Promise.resolve();
    expect(boardRoot.hidden).toBe(false);
    expect(boardRoot.querySelector('.board-root')).not.toBeNull();
  });
});
