/**
 * Create and manage a fatal error dialog that surfaces stderr output from
 * backend failures (e.g., bd command errors).
 *
 * @param {HTMLElement} mount_element
 * @returns {{ open: (title: string, message: string, detail?: string) => void, close: () => void, getElement: () => HTMLDialogElement }}
 */
export function createFatalErrorDialog(mount_element) {
  const dialog = document.createElement('dialog');
  dialog.id = 'fatal-error-dialog';
  dialog.setAttribute('role', 'alertdialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.innerHTML = `
    <div class="fatal-error">
      <div class="fatal-error__icon" aria-hidden="true">!</div>
      <div class="fatal-error__body">
        <p class="fatal-error__eyebrow">Critical</p>
        <h2 class="fatal-error__title" id="fatal-error-title">Command failed</h2>
        <p class="fatal-error__message" id="fatal-error-message"></p>
        <pre class="fatal-error__detail" id="fatal-error-detail"></pre>
        <div class="fatal-error__actions">
          <button type="button" class="btn primary" id="fatal-error-reload">Reload</button>
          <button type="button" class="btn" id="fatal-error-close">Dismiss</button>
        </div>
      </div>
    </div>`;
  mount_element.appendChild(dialog);

  const title_el = dialog.querySelector('#fatal-error-title');
  const message_el = dialog.querySelector('#fatal-error-message');
  const detail_el = dialog.querySelector('#fatal-error-detail');
  const reload_btn = dialog.querySelector('#fatal-error-reload');
  const close_btn = dialog.querySelector('#fatal-error-close');

  const close = () => {
    if (typeof dialog.close === 'function') {
      try {
        dialog.close();
      } catch {
        // ignore close errors
      }
    }
    dialog.removeAttribute('open');
  };

  /**
   * @param {string} title
   * @param {string} message
   * @param {string} [detail]
   */
  const open = (title, message, detail = '') => {
    if (title_el) {
      title_el.textContent = title || 'Unexpected Error';
    }
    if (message_el) {
      message_el.textContent = message || 'An unrecoverable error occurred.';
    }

    const detail_text = typeof detail === 'string' ? detail.trim() : '';
    if (detail_el) {
      if (detail_text.length > 0) {
        detail_el.textContent = detail_text;
        detail_el.removeAttribute('hidden');
      } else {
        detail_el.textContent = 'No additional diagnostics available.';
        detail_el.setAttribute('hidden', '');
      }
    }

    if (typeof dialog.showModal === 'function') {
      try {
        dialog.showModal();
        dialog.setAttribute('open', '');
      } catch {
        dialog.setAttribute('open', '');
      }
    } else {
      dialog.setAttribute('open', '');
    }
  };

  if (reload_btn) {
    reload_btn.addEventListener('click', () => {
      window.location.reload();
    });
  }

  if (close_btn) {
    close_btn.addEventListener('click', () => close());
  }

  dialog.addEventListener('cancel', (ev) => {
    ev.preventDefault();
    close();
  });

  return {
    open,
    close,
    getElement() {
      return dialog;
    }
  };
}
