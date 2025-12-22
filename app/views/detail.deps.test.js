import { describe, expect, test, vi } from 'vitest';
import { createDetailView } from './detail.js';

function setupDom() {
  const root = document.createElement('div');
  document.body.appendChild(root);
  return root;
}

describe('views/detail dependencies', () => {
  test('adds Dependencies link and re-renders', async () => {
    const mount = setupDom();
    let current = { id: 'UI-10', title: 'X', dependencies: [], dependents: [] };
    const stores1 = {
      /** @param {string} id */
      snapshotFor(id) {
        return id === 'detail:UI-10' ? [current] : [];
      },
      subscribe() {
        return () => {};
      }
    };
    const send = vi.fn(async (type) => {
      if (type === 'dep-add') {
        return current;
      }
      throw new Error('Unexpected');
    });
    const view = createDetailView(mount, send, undefined, stores1);
    await view.load('UI-10');

    // Click Dependencies tab
    const depsTab = Array.from(
      mount.querySelectorAll('.detail-tabs .tab')
    ).find((el) => el.textContent?.trim() === 'Dependencies');
    depsTab?.dispatchEvent(new window.Event('click'));

    const input = mount.querySelector('[data-testid="add-dependency"]');
    expect(input).toBeTruthy();
    const el = /** @type {HTMLInputElement} */ (input);
    el.value = 'UI-2';
    const addBtn = el.nextElementSibling;
    addBtn?.dispatchEvent(new window.Event('click'));

    // Next tick
    await Promise.resolve();

    // Should have called dep-add
    const calls = send.mock.calls.map((c) => c[0]);
    expect(calls.includes('dep-add')).toBe(true);
  });

  test('removes Blocks link', async () => {
    const mount = setupDom();
    let current2 = {
      id: 'UI-20',
      title: 'Y',
      dependencies: [],
      dependents: [{ id: 'UI-5' }]
    };
    const stores2 = {
      /** @param {string} id */
      snapshotFor(id) {
        return id === 'detail:UI-20' ? [current2] : [];
      },
      subscribe() {
        return () => {};
      }
    };
    const send = vi.fn(async (type) => {
      if (type === 'dep-remove') {
        return { id: 'UI-20', dependencies: [], dependents: [] };
      }
      throw new Error('Unexpected');
    });
    const view = createDetailView(mount, send, undefined, stores2);
    await view.load('UI-20');

    // Click Dependencies tab
    const depsTab = Array.from(
      mount.querySelectorAll('.detail-tabs .tab')
    ).find((el) => el.textContent?.trim() === 'Dependencies');
    depsTab?.dispatchEvent(new window.Event('click'));

    // Find the remove button next to link #5
    const btns = mount.querySelectorAll('button');
    const rm = Array.from(btns).find((b) =>
      b.getAttribute('aria-label')?.includes('UI-5')
    );
    expect(rm).toBeTruthy();
    rm?.dispatchEvent(new window.Event('click'));

    await Promise.resolve();
    const calls = send.mock.calls.map((c) => c[0]);
    expect(calls.includes('dep-remove')).toBe(true);
  });

  test('prevents duplicate link add', async () => {
    const mount = setupDom();
    const current3 = {
      id: 'UI-30',
      dependencies: [{ id: 'UI-9' }],
      dependents: []
    };
    const stores3 = {
      /** @param {string} id */
      snapshotFor(id) {
        return id === 'detail:UI-30' ? [current3] : [];
      },
      subscribe() {
        return () => {};
      }
    };
    // eslint-disable-next-line no-unused-vars
    const send = vi.fn(async (type) => current3);
    const view = createDetailView(mount, send, undefined, stores3);
    await view.load('UI-30');

    // Click Dependencies tab
    const depsTab = Array.from(
      mount.querySelectorAll('.detail-tabs .tab')
    ).find((el) => el.textContent?.trim() === 'Dependencies');
    depsTab?.dispatchEvent(new window.Event('click'));

    const input = mount.querySelector('[data-testid="add-dependency"]');
    const el = /** @type {HTMLInputElement} */ (input);
    el.value = 'UI-9';
    const addBtn = el.nextElementSibling;
    addBtn?.dispatchEvent(new window.Event('click'));

    await Promise.resolve();
    // send should not be called with dep-add
    const calls = send.mock.calls.map((c) => c[0]);
    expect(calls.includes('dep-add')).toBe(false);
  });
});
