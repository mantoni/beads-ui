import { describe, expect, test, vi } from 'vitest';
import { createDetailView } from './detail.js';

/** @type {(impl: (type: string, payload?: unknown) => Promise<any>) => (type: string, payload?: unknown) => Promise<any>} */
const mockSend = (impl) => vi.fn(impl);

describe('views/detail toast', () => {
  test('applies fixed positioning to toast', async () => {
    vi.useFakeTimers();
    document.body.innerHTML =
      '<section class="panel"><div id="mount"></div></section>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));

    const initial = { id: 'UI-110', title: 'X', status: 'open', priority: 2 };
    const stores = {
      /** @param {string} id */
      snapshotFor(id) {
        return id === 'detail:UI-110' ? [initial] : [];
      },
      subscribe() {
        return () => {};
      }
    };
    const send = mockSend(async (type) => {
      if (type === 'update-priority') {
        throw new Error('boom');
      }
      throw new Error('Unexpected');
    });

    const view = createDetailView(mount, send, undefined, stores);
    await view.load('UI-110');

    const prio = /** @type {HTMLSelectElement} */ (
      mount.querySelector('select.badge--priority')
    );
    prio.value = '3';
    prio.dispatchEvent(new Event('change'));

    await Promise.resolve();

    const toast = /** @type {HTMLDivElement} */ (
      document.body.querySelector('.toast')
    );
    expect(toast).not.toBeNull();
    expect(toast.style.position).toBe('fixed');
    expect(toast.style.zIndex).toBe('1000');

    await vi.advanceTimersByTimeAsync(3000);
    vi.useRealTimers();
  });
});
