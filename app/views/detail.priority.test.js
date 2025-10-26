import { describe, expect, test, vi } from 'vitest';
import { createDetailView } from './detail.js';

/** @type {(impl: (type: string, payload?: unknown) => Promise<any>) => (type: string, payload?: unknown) => Promise<any>} */
const mockSend = (impl) => vi.fn(impl);

describe('views/detail priority edit', () => {
  test('updates priority via dropdown and re-renders from reply', async () => {
    document.body.innerHTML =
      '<section class="panel"><div id="mount"></div></section>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));

    const initial = {
      id: 'UI-70',
      title: 'P',
      description: '',
      status: 'open',
      priority: 2
    };
    const stores = {
      /** @param {string} id */
      snapshotFor(id) {
        return id === 'detail:UI-70' ? [initial] : [];
      },
      subscribe() {
        return () => {};
      }
    };
    const send = mockSend(async (type, payload) => {
      if (type === 'update-priority') {
        expect(payload).toEqual({ id: 'UI-70', priority: 4 });
        return { ...initial, priority: 4 };
      }
      throw new Error('Unexpected');
    });

    const view = createDetailView(mount, send, undefined, stores);
    await view.load('UI-70');

    const selects = mount.querySelectorAll('select.badge--priority');
    expect(selects.length).toBe(1);
    const prio = /** @type {HTMLSelectElement} */ (selects[0]);
    expect(prio.value).toBe('2');

    prio.value = '4';
    prio.dispatchEvent(new Event('change'));

    await Promise.resolve();

    const prio2 = /** @type {HTMLSelectElement} */ (
      mount.querySelector('select.badge--priority')
    );
    expect(prio2.value).toBe('4');
  });

  test('shows toast on error and restores previous value', async () => {
    document.body.innerHTML =
      '<section class="panel"><div id="mount"></div></section>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));

    const initial = { id: 'UI-71', title: 'Q', status: 'open', priority: 1 };
    const stores = {
      /** @param {string} id */
      snapshotFor(id) {
        return id === 'detail:UI-71' ? [initial] : [];
      },
      subscribe() {
        return () => {};
      }
    };
    const send = mockSend(async (type) => {
      if (type === 'update-priority') {
        throw new Error('oops');
      }
      throw new Error('Unexpected');
    });

    const view = createDetailView(mount, send, undefined, stores);
    await view.load('UI-71');
    const prio = /** @type {HTMLSelectElement} */ (
      mount.querySelector('select.badge--priority')
    );
    expect(prio.value).toBe('1');

    prio.value = '3';
    prio.dispatchEvent(new Event('change'));

    await Promise.resolve();

    const toast = document.body.querySelector('.toast');
    expect(toast).toBeTruthy();
    // Should restore previous value
    const prio2 = /** @type {HTMLSelectElement} */ (
      mount.querySelector('select.badge--priority')
    );
    expect(prio2.value).toBe('1');
  });
});
