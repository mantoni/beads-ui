/**
 * @import { Status } from '../protocol.js'
 * @import { StatusFilter } from '../utils/status.js'
 */
import { html, render } from 'lit-html';
import { createListSelectors } from '../data/list-selectors.js';
import { cmpClosedDesc, compareByKey } from '../data/sort.js';
import { ISSUE_TYPES, typeLabel } from '../utils/issue-type.js';
import { issueHashFor } from '../utils/issue-url.js';
import { debug } from '../utils/logging.js';
import { sortableHeaderCell } from '../utils/sortable-header.js';
import {
  FILTERABLE_STATUSES,
  normalizeStatusFilters,
  sameStatusFilters,
  statusLabel
} from '../utils/status.js';
import { createIssueRowRenderer } from './issue-row.js';

/**
 * @import { SortKey } from '../data/sort.js'
 */

// List view implementation; requires a transport send function.

/**
 * @typedef {{ id: string, title?: string, status?: Status, priority?: number, issue_type?: string, assignee?: string, labels?: string[] }} Issue
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
  /** @type {StatusFilter[]} */
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
  /** @type {{ key: SortKey | null, dir: 'asc' | 'desc' }} */
  let sort_state = { key: null, dir: 'asc' };

  /**
   * Toggle sorting for a column: first click sorts ascending, clicking the
   * active column flips direction.
   *
   * @param {string} key
   */
  const onSort = (key) => {
    const k = /** @type {SortKey} */ (key);
    if (sort_state.key === k) {
      sort_state = { key: k, dir: sort_state.dir === 'asc' ? 'desc' : 'asc' };
    } else {
      sort_state = { key: k, dir: 'asc' };
    }
    log('sort %s %s', sort_state.key, sort_state.dir);
    doRender();
  };

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
    row_class: 'issue-row'
  });

  /**
   * Apply a new status selection: publish it and refetch the list.
   *
   * @param {StatusFilter[]} next
   */
  const applyStatusFilters = async (next) => {
    // Normalize here too: the store normalizes what it publishes, and a local
    // value that disagreed with it would survive — the store suppresses the
    // notification when its own value is unchanged.
    status_filters = normalizeStatusFilters(next);
    if (store) {
      store.setState({ filters: { status: status_filters } });
    }
    await load();
  };

  /**
   * Toggle a stored status. Selecting one leaves the `ready` scope: readiness
   * is a membership the server answers with its own list, so it cannot be
   * unioned with statuses the client filters row by row.
   *
   * @param {Status} status
   */
  const toggleStatusFilter = async (status) => {
    const stored = status_filters.filter((s) => s !== 'ready');
    const next = stored.includes(status)
      ? stored.filter((s) => s !== status)
      : [...stored, status];
    log('status toggle %s -> %o', status, next);
    await applyStatusFilters(next);
  };

  /**
   * Select the list scope. `ready` is exclusive with the stored statuses, so
   * picking it clears them.
   *
   * @param {'all' | 'ready'} scope
   */
  const selectStatusScope = async (scope) => {
    /** @type {StatusFilter[]} */
    const next = scope === 'ready' ? ['ready'] : [];
    log('status scope %s', scope);
    await applyStatusFilters(next);
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
      status_filters = normalizeStatusFilters(s.filters.status);
      search_text = s.filters.search || '';
      type_filters = normalizeTypeFilter(s.filters.type);
    }
  }
  // Initial values are reflected via bound `.value` in the template
  // Compose helpers: centralize membership + entity selection + sorting
  const selectors = issue_stores ? createListSelectors(issue_stores) : null;

  /**
   * Build lit-html template for the list view.
   */
  function template() {
    // `ready` is a server-side membership, never a row predicate; every other
    // entry narrows the rows as a union.
    const is_ready_scope = status_filters.includes('ready');
    const stored_status_filters = status_filters.filter((s) => s !== 'ready');

    let filtered = issues_cache;
    if (stored_status_filters.length > 0) {
      filtered = filtered.filter((it) =>
        /** @type {string[]} */ (stored_status_filters).includes(
          String(it.status || '')
        )
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
    // Sorting: an explicit column sort wins; otherwise the closed list is a
    // special case → sort by closed_at desc only. With no sort selected the
    // list keeps the selector's default order (priority asc → created asc).
    if (sort_state.key) {
      filtered = filtered
        .slice()
        .sort(compareByKey(sort_state.key, sort_state.dir));
    } else if (
      stored_status_filters.length === 1 &&
      stored_status_filters[0] === 'closed'
    ) {
      filtered = filtered.slice().sort(cmpClosedDesc);
    }

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
            <!--
              Scope and status are separate concepts, so they are separate
              controls: "Ready only" is a server-side membership that cannot be
              combined with a client-side status union, and a radio pair makes
              that exclusivity visible before the click instead of silently
              clearing the checkboxes after it.
            -->
            <div class="filter-dropdown__group-label">Scope</div>
            ${[
              // "By status" names the mode, not the result: it stays accurate
              // once a checkbox narrows the list, where "All issues" would not.
              { scope: /** @type {const} */ ('all'), label: 'By status' },
              { scope: /** @type {const} */ ('ready'), label: 'Ready only' }
            ].map(
              (opt) => html`
                <label
                  class="filter-dropdown__option filter-dropdown__option--scope"
                >
                  <input
                    type="radio"
                    name="list-status-scope"
                    .checked=${opt.scope === 'ready'
                      ? is_ready_scope
                      : !is_ready_scope}
                    @change=${() => selectStatusScope(opt.scope)}
                  />
                  ${opt.label}
                </label>
              `
            )}
            <div class="filter-dropdown__divider" role="separator"></div>
            <div class="filter-dropdown__group-label">Status</div>
            ${FILTERABLE_STATUSES.map(
              (s) => html`
                <label
                  class="filter-dropdown__option filter-dropdown__option--status ${is_ready_scope
                    ? 'is-disabled'
                    : ''}"
                >
                  <input
                    type="checkbox"
                    ?disabled=${is_ready_scope}
                    .checked=${
                      /** @type {string[]} */ (status_filters).includes(s)
                    }
                    @change=${() => toggleStatusFilter(s)}
                  />
                  ${statusLabel(s)}
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
                aria-colcount="9"
              >
                <colgroup>
                  <col style="width: 100px" />
                  <col style="width: 120px" />
                  <col />
                  <col style="width: 120px" />
                  <col style="width: 160px" />
                  <col style="width: 130px" />
                  <col style="width: 130px" />
                  <col style="width: 130px" />
                  <col style="width: 80px" />
                </colgroup>
                <thead>
                  <tr role="row">
                    ${sortableHeaderCell({
                      label: 'ID',
                      sort_key: 'id',
                      sort_state,
                      on_sort: onSort,
                      columnheader: true
                    })}
                    <th role="columnheader">Type</th>
                    <th role="columnheader">Title</th>
                    <th role="columnheader">Status</th>
                    <th role="columnheader">Assignee</th>
                    <th role="columnheader">Priority</th>
                    ${sortableHeaderCell({
                      label: 'Created',
                      sort_key: 'created_at',
                      sort_state,
                      on_sort: onSort,
                      columnheader: true
                    })}
                    ${sortableHeaderCell({
                      label: 'Updated',
                      sort_key: 'updated_at',
                      sort_state,
                      on_sort: onSort,
                      columnheader: true
                    })}
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
    render(template(), mount_element);
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
      if (typeof patch.issue_type === 'string') {
        await sendFn('update-type', { id, type: patch.issue_type });
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
        const next_status = normalizeStatusFilters(s.filters.status);
        const next_search = s.filters.search || '';
        let needs_render = false;
        const status_changed = !sameStatusFilters(next_status, status_filters);
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
