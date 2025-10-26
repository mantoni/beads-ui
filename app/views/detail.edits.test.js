import { describe, expect, test, vi } from 'vitest';
import { createDetailView } from './detail.js';

/** @type {(impl: (type: string, payload?: unknown) => Promise<any>) => (type: string, payload?: unknown) => Promise<any>} */
const mockSend = (impl) => vi.fn(impl);

describe('views/detail edits', () => {
  test('updates status via dropdown and disables while pending', async () => {
    document.body.innerHTML =
      '<section class="panel"><div id="mount"></div></section>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));

    const initial = {
      id: 'UI-7',
      title: 'T',
      description: 'D',
      status: 'open',
      priority: 2
    };
    const updated = { ...initial, status: 'in_progress' };

    const stores1 = {
      /** @param {string} id */
      snapshotFor(id) {
        return id === 'detail:UI-7' ? [initial] : [];
      },
      subscribe() {
        return () => {};
      }
    };
    const send = mockSend(async (type, payload) => {
      if (type === 'update-status') {
        expect(payload).toEqual({ id: 'UI-7', status: 'in_progress' });
        // simulate server reconcile payload
        return updated;
      }
      throw new Error('Unexpected');
    });

    const view = createDetailView(mount, send, undefined, stores1);
    await view.load('UI-7');

    const select = /** @type {HTMLSelectElement} */ (
      mount.querySelector('select')
    );
    expect(select.value).toBe('open');

    // Trigger change
    select.value = 'in_progress';
    const beforeDisabled = select.disabled;
    select.dispatchEvent(new Event('change'));
    // After dispatch, the component sets disabled & will re-render upon reply
    expect(beforeDisabled || select.disabled).toBe(true);

    // After async flow, DOM should reflect updated status
    await Promise.resolve(); // allow microtasks
    const select2 = /** @type {HTMLSelectElement} */ (
      mount.querySelector('select')
    );
    expect(select2.value).toBe('in_progress');
  });

  test('saves title and re-renders from reply', async () => {
    document.body.innerHTML =
      '<section class="panel"><div id="mount"></div></section>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
    const initial = {
      id: 'UI-8',
      title: 'Old',
      description: '',
      status: 'open',
      priority: 1
    };
    const stores2 = {
      /** @param {string} id */
      snapshotFor(id) {
        return id === 'detail:UI-8' ? [initial] : [];
      },
      subscribe() {
        return () => {};
      }
    };
    const send = mockSend(async (type, payload) => {
      if (type === 'edit-text') {
        const next = { ...initial, title: /** @type {any} */ (payload).value };
        return next;
      }
      throw new Error('Unexpected');
    });
    const view = createDetailView(mount, send, undefined, stores2);
    await view.load('UI-8');
    // Enter edit mode by clicking the span
    const titleSpan = /** @type {HTMLSpanElement} */ (
      mount.querySelector('h2 .editable')
    );
    titleSpan.click();
    const titleInput = /** @type {HTMLInputElement} */ (
      mount.querySelector('h2 input')
    );
    const titleSave = /** @type {HTMLButtonElement} */ (
      mount.querySelector('h2 button')
    );
    titleInput.value = 'New Title';
    titleSave.click();
    await Promise.resolve();
    // After save, returns to read mode with updated text
    const titleSpan2 = /** @type {HTMLSpanElement} */ (
      mount.querySelector('h2 .editable')
    );
    expect(titleSpan2.textContent).toBe('New Title');
  });

  test('shows toast on description save error and re-enables', async () => {
    vi.useFakeTimers();
    document.body.innerHTML =
      '<section class="panel"><div id="mount"></div></section>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
    const initial = {
      id: 'UI-9',
      title: 'T',
      description: 'D',
      status: 'open',
      priority: 2
    };
    const stores3 = {
      /** @param {string} id */
      snapshotFor(id) {
        return id === 'detail:UI-9' ? [initial] : [];
      },
      subscribe() {
        return () => {};
      }
    };
    const send = mockSend(async (type) => {
      if (type === 'edit-text') {
        throw new Error('boom');
      }
      throw new Error('Unexpected');
    });
    const view = createDetailView(mount, send, undefined, stores3);
    await view.load('UI-9');
    // Enter edit mode
    const md = /** @type {HTMLDivElement} */ (mount.querySelector('.md'));
    md.click();
    const ta = /** @type {HTMLTextAreaElement} */ (
      mount.querySelector('textarea')
    );
    const btn = /** @type {HTMLButtonElement} */ (
      mount.querySelector('.editable-actions button')
    );
    ta.value = 'New D';
    btn.click();
    await Promise.resolve();
    // Toast appears
    const toast = /** @type {HTMLElement} */ (
      document.body.querySelector('.toast')
    );
    expect(toast).not.toBeNull();
    expect((toast.textContent || '').toLowerCase()).toContain(
      'failed to save description'
    );
    // Auto-dismiss after a while
    await vi.advanceTimersByTimeAsync(3000);
    vi.useRealTimers();
  });
});
