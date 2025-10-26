import { describe, expect, test, vi } from 'vitest';
import { bootstrap } from './main.js';

// Polyfill <dialog> for jsdom
if (typeof HTMLDialogElement !== 'undefined') {
  const proto = /** @type {any} */ (HTMLDialogElement.prototype);
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function showModal() {
      this.setAttribute('open', '');
    };
    proto.close = function close() {
      this.removeAttribute('open');
    };
  }
}

// Capture calls and provide simple responses
const calls = /** @type {Array<{ type: string, payload: any }>} */ ([]);
const issues = [
  { id: 'UI-10', title: 'Existing', status: 'open', priority: 2 },
  { id: 'UI-200', title: 'Create me', status: 'open', priority: 1 }
];
vi.mock('./ws.js', () => ({
  createWsClient: () => ({
    /**
     * @param {string} type
     * @param {any} payload
     */
    async send(type, payload) {
      // Record only mutation-related calls; list reads are push-only now
      if (
        type === 'create-issue' ||
        type === 'label-add' ||
        type === 'show-issue'
      ) {
        calls.push({ type, payload });
      }
      if (type === 'list-issues') {
        // Provide data for legacy id-discovery path; do not record
        return issues;
      }
      if (type === 'show-issue') {
        const id = /** @type {any} */ (payload).id;
        const it = issues.find((x) => x.id === id);
        return it || null;
      }
      if (type === 'create-issue') {
        return { created: true };
      }
      if (type === 'label-add') {
        return issues[1];
      }
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

describe('UI-106 new issue flow', () => {
  test('button opens dialog', async () => {
    document.body.innerHTML =
      '<header class="app-header"><div class="header-actions"><button id="new-issue-btn">New issue</button></div></header><main id="app"></main>';
    const root = /** @type {HTMLElement} */ (document.getElementById('app'));
    bootstrap(root);
    await Promise.resolve();
    const btn = /** @type {HTMLButtonElement} */ (
      document.getElementById('new-issue-btn')
    );
    btn.click();
    await Promise.resolve();
    const dlg = /** @type {HTMLDialogElement} */ (
      document.getElementById('new-issue-dialog')
    );
    expect(dlg).not.toBeNull();
    expect(dlg.hasAttribute('open')).toBe(true);
  });

  test('Ctrl+N opens dialog', async () => {
    document.body.innerHTML =
      '<header class="app-header"><div class="header-actions"><button id="new-issue-btn">New issue</button></div></header><main id="app"></main>';
    const root = /** @type {HTMLElement} */ (document.getElementById('app'));
    bootstrap(root);
    await Promise.resolve();
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true })
    );
    await Promise.resolve();
    const dlg = /** @type {HTMLDialogElement} */ (
      document.getElementById('new-issue-dialog')
    );
    expect(dlg.hasAttribute('open')).toBe(true);
  });

  test('submit creates issue and navigates to details', async () => {
    calls.length = 0;
    document.body.innerHTML =
      '<header class="app-header"><div class="header-actions"><button id="new-issue-btn">New issue</button></div></header><main id="app"></main>';
    const root = /** @type {HTMLElement} */ (document.getElementById('app'));
    bootstrap(root);
    await Promise.resolve();

    // Open dialog
    const btn = /** @type {HTMLButtonElement} */ (
      document.getElementById('new-issue-btn')
    );
    btn.click();
    await Promise.resolve();

    // Fill form
    const title = /** @type {HTMLInputElement} */ (
      document.getElementById('new-title')
    );
    const labels = /** @type {HTMLInputElement} */ (
      document.getElementById('new-labels')
    );
    title.value = 'Create me';
    labels.value = 'alpha, beta';

    // Submit via Ctrl+Enter
    const dlg = /** @type {HTMLDialogElement} */ (
      document.getElementById('new-issue-dialog')
    );
    dlg.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: true,
        bubbles: true
      })
    );
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));

    // Expect create call and label-add
    const types = calls.map((c) => c.type);
    expect(types).toContain('create-issue');
    expect(types).toContain('label-add');

    // Details dialog opened for created id
    const details = /** @type {HTMLDialogElement} */ (
      document.getElementById('issue-dialog')
    );
    expect(details).not.toBeNull();
    expect(details.hasAttribute('open')).toBe(true);
    const titleEl = /** @type {HTMLElement} */ (
      document.getElementById('issue-dialog-title')
    );
    expect(titleEl.textContent).toBe('#200');
  });
});
