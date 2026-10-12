import { describe, expect, test, vi } from 'vitest';
import { createDetailView } from './detail.js';

function setupDom() {
  const root = document.createElement('div');
  document.body.appendChild(root);
  return root;
}

describe('views/detail dependencies', () => {
  test('renders linked issue identities and statuses', async () => {
    const mount = setupDom();
    const issue = {
      id: 'UI-40',
      dependencies: [
        {
          id: 'UI-25',
          title: 'Build the API',
          status: 'closed',
          issue_type: 'task'
        },
        {
          id: 'UI-27',
          title: 'Wire the client',
          status: 'in_progress',
          issue_type: 'feature'
        }
      ],
      dependents: [{ id: 'UI-34', title: 'Release the feature' }]
    };
    const stores = {
      /** @param {string} id */
      snapshotFor(id) {
        return id === 'detail:UI-40' ? [issue] : [];
      },
      subscribe() {
        return () => {};
      }
    };
    const view = createDetailView(mount, async () => ({}), undefined, stores);

    await view.load('UI-40');

    const linked_items = Array.from(
      mount.querySelectorAll('.dependency-item')
    ).map((item) => ({
      id: item.querySelector('.dependency-item__id')?.textContent,
      summary: item.querySelector('.dependency-item__summary')?.textContent,
      status: item.querySelector('.status-badge')?.textContent
    }));
    expect(linked_items).toEqual([
      { id: 'UI-25', summary: 'Build the API', status: 'Closed' },
      { id: 'UI-27', summary: 'Wire the client', status: 'In progress' },
      { id: 'UI-34', summary: 'Release the feature', status: 'Unknown' }
    ]);
  });

  test('uses native anchors for linked issue navigation', async () => {
    const mount = setupDom();
    const issue = {
      id: 'UI-41',
      dependencies: [{ id: 'UI-25' }],
      dependents: [{ id: 'UI-34' }]
    };
    const stores = {
      /** @param {string} id */
      snapshotFor(id) {
        return id === 'detail:UI-41' ? [issue] : [];
      },
      subscribe() {
        return () => {};
      }
    };
    const view = createDetailView(mount, async () => ({}), undefined, stores);

    await view.load('UI-41');

    const hrefs = Array.from(
      mount.querySelectorAll('.dependency-item__link')
    ).map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual(['#/issues?issue=UI-25', '#/issues?issue=UI-34']);
  });

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
