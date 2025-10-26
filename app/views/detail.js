// Issue Detail view implementation (lit-html based)
import { html, render } from 'lit-html';
import { parseView } from '../router.js';
import { issueDisplayId } from '../utils/issue-id.js';
import { issueHashFor } from '../utils/issue-url.js';
import { renderMarkdown } from '../utils/markdown.js';
import { emojiForPriority } from '../utils/priority-badge.js';
import { priority_levels } from '../utils/priority.js';
import { statusLabel } from '../utils/status.js';
import { showToast } from '../utils/toast.js';
import { createTypeBadge } from '../utils/type-badge.js';

/**
 * @typedef {Object} Dependency
 * @property {string} id
 * @property {string} [title]
 * @property {string} [status]
 * @property {number} [priority]
 * @property {string} [issue_type]
 */

/**
 * @typedef {Object} IssueDetail
 * @property {string} id
 * @property {string} [title]
 * @property {string} [description]
 * @property {string} [design]
 * @property {string} [acceptance]
 * @property {string} [notes]
 * @property {string} [status]
 * @property {string} [assignee]
 * @property {number} [priority]
 * @property {string[]} [labels]
 * @property {Dependency[]} [dependencies]
 * @property {Dependency[]} [dependents]
 */

/**
 * @param {string} hash
 */
function defaultNavigateFn(hash) {
  window.location.hash = hash;
}

/**
 * Create the Issue Detail view.
 * @param {HTMLElement} mount_element - Element to render into.
 * @param {(type: string, payload?: unknown) => Promise<unknown>} sendFn - RPC transport.
 * @param {(hash: string) => void} [navigateFn] - Navigation function; defaults to setting location.hash.
 * @returns {{ load: (id: string) => Promise<void>, clear: () => void, destroy: () => void }} View API.
 */
export function createDetailView(
  mount_element,
  sendFn,
  navigateFn = defaultNavigateFn
) {
  /** @type {IssueDetail | null} */
  let current = null;
  /** @type {boolean} */
  let pending = false;
  /** @type {boolean} */
  let edit_title = false;
  /** @type {boolean} */
  let edit_desc = false;
  /** @type {boolean} */
  let edit_design = false;
  /** @type {boolean} */
  let edit_notes = false;
  /** @type {boolean} */
  let edit_accept = false;
  /** @type {boolean} */
  let edit_assignee = false;
  /** @type {string} */
  let new_label_text = '';

  /** @param {string} id */
  function issueHref(id) {
    try {
      /** @type {'issues'|'epics'|'board'} */
      const view = parseView(window.location.hash || '');
      return issueHashFor(view, id);
    } catch {
      return issueHashFor('issues', id);
    }
  }

  /**
   * @param {string} message
   */
  function renderPlaceholder(message) {
    render(
      html`
        <div class="panel__body" id="detail-root">
          <p class="muted">${message}</p>
        </div>
      `,
      mount_element
    );
  }

  // Handlers
  const onTitleSpanClick = () => {
    edit_title = true;
    doRender();
  };
  /**
   * @param {KeyboardEvent} ev
   */
  const onTitleKeydown = (ev) => {
    if (ev.key === 'Enter') {
      edit_title = true;
      doRender();
    } else if (ev.key === 'Escape') {
      edit_title = false;
      doRender();
    }
  };
  const onTitleSave = async () => {
    if (!current || pending) {
      return;
    }
    const input = /** @type {HTMLInputElement|null} */ (
      mount_element.querySelector('h2 input')
    );
    const prev = current.title || '';
    const next = input ? input.value : '';
    if (next === prev) {
      edit_title = false;
      doRender();
      return;
    }
    pending = true;
    if (input) {
      input.disabled = true;
    }
    try {
      const updated = await sendFn('edit-text', {
        id: current.id,
        field: 'title',
        value: next
      });
      if (updated && typeof updated === 'object') {
        current = /** @type {IssueDetail} */ (updated);
        edit_title = false;
        doRender();
      }
    } catch {
      current.title = prev;
      edit_title = false;
      doRender();
      showToast('Failed to save title', 'error');
    } finally {
      pending = false;
    }
  };
  const onTitleCancel = () => {
    edit_title = false;
    doRender();
  };
  // Assignee inline edit handlers
  const onAssigneeSpanClick = () => {
    edit_assignee = true;
    doRender();
  };
  /**
   * @param {KeyboardEvent} ev
   */
  const onAssigneeKeydown = (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      edit_assignee = true;
      doRender();
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      edit_assignee = false;
      doRender();
    }
  };
  const onAssigneeSave = async () => {
    if (!current || pending) {
      return;
    }
    const input = /** @type {HTMLInputElement|null} */ (
      mount_element.querySelector('#detail-root .prop.assignee input')
    );
    const prev = current?.assignee ?? '';
    const next = input?.value ?? '';
    if (next === prev) {
      edit_assignee = false;
      doRender();
      return;
    }
    pending = true;
    if (input) {
      input.disabled = true;
    }
    try {
      const updated = await sendFn('update-assignee', {
        id: current.id,
        assignee: next
      });
      if (updated && typeof updated === 'object') {
        current = /** @type {IssueDetail} */ (updated);
        edit_assignee = false;
        doRender();
      }
    } catch {
      // revert visually
      current.assignee = prev;
      edit_assignee = false;
      doRender();
      showToast('Failed to update assignee', 'error');
    } finally {
      pending = false;
    }
  };
  const onAssigneeCancel = () => {
    edit_assignee = false;
    doRender();
  };

  // Labels handlers
  /**
   * @param {Event} ev
   */
  const onLabelInput = (ev) => {
    const el = /** @type {HTMLInputElement} */ (ev.currentTarget);
    new_label_text = el.value || '';
  };
  /**
   * @param {KeyboardEvent} e
   */
  function onLabelKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void onAddLabel();
    }
  }
  async function onAddLabel() {
    if (!current || pending) {
      return;
    }
    const text = new_label_text.trim();
    if (!text) {
      return;
    }
    pending = true;
    try {
      const updated = await sendFn('label-add', {
        id: current.id,
        label: text
      });
      if (updated && typeof updated === 'object') {
        current = /** @type {IssueDetail} */ (updated);
        new_label_text = '';
        doRender();
      }
    } catch {
      showToast('Failed to add label', 'error');
    } finally {
      pending = false;
    }
  }
  /**
   * @param {string} label
   */
  async function onRemoveLabel(label) {
    if (!current || pending) {
      return;
    }
    pending = true;
    try {
      const updated = await sendFn('label-remove', {
        id: current.id,
        label
      });
      if (updated && typeof updated === 'object') {
        current = /** @type {IssueDetail} */ (updated);
        doRender();
      }
    } catch {
      showToast('Failed to remove label', 'error');
    } finally {
      pending = false;
    }
  }
  /**
   * @param {Event} ev
   */
  const onStatusChange = async (ev) => {
    if (!current || pending) {
      doRender();
      return;
    }
    const sel = /** @type {HTMLSelectElement} */ (ev.currentTarget);
    const prev = current.status || 'open';
    const next = sel.value;
    if (next === prev) {
      return;
    }
    pending = true;
    current.status = next;
    doRender();
    try {
      const updated = await sendFn('update-status', {
        id: current.id,
        status: next
      });
      if (updated && typeof updated === 'object') {
        current = /** @type {IssueDetail} */ (updated);
        doRender();
      }
    } catch {
      current.status = prev;
      doRender();
      showToast('Failed to update status', 'error');
    } finally {
      pending = false;
    }
  };
  /**
   * @param {Event} ev
   */
  const onPriorityChange = async (ev) => {
    if (!current || pending) {
      doRender();
      return;
    }
    const sel = /** @type {HTMLSelectElement} */ (ev.currentTarget);
    const prev = typeof current.priority === 'number' ? current.priority : 2;
    const next = Number(sel.value);
    if (next === prev) {
      return;
    }
    pending = true;
    current.priority = next;
    doRender();
    try {
      const updated = await sendFn('update-priority', {
        id: current.id,
        priority: next
      });
      if (updated && typeof updated === 'object') {
        current = /** @type {IssueDetail} */ (updated);
        doRender();
      }
    } catch {
      current.priority = prev;
      doRender();
      showToast('Failed to update priority', 'error');
    } finally {
      pending = false;
    }
  };

  const onDescEdit = () => {
    edit_desc = true;
    doRender();
  };
  /**
   * @param {KeyboardEvent} ev
   */
  const onDescKeydown = (ev) => {
    if (ev.key === 'Escape') {
      edit_desc = false;
      doRender();
    } else if (ev.key === 'Enter' && ev.ctrlKey) {
      const btn = /** @type {HTMLButtonElement|null} */ (
        mount_element.querySelector('#detail-root .editable-actions button')
      );
      if (btn) {
        btn.click();
      }
    }
  };
  const onDescSave = async () => {
    if (!current || pending) {
      return;
    }
    const ta = /** @type {HTMLTextAreaElement|null} */ (
      mount_element.querySelector('#detail-root textarea')
    );
    const prev = current.description || '';
    const next = ta ? ta.value : '';
    if (next === prev) {
      edit_desc = false;
      doRender();
      return;
    }
    pending = true;
    if (ta) {
      ta.disabled = true;
    }
    try {
      const updated = await sendFn('edit-text', {
        id: current.id,
        field: 'description',
        value: next
      });
      if (updated && typeof updated === 'object') {
        current = /** @type {IssueDetail} */ (updated);
        edit_desc = false;
        doRender();
      }
    } catch {
      current.description = prev;
      edit_desc = false;
      doRender();
      showToast('Failed to save description', 'error');
    } finally {
      pending = false;
    }
  };
  const onDescCancel = () => {
    edit_desc = false;
    doRender();
  };

  // Design inline edit handlers (same UX as Description)
  const onDesignEdit = () => {
    edit_design = true;
    doRender();
    try {
      const ta = /** @type {HTMLTextAreaElement|null} */ (
        mount_element.querySelector('#detail-root .design textarea')
      );
      if (ta) {
        ta.focus();
      }
    } catch {
      // ignore focus errors
    }
  };
  /**
   * @param {KeyboardEvent} ev
   */
  const onDesignKeydown = (ev) => {
    if (ev.key === 'Escape') {
      edit_design = false;
      doRender();
    } else if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
      const btn = /** @type {HTMLButtonElement|null} */ (
        mount_element.querySelector(
          '#detail-root .design .editable-actions button'
        )
      );
      if (btn) {
        btn.click();
      }
    }
  };
  const onDesignSave = async () => {
    if (!current || pending) {
      return;
    }
    const ta = /** @type {HTMLTextAreaElement|null} */ (
      mount_element.querySelector('#detail-root .design textarea')
    );
    const prev = current.design || '';
    const next = ta ? ta.value : '';
    if (next === prev) {
      edit_design = false;
      doRender();
      return;
    }
    pending = true;
    if (ta) {
      ta.disabled = true;
    }
    try {
      const updated = await sendFn('edit-text', {
        id: current.id,
        field: 'design',
        value: next
      });
      if (updated && typeof updated === 'object') {
        current = /** @type {IssueDetail} */ (updated);
        edit_design = false;
        doRender();
      }
    } catch {
      current.design = prev;
      edit_design = false;
      doRender();
      showToast('Failed to save design', 'error');
    } finally {
      pending = false;
    }
  };
  const onDesignCancel = () => {
    edit_design = false;
    doRender();
  };

  // Notes inline edit handlers
  const onNotesEdit = () => {
    edit_notes = true;
    doRender();
  };
  /**
   * @param {KeyboardEvent} ev
   */
  const onNotesKeydown = (ev) => {
    if (ev.key === 'Escape') {
      edit_notes = false;
      doRender();
    } else if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
      const btn = /** @type {HTMLButtonElement|null} */ (
        mount_element.querySelector(
          '#detail-root .notes .editable-actions button'
        )
      );
      if (btn) {
        btn.click();
      }
    }
  };
  const onNotesSave = async () => {
    if (!current || pending) {
      return;
    }
    const ta = /** @type {HTMLTextAreaElement|null} */ (
      mount_element.querySelector('#detail-root .notes textarea')
    );
    const prev = current.notes || '';
    const next = ta ? ta.value : '';
    if (next === prev) {
      edit_notes = false;
      doRender();
      return;
    }
    pending = true;
    if (ta) {
      ta.disabled = true;
    }
    try {
      const updated = await sendFn('edit-text', {
        id: current.id,
        field: 'notes',
        value: next
      });
      if (updated && typeof updated === 'object') {
        current = /** @type {IssueDetail} */ (updated);
        edit_notes = false;
        doRender();
      }
    } catch {
      current.notes = prev;
      edit_notes = false;
      doRender();
      showToast('Failed to save notes', 'error');
    } finally {
      pending = false;
    }
  };
  const onNotesCancel = () => {
    edit_notes = false;
    doRender();
  };

  const onAcceptEdit = () => {
    edit_accept = true;
    doRender();
  };
  /**
   * @param {KeyboardEvent} ev
   */
  const onAcceptKeydown = (ev) => {
    if (ev.key === 'Escape') {
      edit_accept = false;
      doRender();
    } else if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
      const btn = /** @type {HTMLButtonElement|null} */ (
        mount_element.querySelector(
          '#detail-root .acceptance .editable-actions button'
        )
      );
      if (btn) {
        btn.click();
      }
    }
  };
  const onAcceptSave = async () => {
    if (!current || pending) {
      return;
    }
    const ta = /** @type {HTMLTextAreaElement|null} */ (
      mount_element.querySelector('#detail-root .acceptance textarea')
    );
    const prev = current.acceptance || '';
    const next = ta ? ta.value : '';
    if (next === prev) {
      edit_accept = false;
      doRender();
      return;
    }
    pending = true;
    if (ta) {
      ta.disabled = true;
    }
    try {
      const updated = await sendFn('edit-text', {
        id: current.id,
        field: 'acceptance',
        value: next
      });
      if (updated && typeof updated === 'object') {
        current = /** @type {IssueDetail} */ (updated);
        edit_accept = false;
        doRender();
      }
    } catch {
      current.acceptance = prev;
      edit_accept = false;
      doRender();
      showToast('Failed to save acceptance', 'error');
    } finally {
      pending = false;
    }
  };
  const onAcceptCancel = () => {
    edit_accept = false;
    doRender();
  };

  /**
   * @param {'Dependencies'|'Dependents'} title
   * @param {Dependency[]} items
   */
  function depsSection(title, items) {
    const test_id =
      title === 'Dependencies' ? 'add-dependency' : 'add-dependent';
    return html`
      <div class="props-card">
        <div>
          <div class="props-card__title">${title}</div>
        </div>
        <ul>
          ${!items || items.length === 0
            ? null
            : items.map((dep) => {
                const did = dep.id;
                const href = issueHref(did);
                return html`<li
                  data-href=${href}
                  @click=${() => navigateFn(href)}
                >
                  ${createTypeBadge(dep.issue_type || '')}
                  <span class="text-truncate">${dep.title || ''}</span>
                  <button
                    aria-label=${`Remove dependency ${issueDisplayId(did)}`}
                    @click=${makeDepRemoveClick(did, title)}
                  >
                    ×
                  </button>
                </li>`;
              })}
        </ul>
        <div class="props-card__footer">
          <input type="text" placeholder="Issue ID" data-testid=${test_id} />
          <button @click=${makeDepAddClick(items, title)}>Add</button>
        </div>
      </div>
    `;
  }

  /**
   * @param {IssueDetail} issue
   */
  function detailTemplate(issue) {
    const title_zone = edit_title
      ? html`<div class="detail-title">
          <h2>
            <input
              type="text"
              aria-label="Edit title"
              .value=${issue.title || ''}
              @keydown=${onTitleInputKeydown}
            />
            <button @click=${onTitleSave}>Save</button>
            <button @click=${onTitleCancel}>Cancel</button>
          </h2>
        </div>`
      : html`<div class="detail-title">
          <h2>
            <span
              class="editable"
              tabindex="0"
              role="button"
              aria-label="Edit title"
              @click=${onTitleSpanClick}
              @keydown=${onTitleKeydown}
              >${issue.title || ''}</span
            >
          </h2>
        </div>`;

    const status_select = html`<select
      class=${`badge-select badge--status is-${issue.status || 'open'}`}
      @change=${onStatusChange}
      .value=${issue.status || 'open'}
      ?disabled=${pending}
    >
      ${(() => {
        const cur = String(issue.status || 'open');
        return ['open', 'in_progress', 'closed'].map(
          (s) =>
            html`<option value=${s} ?selected=${cur === s}>
              ${statusLabel(s)}
            </option>`
        );
      })()}
    </select>`;

    const priority_select = html`<select
      class=${`badge-select badge--priority is-p${String(
        typeof issue.priority === 'number' ? issue.priority : 2
      )}`}
      @change=${onPriorityChange}
      .value=${String(typeof issue.priority === 'number' ? issue.priority : 2)}
      ?disabled=${pending}
    >
      ${(() => {
        const cur = String(
          typeof issue.priority === 'number' ? issue.priority : 2
        );
        return priority_levels.map(
          (p, i) =>
            html`<option value=${String(i)} ?selected=${cur === String(i)}>
              ${emojiForPriority(i)} ${p}
            </option>`
        );
      })()}
    </select>`;

    const desc_block = edit_desc
      ? html`<div class="description">
          <textarea
            @keydown=${onDescKeydown}
            .value=${issue.description || ''}
            rows="8"
            style="width:100%"
          ></textarea>
          <div class="editable-actions">
            <button @click=${onDescSave}>Save</button>
            <button @click=${onDescCancel}>Cancel</button>
          </div>
        </div>`
      : html`<div
          class="md editable"
          tabindex="0"
          role="button"
          aria-label="Edit description"
          @click=${onDescEdit}
          @keydown=${onDescEditableKeydown}
        >
          ${(() => {
            const text = issue.description || '';
            if (text.trim() === '') {
              return html`<div class="muted">Description</div>`;
            }
            return renderMarkdown(text);
          })()}
        </div>`;

    // Normalize acceptance text: prefer issue.acceptance, fallback to acceptance_criteria from bd
    const acceptance_text = (() => {
      /** @type {any} */
      const any_issue = issue;
      const raw = String(
        issue.acceptance || any_issue.acceptance_criteria || ''
      );
      return raw;
    })();

    const accept_block = edit_accept
      ? html`<div class="acceptance">
          ${acceptance_text.trim().length > 0
            ? html`<div class="props-card__title">Acceptance Criteria</div>`
            : ''}
          <textarea
            @keydown=${onAcceptKeydown}
            .value=${acceptance_text}
            rows="6"
            style="width:100%"
          ></textarea>
          <div class="editable-actions">
            <button @click=${onAcceptSave}>Save</button>
            <button @click=${onAcceptCancel}>Cancel</button>
          </div>
        </div>`
      : html`<div class="acceptance">
          ${(() => {
            const text = acceptance_text;
            const has = text.trim().length > 0;
            return html`${has
                ? html`<div class="props-card__title">Acceptance Criteria</div>`
                : ''}
              <div
                class="md editable"
                tabindex="0"
                role="button"
                aria-label="Edit acceptance criteria"
                @click=${onAcceptEdit}
                @keydown=${onAcceptEditableKeydown}
              >
                ${has
                  ? renderMarkdown(text)
                  : html`<div class="muted">Add acceptance criteria…</div>`}
              </div>`;
          })()}
        </div>`;

    // Notes: editable in-place similar to Description
    const notes_text = String(issue.notes || '');
    const notes_block = edit_notes
      ? html`<div class="notes">
          ${notes_text.trim().length > 0
            ? html`<div class="props-card__title">Notes</div>`
            : ''}
          <textarea
            @keydown=${onNotesKeydown}
            .value=${notes_text}
            rows="6"
            style="width:100%"
          ></textarea>
          <div class="editable-actions">
            <button @click=${onNotesSave}>Save</button>
            <button @click=${onNotesCancel}>Cancel</button>
          </div>
        </div>`
      : html`<div class="notes">
          ${(() => {
            const text = notes_text;
            const has = text.trim().length > 0;
            return html`${has
                ? html`<div class="props-card__title">Notes</div>`
                : ''}
              <div
                class="md editable"
                tabindex="0"
                role="button"
                aria-label="Edit notes"
                @click=${onNotesEdit}
                @keydown=${onNotesEditableKeydown}
              >
                ${has
                  ? renderMarkdown(text)
                  : html`<div class="muted">Add notes…</div>`}
              </div>`;
          })()}
        </div>`;

    // Labels section
    const labels = Array.isArray(issue.labels) ? issue.labels : [];
    const labels_block = html`<div class="prop labels">
      <div class="label">Labels</div>
      <div class="value">
        <div>
          ${labels.map(
            (l) =>
              html`<span class="badge" title=${l}
                >${l}
                <button
                  class="icon-button"
                  title="Remove label"
                  aria-label=${'Remove label ' + l}
                  @click=${() => onRemoveLabel(l)}
                  style="margin-left:6px"
                >
                  ×
                </button></span
              >`
          )}
          <input
            type="text"
            aria-label="Add label"
            placeholder="Add label"
            .value=${new_label_text}
            @input=${onLabelInput}
            @keydown=${onLabelKeydown}
            size=${Math.max(12, Math.min(28, new_label_text.length + 3))}
          />
        </div>
      </div>
    </div>`;

    // Design section block
    const design_text = String(issue.design || '');
    const design_block = edit_design
      ? html`<div class="design">
          ${design_text.trim().length > 0
            ? html`<div class="props-card__title">Design</div>`
            : ''}
          <textarea
            @keydown=${onDesignKeydown}
            .value=${design_text}
            rows="6"
            style="width:100%"
          ></textarea>
          <div class="editable-actions">
            <button @click=${onDesignSave}>Save</button>
            <button @click=${onDesignCancel}>Cancel</button>
          </div>
        </div>`
      : html`<div class="design">
          ${(() => {
            const text = design_text;
            const has = text.trim().length > 0;
            return html`${has
                ? html`<div class="props-card__title">Design</div>`
                : ''}
              <div
                class="md editable"
                tabindex="0"
                role="button"
                aria-label="Edit design"
                @click=${onDesignEdit}
                @keydown=${onDesignEditableKeydown}
              >
                ${has
                  ? renderMarkdown(text)
                  : html`<div class="muted">Add design…</div>`}
              </div>`;
          })()}
        </div>`;

    return html`
      <div class="panel__body" id="detail-root">
        <div style="position:relative">
          <div class="detail-layout">
            <div class="detail-main">
              ${title_zone} ${desc_block} ${design_block} ${notes_block}
              ${accept_block}
            </div>
            <div class="detail-side">
              <div class="props-card">
                <div class="props-card__title">Properties</div>
                <div class="prop">
                  <div class="label">Type</div>
                  <div class="value">
                    ${createTypeBadge(/** @type {any} */ (issue).issue_type)}
                  </div>
                </div>
                <div class="prop">
                  <div class="label">Status</div>
                  <div class="value">${status_select}</div>
                </div>
                <div class="prop">
                  <div class="label">Priority</div>
                  <div class="value">${priority_select}</div>
                </div>
                <div class="prop assignee">
                  <div class="label">Assignee</div>
                  <div class="value">
                    ${edit_assignee
                      ? html`<input
                            type="text"
                            aria-label="Edit assignee"
                            .value=${/** @type {any} */ (issue).assignee || ''}
                            size=${Math.min(
                              40,
                              Math.max(12, (issue.assignee || '').length + 3)
                            )}
                            @keydown=${
                              /** @param {KeyboardEvent} e */ (e) => {
                                if (e.key === 'Escape') {
                                  e.preventDefault();
                                  onAssigneeCancel();
                                } else if (e.key === 'Enter') {
                                  e.preventDefault();
                                  onAssigneeSave();
                                }
                              }
                            }
                          />
                          <button
                            class="btn"
                            style="margin-left:6px"
                            @click=${onAssigneeSave}
                          >
                            Save
                          </button>
                          <button
                            class="btn"
                            style="margin-left:6px"
                            @click=${onAssigneeCancel}
                          >
                            Cancel
                          </button>`
                      : html`${(() => {
                          const raw = issue.assignee || '';
                          const has = raw.trim().length > 0;
                          const text = has ? raw : 'Unassigned';
                          const cls = has ? 'editable' : 'editable muted';
                          return html`<span
                            class=${cls}
                            tabindex="0"
                            role="button"
                            aria-label="Edit assignee"
                            @click=${onAssigneeSpanClick}
                            @keydown=${onAssigneeKeydown}
                            >${text}</span
                          >`;
                        })()}`}
                  </div>
                </div>
                ${labels_block}
              </div>
              ${depsSection('Dependencies', issue.dependencies || [])}
              ${depsSection('Dependents', issue.dependents || [])}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function doRender() {
    if (!current) {
      renderPlaceholder('No issue selected');
      return;
    }
    render(detailTemplate(current), mount_element);
    // panel header removed for detail view; ID is shown inline with title
  }

  /**
   * Create a click handler for the remove button of a dependency row.
   * @param {string} did
   * @param {'Dependencies'|'Dependents'} title
   * @returns {(ev: Event) => Promise<void>}
   */
  function makeDepRemoveClick(did, title) {
    return async (ev) => {
      ev.stopPropagation();
      if (!current || pending) {
        return;
      }
      pending = true;
      try {
        if (title === 'Dependencies') {
          const updated = await sendFn('dep-remove', {
            a: current.id,
            b: did,
            view_id: current.id
          });
          if (updated && typeof updated === 'object') {
            current = /** @type {IssueDetail} */ (updated);
            doRender();
          }
        } else {
          const updated = await sendFn('dep-remove', {
            a: did,
            b: current.id,
            view_id: current.id
          });
          if (updated && typeof updated === 'object') {
            current = /** @type {IssueDetail} */ (updated);
            doRender();
          }
        }
      } catch {
        // ignore
      } finally {
        pending = false;
      }
    };
  }

  /**
   * Create a click handler for the Add button in a dependency section.
   * @param {Dependency[]} items
   * @param {'Dependencies'|'Dependents'} title
   * @returns {(ev: Event) => Promise<void>}
   */
  function makeDepAddClick(items, title) {
    return async (ev) => {
      if (!current || pending) {
        return;
      }
      const btn = /** @type {HTMLButtonElement} */ (ev.currentTarget);
      const input = /** @type {HTMLInputElement|null} */ (
        btn.previousElementSibling
      );
      const target = input ? input.value.trim() : '';
      if (!target || target === current.id) {
        showToast('Enter a different issue id');
        return;
      }
      const set = new Set((items || []).map((d) => d.id));
      if (set.has(target)) {
        showToast('Link already exists');
        return;
      }
      pending = true;
      if (btn) {
        btn.disabled = true;
      }
      if (input) {
        input.disabled = true;
      }
      try {
        if (title === 'Dependencies') {
          const updated = await sendFn('dep-add', {
            a: current.id,
            b: target,
            view_id: current.id
          });
          if (updated && typeof updated === 'object') {
            current = /** @type {IssueDetail} */ (updated);
            doRender();
          }
        } else {
          const updated = await sendFn('dep-add', {
            a: target,
            b: current.id,
            view_id: current.id
          });
          if (updated && typeof updated === 'object') {
            current = /** @type {IssueDetail} */ (updated);
            doRender();
          }
        }
      } catch {
        showToast('Failed to add dependency', 'error');
      } finally {
        pending = false;
      }
    };
  }
  /**
   * @param {KeyboardEvent} ev
   */
  function onTitleInputKeydown(ev) {
    if (ev.key === 'Escape') {
      edit_title = false;
      doRender();
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      onTitleSave();
    }
  }

  /**
   * @param {KeyboardEvent} ev
   */
  function onDescEditableKeydown(ev) {
    if (ev.key === 'Enter') {
      onDescEdit();
    }
  }

  /**
   * @param {KeyboardEvent} ev
   */
  function onAcceptEditableKeydown(ev) {
    if (ev.key === 'Enter') {
      onAcceptEdit();
    }
  }

  /**
   * @param {KeyboardEvent} ev
   */
  function onNotesEditableKeydown(ev) {
    if (ev.key === 'Enter') {
      onNotesEdit();
    }
  }

  /**
   * @param {KeyboardEvent} ev
   */
  function onDesignEditableKeydown(ev) {
    if (ev.key === 'Enter') {
      onDesignEdit();
    }
  }

  return {
    async load(id) {
      if (!id) {
        renderPlaceholder('No issue selected');
        return;
      }
      /** @type {unknown} */
      let result;
      try {
        result = await sendFn('show-issue', { id });
      } catch {
        result = null;
      }
      if (!result || typeof result !== 'object') {
        renderPlaceholder('Issue not found');
        return;
      }
      const issue = /** @type {IssueDetail} */ (result);
      // Some backends may normalize ID casing (e.g., UI-1 vs ui-1).
      // Treat IDs case-insensitively to avoid false negatives on deep links.
      if (
        !issue ||
        String(issue.id || '').toLowerCase() !== String(id || '').toLowerCase()
      ) {
        renderPlaceholder('Issue not found');
        return;
      }
      current = issue;
      pending = false;
      doRender();
    },
    clear() {
      renderPlaceholder('Select an issue to view details');
    },
    destroy() {
      mount_element.replaceChildren();
    }
  };
}
