import { describe, expect, test, vi } from 'vitest';
import { bootstrap } from './main.js';

// Mock WS client before importing the app
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

describe('initial view sync on reload (#/epics)', () => {
  test('shows Epics view when hash is #/epics', async () => {
    window.location.hash = '#/epics';
    document.body.innerHTML = '<main id="app"></main>';
    const root = /** @type {HTMLElement} */ (document.getElementById('app'));

    bootstrap(root);

    // Allow any microtasks to flush
    await Promise.resolve();

    const issuesRoot = /** @type {HTMLElement} */ (
      document.getElementById('issues-root')
    );
    const epicsRoot = /** @type {HTMLElement} */ (
      document.getElementById('epics-root')
    );

    expect(issuesRoot.hidden).toBe(true);
    expect(epicsRoot.hidden).toBe(false);
  });
});
