import { ISSUE_TYPES, typeLabel } from '../utils/issue-type.js';
import { priority_levels } from '../utils/priority.js';

/**
 * Create and manage the New Issue dialog (native <dialog>).
 * @param {HTMLElement} mount_element - Container to attach dialog (e.g., main#app)
 * @param {(type: import('../protocol.js').MessageType, payload?: unknown) => Promise<unknown>} sendFn - Transport function
 * @param {{ gotoIssue: (id: string) => void }} router - Router for opening details after create
 * @param {{ setState: (patch: any) => void, getState: () => any }} [store]
 * @returns {{ open: () => void, close: () => void }}
 */
export function createNewIssueDialog(mount_element, sendFn, router, store) {
  const dialog = /** @type {HTMLDialogElement} */ (
    document.createElement('dialog')
  );
  dialog.id = 'new-issue-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');

  dialog.innerHTML = `
    <div class="new-issue__container" part="container">
      <header class="new-issue__header">
        <div class="new-issue__title">New Issue</div>
        <button type="button" class="new-issue__close" aria-label="Close">×</button>
      </header>
      <div class="new-issue__body">
        <form id="new-issue-form" class="new-issue__form">
          <label for="new-title">Title</label>
          <input id="new-title" name="title" type="text" required placeholder="Short summary" />

          <label for="new-type">Type</label>
          <select id="new-type" name="type" aria-label="Issue type"></select>

          <label for="new-priority">Priority</label>
          <select id="new-priority" name="priority" aria-label="Priority"></select>

          <label for="new-labels">Labels</label>
          <input id="new-labels" name="labels" type="text" placeholder="comma,separated" />

          <label for="new-description">Description</label>
          <textarea id="new-description" name="description" rows="6" placeholder="Optional markdown description"></textarea>

          <div aria-live="polite" role="status" class="new-issue__error" id="new-issue-error"></div>

          <div class="new-issue__actions" style="grid-column: 1 / -1">
            <button type="button" id="btn-cancel">Cancel (Esc)</button>
            <button type="submit" id="btn-create">Create</button>
          </div>
        </form>
      </div>
    </div>
  `;

  mount_element.appendChild(dialog);

  const form = /** @type {HTMLFormElement} */ (
    dialog.querySelector('#new-issue-form')
  );
  const input_title = /** @type {HTMLInputElement} */ (
    dialog.querySelector('#new-title')
  );
  const sel_type = /** @type {HTMLSelectElement} */ (
    dialog.querySelector('#new-type')
  );
  const sel_priority = /** @type {HTMLSelectElement} */ (
    dialog.querySelector('#new-priority')
  );
  const input_labels = /** @type {HTMLInputElement} */ (
    dialog.querySelector('#new-labels')
  );
  const input_description = /** @type {HTMLTextAreaElement} */ (
    dialog.querySelector('#new-description')
  );
  const error_box = /** @type {HTMLDivElement} */ (
    dialog.querySelector('#new-issue-error')
  );
  const btn_cancel = /** @type {HTMLButtonElement} */ (
    dialog.querySelector('#btn-cancel')
  );
  const btn_create = /** @type {HTMLButtonElement} */ (
    dialog.querySelector('#btn-create')
  );
  const btn_close = /** @type {HTMLButtonElement} */ (
    dialog.querySelector('.new-issue__close')
  );

  // Populate selects
  function populateSelects() {
    sel_type.replaceChildren();
    // Empty option to allow leaving type unspecified
    const optEmpty = document.createElement('option');
    optEmpty.value = '';
    optEmpty.textContent = '— Select —';
    sel_type.appendChild(optEmpty);
    for (const t of ISSUE_TYPES) {
      const o = document.createElement('option');
      o.value = t;
      o.textContent = typeLabel(t);
      sel_type.appendChild(o);
    }

    sel_priority.replaceChildren();
    for (let i = 0; i <= 4; i += 1) {
      const o = document.createElement('option');
      o.value = String(i);
      const label = priority_levels[i] || 'Medium';
      o.textContent = `${i} – ${label}`;
      sel_priority.appendChild(o);
    }
  }
  populateSelects();

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
  }

  /**
   * @param {boolean} is_busy
   */
  function setBusy(is_busy) {
    input_title.disabled = is_busy;
    sel_type.disabled = is_busy;
    sel_priority.disabled = is_busy;
    input_labels.disabled = is_busy;
    input_description.disabled = is_busy;
    btn_cancel.disabled = is_busy;
    btn_create.disabled = is_busy;
    btn_create.textContent = is_busy ? 'Creating…' : 'Create';
  }

  function clearError() {
    error_box.textContent = '';
  }

  /**
   * @param {string} msg
   */
  function setError(msg) {
    error_box.textContent = msg;
  }

  function loadDefaults() {
    try {
      const t = window.localStorage.getItem('beads-ui.new.type');
      if (t) {
        sel_type.value = t;
      } else {
        sel_type.value = '';
      }
      const p = window.localStorage.getItem('beads-ui.new.priority');
      if (p && /^\d$/.test(p)) {
        sel_priority.value = p;
      } else {
        sel_priority.value = '2';
      }
    } catch {
      sel_type.value = '';
      sel_priority.value = '2';
    }
  }

  function saveDefaults() {
    try {
      const t = sel_type.value || '';
      const p = sel_priority.value || '';
      if (t.length > 0) {
        window.localStorage.setItem('beads-ui.new.type', t);
      }
      if (p.length > 0) {
        window.localStorage.setItem('beads-ui.new.priority', p);
      }
    } catch {
      // ignore persistence errors
    }
  }

  /**
   * Extract numeric suffix from an id like "UI-123"; return -1 when absent.
   * @param {string} id
   */
  function idNumeric(id) {
    const m = /-(\d+)$/.exec(String(id || ''));
    return m && m[1] ? Number(m[1]) : -1;
  }

  /**
   * Submit handler: validate, create, then open the created issue details.
   * @returns {Promise<void>}
   */
  async function createNow() {
    clearError();
    const title = String(input_title.value || '').trim();
    if (title.length === 0) {
      setError('Title is required');
      input_title.focus();
      return;
    }
    const prio = Number(sel_priority.value || '2');
    if (!(prio >= 0 && prio <= 4)) {
      setError('Priority must be 0..4');
      sel_priority.focus();
      return;
    }
    const type = String(sel_type.value || '');
    const desc = String(input_description.value || '');
    const labels = String(input_labels.value || '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    /** @type {{ title: string, type?: string, priority?: number, description?: string }} */
    const payload = { title };
    if (type.length > 0) {
      payload.type = type;
    }
    if (String(prio).length > 0) {
      payload.priority = prio;
    }
    if (desc.length > 0) {
      payload.description = desc;
    }

    setBusy(true);
    try {
      await sendFn('create-issue', payload);
    } catch {
      setBusy(false);
      setError('Failed to create issue');
      return;
    }

    saveDefaults();

    // Best-effort: find the created id by matching title among open issues and picking the highest numeric id
    /** @type {any} */
    let list = null;
    try {
      list = await sendFn('list-issues', {
        filters: { status: 'open', limit: 50 }
      });
    } catch {
      list = null;
    }
    let created_id = '';
    if (Array.isArray(list)) {
      const matches = list.filter((it) => String(it.title || '') === title);
      if (matches.length > 0) {
        /** @type {any} */
        let best = matches[0];
        for (const it of matches) {
          const ai = idNumeric(best.id || '');
          const bi = idNumeric(it.id || '');
          if (bi > ai) {
            best = it;
          }
        }
        created_id = String(best.id || '');
      }
    }

    // Apply labels if any
    if (created_id && labels.length > 0) {
      for (const label of labels) {
        try {
          await sendFn('label-add', { id: created_id, label });
        } catch {
          // ignore label failures
        }
      }
    }

    // Navigate to created issue if found
    if (created_id) {
      try {
        router.gotoIssue(created_id);
      } catch {
        // ignore routing errors
      }
      // Also set state directly to ensure dialog opens even if hash routing is suppressed in tests
      try {
        if (store) {
          store.setState({ selected_id: created_id });
        }
      } catch {
        // ignore
      }
    }

    setBusy(false);
    requestClose();
  }

  // Events
  dialog.addEventListener('cancel', (ev) => {
    ev.preventDefault();
    requestClose();
  });
  btn_close.addEventListener('click', () => requestClose());
  btn_cancel.addEventListener('click', () => requestClose());
  dialog.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault();
      void createNow();
    }
  });
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    void createNow();
  });

  return {
    open() {
      form.reset();
      clearError();
      loadDefaults();
      try {
        if ('showModal' in dialog && typeof dialog.showModal === 'function') {
          dialog.showModal();
        } else {
          dialog.setAttribute('open', '');
        }
      } catch {
        dialog.setAttribute('open', '');
      }
      setTimeout(() => {
        try {
          input_title.focus();
        } catch {
          // ignore
        }
      }, 0);
    },
    close() {
      requestClose();
    }
  };
}
