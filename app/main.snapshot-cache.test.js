import { describe, expect, test, vi } from 'vitest';
import { createSnapshotCache } from './data/snapshot-cache.js';
import { bootstrap } from './main.js';
import { createWsClient } from './ws.js';

/** @type {{ type: string, payload: any }[]} */
const calls = [];

vi.mock('./ws.js', () => {
  /** @type {Record<string, (p:any)=>void>} */
  const handlers = {};
  const singleton = {
    /**
     * @param {string} type
     * @param {any} payload
     */
    async send(type, payload) {
      calls.push({ type, payload });
      return null;
    },
    /**
     * @param {string} type
     * @param {(p:any)=>void} handler
     */
    on(type, handler) {
      handlers[type] = handler;
      return () => {};
    },
    close() {},
    getState() {
      return 'open';
    }
  };
  return { createWsClient: () => singleton };
});

describe('main snapshot cache hydration', () => {
  test('renders cached issues before the live snapshot arrives', async () => {
    const cache = createSnapshotCache(window.localStorage);
    window.localStorage.setItem('beads-ui.workspace', '/repo');
    cache.write('/repo', { type: 'all-issues' }, [
      { id: 'UI-1', title: 'Cached One', status: 'open', priority: 1 }
    ]);

    document.body.innerHTML = '<main id="app"></main>';
    const root = /** @type {HTMLElement} */ (document.getElementById('app'));

    bootstrap(root);
    await Promise.resolve();
    await Promise.resolve();

    const rows = Array.from(
      document.querySelectorAll('#list-root tr.issue-row')
    ).map((row) => row.querySelector('td')?.textContent?.trim());

    expect(rows).toContain('UI-1');
    expect(calls.some((call) => call.type === 'subscribe-list')).toBe(true);
    void createWsClient();
  });
});
