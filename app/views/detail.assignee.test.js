import { describe, expect, test, vi } from 'vitest';
import { createDetailView } from './detail.js';

/** @type {(impl: (type: string, payload?: unknown) => Promise<any>) => (type: string, payload?: unknown) => Promise<any>} */
const mockSend = (impl) => vi.fn(impl);

describe('views/detail assignee edit', () => {
  test('edits assignee via Properties control', async () => {
    document.body.innerHTML =
      '<section class="panel"><div id="mount"></div></section>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));

    const issue = {
      id: 'UI-57',
      title: 'Detail screen',
      description: '',
      status: 'open',
      priority: 2,
      assignee: 'alice',
      dependencies: [],
      dependents: []
    };

    const stores1 = {
      /** @param {string} id */
      snapshotFor(id) {
        return id === 'detail:UI-57' ? [issue] : [];
      },
      subscribe() {
        return () => {};
      }
    };
    const send = mockSend(async (type, payload) => {
      if (type === 'update-assignee') {
        expect(payload).toEqual({ id: 'UI-57', assignee: 'max' });
        const next = { ...issue, assignee: 'max' };
        return next;
      }
      throw new Error('Unexpected');
    });

    const view = createDetailView(mount, send, undefined, stores1);
    await view.load('UI-57');

    const assigneeSpan = /** @type {HTMLSpanElement} */ (
      mount.querySelector('#detail-root .prop.assignee .value .editable')
    );
    expect(assigneeSpan).toBeTruthy();
    expect(assigneeSpan.textContent).toBe('alice');

    assigneeSpan.click();
    const input = /** @type {HTMLInputElement} */ (
      mount.querySelector('#detail-root .prop.assignee input')
    );
    const saveBtn = /** @type {HTMLButtonElement} */ (
      mount.querySelector('#detail-root .prop.assignee button')
    );
    input.value = 'max';
    saveBtn.click();

    await Promise.resolve();

    const assigneeSpan2 = /** @type {HTMLSpanElement} */ (
      mount.querySelector('#detail-root .prop.assignee .value .editable')
    );
    expect(assigneeSpan2.textContent).toBe('max');
  });

  test('shows editable placeholder when unassigned', async () => {
    document.body.innerHTML =
      '<section class="panel"><div id="mount"></div></section>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));

    const issue = {
      id: 'UI-88',
      title: 'No assignee yet',
      description: '',
      status: 'open',
      priority: 2,
      // no assignee field
      dependencies: [],
      dependents: []
    };

    const stores2 = {
      /** @param {string} id */
      snapshotFor(id) {
        return id === 'detail:UI-88' ? [issue] : [];
      },
      subscribe() {
        return () => {};
      }
    };
    const send = mockSend(async (type, payload) => {
      if (type === 'update-assignee') {
        const next = {
          ...issue,
          assignee: /** @type {any} */ (payload).assignee
        };
        return next;
      }
      throw new Error('Unexpected');
    });

    const view = createDetailView(mount, send, undefined, stores2);
    await view.load('UI-88');

    const ph = /** @type {HTMLSpanElement} */ (
      mount.querySelector('#detail-root .prop.assignee .value .editable')
    );
    expect(ph).toBeTruthy();
    expect(ph.className).toContain('muted');
    expect(ph.textContent).toBe('Unassigned');

    ph.click();
    const input = /** @type {HTMLInputElement} */ (
      mount.querySelector('#detail-root .prop.assignee input')
    );
    expect(input).toBeTruthy();
  });

  test('clears assignee to empty string and shows placeholder', async () => {
    document.body.innerHTML =
      '<section class="panel"><div id="mount"></div></section>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));

    const issue = {
      id: 'UI-31',
      title: 'Clearable',
      status: 'open',
      priority: 2,
      assignee: 'bob',
      dependencies: [],
      dependents: []
    };

    const stores3 = {
      /** @param {string} id */
      snapshotFor(id) {
        return id === 'detail:UI-31' ? [issue] : [];
      },
      subscribe() {
        return () => {};
      }
    };
    const send = mockSend(async (type, payload) => {
      if (type === 'update-assignee') {
        const next = {
          ...issue,
          assignee: /** @type {any} */ (payload).assignee
        };
        return next;
      }
      throw new Error('Unexpected');
    });

    const view = createDetailView(mount, send, undefined, stores3);
    await view.load('UI-31');

    const span = /** @type {HTMLSpanElement} */ (
      mount.querySelector('#detail-root .prop.assignee .value .editable')
    );
    span.click();
    const input = /** @type {HTMLInputElement} */ (
      mount.querySelector('#detail-root .prop.assignee input')
    );
    const save = /** @type {HTMLButtonElement} */ (
      mount.querySelector('#detail-root .prop.assignee button')
    );
    input.value = '';
    save.click();
    await Promise.resolve();
    const span2 = /** @type {HTMLSpanElement} */ (
      mount.querySelector('#detail-root .prop.assignee .value .editable')
    );
    expect(span2.textContent).toBe('Unassigned');
    expect(span2.className).toContain('muted');
  });
});
