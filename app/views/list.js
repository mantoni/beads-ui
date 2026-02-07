import { html, render } from 'lit-html';
import { createListSelectors } from '../data/list-selectors.js';
import { cmpClosedDesc } from '../data/sort.js';
import { ISSUE_TYPES, typeLabel } from '../utils/issue-type.js';
import { issueHashFor } from '../utils/issue-url.js';
import { debug } from '../utils/logging.js';
import { statusLabel } from '../utils/status.js';
import { showToast } from '../utils/toast.js';
import { createIssueRowRenderer } from './issue-row.js';

// List view implementation; requires a transport send function.

/**
 * @typedef {{ id: string, title?: string, status?: 'closed'|'open'|'in_progress', priority?: number, issue_type?: string, assignee?: string, labels?: string[] }} Issue
 */

/**
 * Create the Issues List view.
 *
 * @param {HTMLElement} mount_element - Element to render into.
 * @param {(type: string, payload?: unknown) => Promise<unknown>} sendFn - RPC transport.
 * @param {(hash: string) => void} [navigate_fn] - Navigation function (defaults to setting location.hash).
 * @param {{ getState: () => any, setState: (patch: any) => void, subscribe: (fn: (s:any)=>void)=>()=>void }} [store] - Optional state store.
 * @param {{ selectors: { getIds: (client_id: string) => string[] } }} [_subscriptions]
 * @param {{ snapshotFor?: (client_id: string) => any[], subscribe?: (fn: () => void) => () => void }} [issueStores]
 * @returns {{ load: () => Promise<void>, destroy: () => void }} View API.
 */
/**
 * Create the Issues List view.
 *
 * @param {HTMLElement} mount_element
 * @param {(type: string, payload?: unknown) => Promise<unknown>} sendFn
 * @param {(hash: string) => void} [navigateFn]
 * @param {{ getState: () => any, setState: (patch: any) => void, subscribe: (fn: (s:any)=>void)=>()=>void }} [store]
 * @param {{ selectors: { getIds: (client_id: string) => string[] } }} [_subscriptions]
 * @param {{ snapshotFor?: (client_id: string) => any[], subscribe?: (fn: () => void) => () => void }} [issue_stores]
 * @returns {{ load: () => Promise<void>, destroy: () => void }}
 */
export function createListView(
  mount_element,
  sendFn,
  navigateFn,
  store,
  _subscriptions = undefined,
  issue_stores = undefined
) {
  const log = debug('views:list');
  // Touch unused param to satisfy lint rules without impacting behavior
  /** @type {any} */ (void _subscriptions);
  /** @type {string[]} */
  let status_filters = [];
  /** @type {string} */
  let search_text = '';
  /** @type {Issue[]} */
  let issues_cache = [];
  /** @type {string[]} */
  let type_filters = [];
  /** @type {string | null} */
  let selected_id = store ? store.getState().selected_id : null;
  /** @type {null | (() => void)} */
  let unsubscribe = null;
  let status_dropdown_open = false;
  let type_dropdown_open = false;
  /** @type {Set<string>} */
  const selected_issue_ids = new Set();
  let bulk_action_busy = false;

  /**
   * Normalize legacy string filter to array format.
   *
   * @param {string | string[] | undefined} val
   * @returns {string[]}
   */
  function normalizeStatusFilter(val) {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string' && val !== '' && val !== 'all') return [val];
    return [];
  }

  /**
   * Normalize legacy string filter to array format.
   *
   * @param {string | string[] | undefined} val
   * @returns {string[]}
   */
  function normalizeTypeFilter(val) {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string' && val !== '') return [val];
    return [];
  }

  // Shared row renderer (used in template below)
  const row_renderer = createIssueRowRenderer({
    navigate: (id) => {
      const nav = navigateFn || ((h) => (window.location.hash = h));
      /** @type {'issues'|'epics'|'board'} */
      const view = store ? store.getState().view : 'issues';
      nav(issueHashFor(view, id));
    },
    onUpdate: updateInline,
    requestRender: doRender,
    getSelectedId: () => selected_id,
    row_class: 'issue-row',
    showSelection: true,
    isSelected: (id) => selected_issue_ids.has(id),
    onToggleSelected: toggleIssueSelection,
    isSelectionDisabled: () => bulk_action_busy
  });

  /**
   * Toggle a status filter chip.
   *
   * @param {string} status
   */
  const toggleStatusFilter = async (status) => {
    if (status_filters.includes(status)) {
      status_filters = status_filters.filter((s) => s !== status);
    } else {
      status_filters = [...status_filters, status];
    }
    log('status toggle %s -> %o', status, status_filters);
    if (store) {
      store.setState({ filters: { status: status_filters } });
    }
    await load();
  };

  /**
   * Event: search input.
   */
  /**
   * @param {Event} ev
   */
  const onSearchInput = (ev) => {
    const input = /** @type {HTMLInputElement} */ (ev.currentTarget);
    search_text = input.value;
    log('search input %s', search_text);
    if (store) {
      store.setState({ filters: { search: search_text } });
    }
    doRender();
  };

  /**
   * Toggle a type filter chip.
   *
   * @param {string} type
   */
  const toggleTypeFilter = (type) => {
    if (type_filters.includes(type)) {
      type_filters = type_filters.filter((t) => t !== type);
    } else {
      type_filters = [...type_filters, type];
    }
    log('type toggle %s -> %o', type, type_filters);
    if (store) {
      store.setState({ filters: { type: type_filters } });
    }
    doRender();
  };

  /**
   * Toggle status dropdown open/closed.
   *
   * @param {Event} e
   */
  const toggleStatusDropdown = (e) => {
    e.stopPropagation();
    status_dropdown_open = !status_dropdown_open;
    type_dropdown_open = false;
    doRender();
  };

  /**
   * Toggle type dropdown open/closed.
   *
   * @param {Event} e
   */
  const toggleTypeDropdown = (e) => {
    e.stopPropagation();
    type_dropdown_open = !type_dropdown_open;
    status_dropdown_open = false;
    doRender();
  };

  /**
   * Get display text for dropdown trigger.
   *
   * @param {string[]} selected
   * @param {string} label
   * @param {(val: string) => string} formatter
   * @returns {string}
   */
  function getDropdownDisplayText(selected, label, formatter) {
    if (selected.length === 0) return `${label}: Any`;
    if (selected.length === 1) return `${label}: ${formatter(selected[0])}`;
    return `${label} (${selected.length})`;
  }

  // Initialize filters from store on first render so reload applies persisted state
  if (store) {
    const s = store.getState();
    if (s && s.filters && typeof s.filters === 'object') {
      status_filters = normalizeStatusFilter(s.filters.status);
      search_text = s.filters.search || '';
      type_filters = normalizeTypeFilter(s.filters.type);
    }
  }
  // Initial values are reflected via bound `.value` in the template
  // Compose helpers: centralize membership + entity selection + sorting
  const selectors = issue_stores ? createListSelectors(issue_stores) : null;

  /**
   * @returns {Issue[]}
   */
  function computeFilteredIssues() {
    let filtered = issues_cache;
    if (status_filters.length > 0 && !status_filters.includes('ready')) {
      filtered = filtered.filter((it) =>
        status_filters.includes(String(it.status || ''))
      );
    }
    if (search_text) {
      const needle = search_text.toLowerCase();
      filtered = filtered.filter((it) => {
        const a = String(it.id).toLowerCase();
        const b = String(it.title || '').toLowerCase();
        return a.includes(needle) || b.includes(needle);
      });
    }
    if (type_filters.length > 0) {
      filtered = filtered.filter((it) =>
        type_filters.includes(String(it.issue_type || ''))
      );
    }
    if (status_filters.length === 1 && status_filters[0] === 'closed') {
      filtered = filtered.slice().sort(cmpClosedDesc);
    }
    return filtered;
  }

  /**
   * @param {Issue[]} filtered_issues
   */
  function pruneSelection(filtered_issues) {
    const allowed_ids = new Set(filtered_issues.map((it) => it.id));
    for (const issue_id of Array.from(selected_issue_ids)) {
      if (!allowed_ids.has(issue_id)) {
        selected_issue_ids.delete(issue_id);
      }
    }
  }

  /**
   * @param {string} issue_id
   * @param {boolean} is_selected
   */
  function toggleIssueSelection(issue_id, is_selected) {
    if (is_selected) {
      selected_issue_ids.add(issue_id);
    } else {
      selected_issue_ids.delete(issue_id);
    }
    doRender();
  }

  /**
   * @param {Issue[]} filtered_issues
   * @param {boolean} checked
   */
  function toggleAllVisibleIssues(filtered_issues, checked) {
    if (checked) {
      for (const issue of filtered_issues) {
        selected_issue_ids.add(issue.id);
      }
    } else {
      for (const issue of filtered_issues) {
        selected_issue_ids.delete(issue.id);
      }
    }
    doRender();
  }

  /**
   * @returns {Issue[]}
   */
  function getSelectedIssues() {
    const selected_issues = [];
    for (const issue of issues_cache) {
      if (selected_issue_ids.has(issue.id)) {
        selected_issues.push(issue);
      }
    }
    return selected_issues;
  }

  /**
   * @param {number} count
   * @param {string} word
   * @returns {string}
   */
  function pluralize(count, word) {
    if (count === 1) {
      return `1 ${word}`;
    }
    return `${count} ${word}s`;
  }

  /**
   * @param {string} raw
   * @returns {string[]}
   */
  function parseLabels(raw) {
    /** @type {string[]} */
    const labels = [];
    /** @type {Set<string>} */
    const seen = new Set();
    for (const part of String(raw).split(',')) {
      const next = part.trim();
      if (next.length === 0 || seen.has(next)) {
        continue;
      }
      seen.add(next);
      labels.push(next);
    }
    return labels;
  }

  /**
   * @param {Issue[]} selected_issues
   * @returns {string}
   */
  function labelsPromptDefault(selected_issues) {
    if (selected_issues.length === 0) {
      return '';
    }
    const first_labels = Array.isArray(selected_issues[0].labels)
      ? selected_issues[0].labels
      : [];
    for (const issue of selected_issues) {
      const labels = Array.isArray(issue.labels) ? issue.labels : [];
      if (labels.join(',') !== first_labels.join(',')) {
        return '';
      }
    }
    return first_labels.join(', ');
  }

  /**
   * @param {Issue[]} selected_issues
   * @returns {number}
   */
  function priorityPromptDefault(selected_issues) {
    if (selected_issues.length === 0) {
      return 2;
    }
    const first_priority = Number(selected_issues[0].priority ?? 2);
    for (const issue of selected_issues) {
      const current_priority = Number(issue.priority ?? 2);
      if (current_priority !== first_priority) {
        return 2;
      }
    }
    return first_priority;
  }

  /**
   * @param {number} next_priority
   * @returns {Promise<number>}
   */
  async function applyBulkPriority(next_priority) {
    let failed_count = 0;
    for (const issue_id of Array.from(selected_issue_ids)) {
      try {
        await sendFn('update-priority', { id: issue_id, priority: next_priority });
      } catch {
        failed_count++;
      }
    }
    return failed_count;
  }

  /**
   * @param {'open'|'closed'} next_status
   * @returns {Promise<number>}
   */
  async function applyBulkStatus(next_status) {
    let failed_count = 0;
    for (const issue_id of Array.from(selected_issue_ids)) {
      try {
        await sendFn('update-status', { id: issue_id, status: next_status });
      } catch {
        failed_count++;
      }
    }
    return failed_count;
  }

  /**
   * @param {string[]} next_labels
   * @returns {Promise<number>}
   */
  async function applyBulkLabels(next_labels) {
    let failed_count = 0;
    const issue_by_id = new Map(issues_cache.map((it) => [it.id, it]));
    for (const issue_id of Array.from(selected_issue_ids)) {
      const issue = issue_by_id.get(issue_id);
      const current_labels = Array.isArray(issue && issue.labels)
        ? issue.labels
        : [];
      const current_set = new Set(current_labels);
      const next_set = new Set(next_labels);
      try {
        for (const label of current_labels) {
          if (!next_set.has(label)) {
            await sendFn('label-remove', { id: issue_id, label });
          }
        }
        for (const label of next_labels) {
          if (!current_set.has(label)) {
            await sendFn('label-add', { id: issue_id, label });
          }
        }
      } catch {
        failed_count++;
      }
    }
    return failed_count;
  }

  /**
   * @param {string} action_name
   * @param {() => Promise<number>} run_action
   */
  async function runBulkAction(action_name, run_action) {
    if (bulk_action_busy || selected_issue_ids.size === 0) {
      return;
    }
    const total_count = selected_issue_ids.size;
    bulk_action_busy = true;
    doRender();
    let failed_count = total_count;
    try {
      failed_count = await run_action();
    } catch {
      failed_count = total_count;
    } finally {
      bulk_action_busy = false;
    }
    if (failed_count === 0) {
      showToast(
        `${action_name}: ${pluralize(total_count, 'issue')} updated`,
        'success'
      );
      selected_issue_ids.clear();
    } else {
      const success_count = total_count - failed_count;
      if (success_count > 0) {
        showToast(
          `${action_name}: ${success_count}/${total_count} updated`,
          'info'
        );
      } else {
        showToast(`${action_name} failed`, 'error');
      }
    }
    await load();
  }

  /**
   * @returns {Promise<void>}
   */
  async function onBulkEditLabels() {
    if (bulk_action_busy || selected_issue_ids.size === 0) {
      return;
    }
    const selected_issues = getSelectedIssues();
    const initial = labelsPromptDefault(selected_issues);
    const input = window.prompt(
      'Set labels for selected issues (comma-separated). Leave empty to clear labels.',
      initial
    );
    if (input === null) {
      return;
    }
    const next_labels = parseLabels(input);
    await runBulkAction('Labels', () => applyBulkLabels(next_labels));
  }

  /**
   * @returns {Promise<void>}
   */
  async function onBulkChangePriority() {
    if (bulk_action_busy || selected_issue_ids.size === 0) {
      return;
    }
    const selected_issues = getSelectedIssues();
    const initial = priorityPromptDefault(selected_issues);
    const input = window.prompt(
      'Set priority for selected issues (0-4).',
      String(initial)
    );
    if (input === null) {
      return;
    }
    const parsed = Number(String(input).trim());
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 4) {
      showToast('Priority must be an integer from 0 to 4', 'error');
      return;
    }
    await runBulkAction('Priority', () => applyBulkPriority(parsed));
  }

  /**
   * @returns {Promise<void>}
   */
  async function onBulkCloseSelected() {
    await runBulkAction('Close', () => applyBulkStatus('closed'));
  }

  /**
   * @returns {Promise<void>}
   */
  async function onBulkReopenSelected() {
    await runBulkAction('Reopen', () => applyBulkStatus('open'));
  }

  /**
   * Build lit-html template for the list view.
   *
   * @param {Issue[]} filtered
   */
  function template(filtered) {
    const selected_visible_count = filtered.reduce((count, issue) => {
      return selected_issue_ids.has(issue.id) ? count + 1 : count;
    }, 0);
    const all_visible_selected =
      filtered.length > 0 && selected_visible_count === filtered.length;
    const is_partial_selection =
      selected_visible_count > 0 && !all_visible_selected;
    return html`
      <div class="panel__header">
        <div class="filter-dropdown ${status_dropdown_open ? 'is-open' : ''}">
          <button
            class="filter-dropdown__trigger"
            @click=${toggleStatusDropdown}
          >
            ${getDropdownDisplayText(status_filters, 'Status', statusLabel)}
            <span class="filter-dropdown__arrow">▾</span>
          </button>
          <div class="filter-dropdown__menu">
            ${['ready', 'open', 'in_progress', 'closed'].map(
              (s) => html`
                <label class="filter-dropdown__option">
                  <input
                    type="checkbox"
                    .checked=${status_filters.includes(s)}
                    @change=${() => toggleStatusFilter(s)}
                  />
                  ${s === 'ready' ? 'Ready' : statusLabel(s)}
                </label>
              `
            )}
          </div>
        </div>
        <div class="filter-dropdown ${type_dropdown_open ? 'is-open' : ''}">
          <button class="filter-dropdown__trigger" @click=${toggleTypeDropdown}>
            ${getDropdownDisplayText(type_filters, 'Types', typeLabel)}
            <span class="filter-dropdown__arrow">▾</span>
          </button>
          <div class="filter-dropdown__menu">
            ${ISSUE_TYPES.map(
              (t) => html`
                <label class="filter-dropdown__option">
                  <input
                    type="checkbox"
                    .checked=${type_filters.includes(t)}
                    @change=${() => toggleTypeFilter(t)}
                  />
                  ${typeLabel(t)}
                </label>
              `
            )}
          </div>
        </div>
        <input
          type="search"
          placeholder="Search…"
          @input=${onSearchInput}
          .value=${search_text}
        />
      </div>
      ${selected_issue_ids.size > 0
        ? html`<div class="bulk-toolbar" role="toolbar" aria-label="Bulk actions">
            <span class="bulk-toolbar__count"
              >${pluralize(selected_issue_ids.size, 'issue')} selected</span
            >
            <button ?disabled=${bulk_action_busy} @click=${onBulkEditLabels}>
              Edit labels
            </button>
            <button ?disabled=${bulk_action_busy} @click=${onBulkChangePriority}>
              Change priority
            </button>
            <button ?disabled=${bulk_action_busy} @click=${onBulkCloseSelected}>
              Close selected
            </button>
            <button ?disabled=${bulk_action_busy} @click=${onBulkReopenSelected}>
              Reopen selected
            </button>
          </div>`
        : null}
      <div class="panel__body" id="list-root">
        ${filtered.length === 0
          ? html`<div class="issues-block">
              <div class="muted" style="padding:10px 12px;">No issues</div>
            </div>`
          : html`<div class="issues-block">
              <table
                class="table"
                role="grid"
                aria-rowcount=${String(filtered.length)}
                aria-colcount="8"
              >
                <colgroup>
                  <col style="width: 48px" />
                  <col style="width: 100px" />
                  <col style="width: 120px" />
                  <col />
                  <col style="width: 120px" />
                  <col style="width: 160px" />
                  <col style="width: 130px" />
                  <col style="width: 80px" />
                </colgroup>
                <thead>
                  <tr role="row">
                    <th role="columnheader" class="row-select-cell">
                      <input
                        type="checkbox"
                        class="row-select-all-checkbox"
                        aria-label="Select all issues"
                        .checked=${all_visible_selected}
                        .indeterminate=${is_partial_selection}
                        .disabled=${bulk_action_busy}
                        @change=${/** @param {Event} ev */ (ev) => {
                          const input = /** @type {HTMLInputElement} */ (
                            ev.currentTarget
                          );
                          toggleAllVisibleIssues(filtered, input.checked);
                        }}
                      />
                    </th>
                    <th role="columnheader">ID</th>
                    <th role="columnheader">Type</th>
                    <th role="columnheader">Title</th>
                    <th role="columnheader">Status</th>
                    <th role="columnheader">Assignee</th>
                    <th role="columnheader">Priority</th>
                    <th role="columnheader">Deps</th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  ${filtered.map((it) => row_renderer(it))}
                </tbody>
              </table>
            </div>`}
      </div>
    `;
  }

  /**
   * Render the current issues_cache with filters applied.
   */
  function doRender() {
    const filtered = computeFilteredIssues();
    pruneSelection(filtered);
    render(template(filtered), mount_element);
  }

  // Initial render (header + body shell with current state)
  doRender();
  // no separate ready checkbox when using select option

  /**
   * Update minimal fields inline via ws mutations and refresh that row's data.
   *
   * @param {string} id
   * @param {{ [k: string]: any }} patch
   */
  async function updateInline(id, patch) {
    try {
      log('updateInline %s %o', id, Object.keys(patch));
      // Dispatch specific mutations based on provided keys
      if (typeof patch.title === 'string') {
        await sendFn('edit-text', { id, field: 'title', value: patch.title });
      }
      if (typeof patch.assignee === 'string') {
        await sendFn('update-assignee', { id, assignee: patch.assignee });
      }
      if (typeof patch.status === 'string') {
        await sendFn('update-status', { id, status: patch.status });
      }
      if (typeof patch.priority === 'number') {
        await sendFn('update-priority', { id, priority: patch.priority });
      }
    } catch {
      // ignore failures; UI state remains as-is
    }
  }

  /**
   * Load issues from local push stores and re-render.
   */
  async function load() {
    log('load');
    // Preserve scroll position to avoid jarring jumps on live refresh
    const beforeEl = /** @type {HTMLElement|null} */ (
      mount_element.querySelector('#list-root')
    );
    const prevScroll = beforeEl ? beforeEl.scrollTop : 0;
    // Compose items from subscriptions membership and issues store entities
    try {
      if (selectors) {
        issues_cache = /** @type {Issue[]} */ (
          selectors.selectIssuesFor('tab:issues')
        );
      } else {
        issues_cache = [];
      }
    } catch (err) {
      log('load failed: %o', err);
      issues_cache = [];
    }
    doRender();
    // Restore scroll position if possible
    try {
      const afterEl = /** @type {HTMLElement|null} */ (
        mount_element.querySelector('#list-root')
      );
      if (afterEl && prevScroll > 0) {
        afterEl.scrollTop = prevScroll;
      }
    } catch {
      // ignore
    }
  }

  // Keyboard navigation
  mount_element.tabIndex = 0;
  mount_element.addEventListener('keydown', (ev) => {
    // Grid cell Up/Down navigation when focus is inside the table and not within
    // an editable control (input/textarea/select). Preserves column position.
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      const tgt = /** @type {HTMLElement} */ (ev.target);
      const table =
        tgt && typeof tgt.closest === 'function'
          ? tgt.closest('#list-root table.table')
          : null;
      if (table) {
        // Do not intercept when inside native editable controls
        const in_editable = Boolean(
          tgt &&
          typeof tgt.closest === 'function' &&
          (tgt.closest('input') ||
            tgt.closest('textarea') ||
            tgt.closest('select'))
        );
        if (!in_editable) {
          const cell =
            tgt && typeof tgt.closest === 'function' ? tgt.closest('td') : null;
          if (cell && cell.parentElement) {
            const row = /** @type {HTMLTableRowElement} */ (cell.parentElement);
            const tbody = /** @type {HTMLTableSectionElement|null} */ (
              row.parentElement
            );
            if (tbody && tbody.querySelectorAll) {
              const rows = Array.from(tbody.querySelectorAll('tr'));
              const row_idx = Math.max(0, rows.indexOf(row));
              const col_idx = cell.cellIndex || 0;
              const next_idx =
                ev.key === 'ArrowDown'
                  ? Math.min(row_idx + 1, rows.length - 1)
                  : Math.max(row_idx - 1, 0);
              const next_row = rows[next_idx];
              const next_cell =
                next_row && next_row.cells ? next_row.cells[col_idx] : null;
              if (next_cell) {
                const focusable = /** @type {HTMLElement|null} */ (
                  next_cell.querySelector(
                    'button:not([disabled]), [tabindex]:not([tabindex="-1"]), a[href], select:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled])'
                  )
                );
                if (focusable && typeof focusable.focus === 'function') {
                  ev.preventDefault();
                  focusable.focus();
                  return;
                }
              }
            }
          }
        }
      }
    }

    const tbody = /** @type {HTMLTableSectionElement|null} */ (
      mount_element.querySelector('#list-root tbody')
    );
    const items = tbody ? tbody.querySelectorAll('tr') : [];
    if (items.length === 0) {
      return;
    }
    let idx = 0;
    if (selected_id) {
      const arr = Array.from(items);
      idx = arr.findIndex((el) => {
        const did = el.getAttribute('data-issue-id') || '';
        return did === selected_id;
      });
      if (idx < 0) {
        idx = 0;
      }
    }
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      const next = items[Math.min(idx + 1, items.length - 1)];
      const next_id = next ? next.getAttribute('data-issue-id') : '';
      const set = next_id ? next_id : null;
      if (store && set) {
        store.setState({ selected_id: set });
      }
      selected_id = set;
      doRender();
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      const prev = items[Math.max(idx - 1, 0)];
      const prev_id = prev ? prev.getAttribute('data-issue-id') : '';
      const set = prev_id ? prev_id : null;
      if (store && set) {
        store.setState({ selected_id: set });
      }
      selected_id = set;
      doRender();
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      const current = items[idx];
      const id = current ? current.getAttribute('data-issue-id') : '';
      if (id) {
        const nav = navigateFn || ((h) => (window.location.hash = h));
        /** @type {'issues'|'epics'|'board'} */
        const view = store ? store.getState().view : 'issues';
        nav(issueHashFor(view, id));
      }
    }
  });

  // Click outside to close dropdowns
  /** @param {MouseEvent} e */
  const clickOutsideHandler = (e) => {
    const target = /** @type {HTMLElement|null} */ (e.target);
    if (target && !target.closest('.filter-dropdown')) {
      if (status_dropdown_open || type_dropdown_open) {
        status_dropdown_open = false;
        type_dropdown_open = false;
        doRender();
      }
    }
  };
  document.addEventListener('click', clickOutsideHandler);

  // Keep selection in sync with store
  if (store) {
    unsubscribe = store.subscribe((s) => {
      if (s.selected_id !== selected_id) {
        selected_id = s.selected_id;
        log('selected %s', selected_id || '(none)');
        doRender();
      }
      if (s.filters && typeof s.filters === 'object') {
        const next_status = normalizeStatusFilter(s.filters.status);
        const next_search = s.filters.search || '';
        let needs_render = false;
        const status_changed =
          JSON.stringify(next_status) !== JSON.stringify(status_filters);
        if (status_changed) {
          status_filters = next_status;
          // Reload on any status scope change to keep cache correct
          void load();
          return;
        }
        if (next_search !== search_text) {
          search_text = next_search;
          needs_render = true;
        }
        const next_type_arr = normalizeTypeFilter(s.filters.type);
        const type_changed =
          JSON.stringify(next_type_arr) !== JSON.stringify(type_filters);
        if (type_changed) {
          type_filters = next_type_arr;
          needs_render = true;
        }
        if (needs_render) {
          doRender();
        }
      }
    });
  }

  // Live updates: recompose and re-render when issue stores change
  if (selectors) {
    selectors.subscribe(() => {
      try {
        issues_cache = /** @type {Issue[]} */ (
          selectors.selectIssuesFor('tab:issues')
        );
        doRender();
      } catch {
        // ignore
      }
    });
  }

  return {
    load,
    destroy() {
      mount_element.replaceChildren();
      document.removeEventListener('click', clickOutsideHandler);
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    }
  };
}
