import { describe, expect, test, vi } from 'vitest';
import { bootstrap } from './main.js';

// Provide a minimal dialog polyfill for jsdom environments
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

vi.mock('./ws.js', () => ({
  createWsClient: () => ({
    async send() {
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

describe('UI-104 dialog opens on navigation', () => {
  test('hash navigation opens modal dialog and keeps list visible', async () => {
    // Start on issues
    window.location.hash = '#/issues';
    document.body.innerHTML = '<main id="app"></main>';
    const root = /** @type {HTMLElement} */ (document.getElementById('app'));

    bootstrap(root);

    await Promise.resolve();
    await Promise.resolve();

    // Navigate to an issue
    window.location.hash = '#/issue/UI-1';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await Promise.resolve();
    await Promise.resolve();

    const dlg = /** @type {HTMLDialogElement} */ (
      document.getElementById('issue-dialog')
    );
    expect(dlg).not.toBeNull();
    const title = /** @type {HTMLElement} */ (
      document.getElementById('issue-dialog-title')
    );
    expect(title.textContent).toBe('#1');

    // Underlying list remains visible
    const issuesRoot = /** @type {HTMLElement} */ (
      document.getElementById('issues-root')
    );
    expect(issuesRoot.hidden).toBe(false);

    // Close via button
    const btn = /** @type {HTMLButtonElement} */ (
      dlg.querySelector('.issue-dialog__close')
    );
    btn.click();
    await Promise.resolve();

    expect(dlg.hasAttribute('open')).toBe(false);
    expect(window.location.hash).toBe('#/issues');
  });
});
