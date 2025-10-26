// Lightweight wrapper around the native <dialog> for issue details
import { createIssueIdRenderer } from '../utils/issue-id-renderer.js';

// Provides: open(id), close(), getMount()
// Ensures accessibility, backdrop click to close, and Esc handling.

/**
 * @typedef {{ getState: () => { selected_id: string|null } }} Store
 */

/**
 * Create and manage the Issue Details dialog.
 * @param {HTMLElement} mount_element - Container to attach the <dialog> to (e.g., #detail-panel)
 * @param {Store} store - Read-only access to app state
 * @param {() => void} onClose - Called when dialog requests close (backdrop/esc/button)
 * @returns {{ open: (id: string) => void, close: () => void, getMount: () => HTMLElement }}
 */
export function createIssueDialog(mount_element, store, onClose) {
  const dialog = document.createElement('dialog');
  dialog.id = 'issue-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');

  // Shell: header (id + close) + body mount
  dialog.innerHTML = `
    <div class="issue-dialog__container" part="container">
      <header class="issue-dialog__header">
        <div class="issue-dialog__title">
          <span class="mono" id="issue-dialog-title"></span>
        </div>
        <button type="button" class="issue-dialog__close" aria-label="Close">×</button>
      </header>
      <div class="issue-dialog__body" id="issue-dialog-body"></div>
    </div>
  `;

  mount_element.appendChild(dialog);

  const body_mount = /** @type {HTMLElement} */ (
    dialog.querySelector('#issue-dialog-body')
  );
  const title_el = /** @type {HTMLElement} */ (
    dialog.querySelector('#issue-dialog-title')
  );
  const btn_close = /** @type {HTMLButtonElement} */ (
    dialog.querySelector('.issue-dialog__close')
  );

  /**
   * @param {string} id
   */
  function setTitle(id) {
    // Use copyable ID renderer but keep visible text as raw id for tests/clarity
    title_el.replaceChildren();
    title_el.appendChild(createIssueIdRenderer(id));
  }

  // Backdrop click: when clicking the dialog itself (outside container), close
  dialog.addEventListener('mousedown', (ev) => {
    if (ev.target === dialog) {
      ev.preventDefault();
      requestClose();
    }
  });
  // Esc key produces a cancel event on <dialog>
  dialog.addEventListener('cancel', (ev) => {
    ev.preventDefault();
    requestClose();
  });
  // Close button
  btn_close.addEventListener('click', () => requestClose());

  /** @type {HTMLElement | null} */
  let last_focus = null;

  function requestClose() {
    try {
      if (typeof dialog.close === 'function') {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
    } catch {
      dialog.removeAttribute('open');
    }
    try {
      onClose();
    } catch {
      // ignore consumer errors
    }
    // Restore focus to the element that had focus before opening
    restoreFocus();
  }

  /**
   * @param {string} id
   */
  function open(id) {
    // Capture currently focused element to restore after closing
    try {
      const ae = document.activeElement;
      if (ae && ae instanceof HTMLElement) {
        last_focus = ae;
      } else {
        last_focus = null;
      }
    } catch {
      last_focus = null;
    }
    setTitle(id);
    try {
      if ('showModal' in dialog && typeof dialog.showModal === 'function') {
        dialog.showModal();
      } else {
        dialog.setAttribute('open', '');
      }
      // Focus the dialog container for keyboard users
      setTimeout(() => {
        try {
          btn_close.focus();
        } catch {
          // ignore
        }
      }, 0);
    } catch {
      // Fallback for environments without <dialog>
      dialog.setAttribute('open', '');
    }
  }

  function close() {
    try {
      if (typeof dialog.close === 'function') {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
    } catch {
      dialog.removeAttribute('open');
    }
    restoreFocus();
  }

  function restoreFocus() {
    try {
      if (last_focus && document.contains(last_focus)) {
        last_focus.focus();
      }
    } catch {
      // ignore focus errors
    } finally {
      last_focus = null;
    }
  }

  return {
    open,
    close,
    getMount() {
      return body_mount;
    }
  };
}
