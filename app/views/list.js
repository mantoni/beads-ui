import { html, render } from 'lit-html';
import { createListSelectors } from '../data/list-selectors.js';
import { ISSUE_TYPES, typeLabel } from '../utils/issue-type.js';
import { issueHashFor } from '../utils/issue-url.js';
// issueDisplayId not used directly in this file; rendered in shared row
import { statusLabel } from '../utils/status.js';
import { createIssueRowRenderer } from './issue-row.js';

// List view implementation; requires a transport send function.

/**
 * @typedef {{ id: string, title?: string, status?: string, priority?: number, issue_type?: string, assignee?: string, labels?: string[] }} Issue
 */

/**
 * Create the Issues List view.
 * @param {HTMLElement} mount_element - Element to render into.
 * @param {(type: string, payload?: unknown) => Promise<unknown>} sendFn - RPC transport.
 * @param {(hash: string) => void} [navigate_fn] - Navigation function (defaults to setting location.hash).
 * @param {{ getState: () => any, setState: (patch: any) => void, subscribe: (fn: (s:any)=>void)=>()=>void }} [store] - Optional state store.
 * @param {{ subscribe: (fn: () => void) => () => void, getMany: (ids: string[]) => any[] }} [issuesStore]
 * @param {{ selectors: { getIds: (client_id: string) => string[] } }} [subscriptions]
 * @param {{ snapshotFor?: (client_id: string) => any[], subscribe?: (fn: () => void) => () => void }} [issueStores]
 * @returns {{ load: () => Promise<void>, destroy: () => void }} View API.
 */
/**
 * Create the Issues List view.
 * @param {HTMLElement} mount_element
 * @param {(type: string, payload?: unknown) => Promise<unknown>} sendFn
 * @param {(hash: string) => void} [navigateFn]
 * @param {{ getState: () => any, setState: (patch: any) => void, subscribe: (fn: (s:any)=>void)=>()=>void }} [store]
 * @param {{ subscribe: (fn: () => void) => () => void, getMany: (ids: string[]) => any[] }} [issues_store]
 * @param {{ selectors: { getIds: (client_id: string) => string[] } }} [subscriptions]
 * @param {{ snapshotFor?: (client_id: string) => any[], subscribe?: (fn: () => void) => () => void }} [issue_stores]
 * @returns {{ load: () => Promise<void>, destroy: () => void }}
 */
export function createListView(
  mount_element,
  sendFn,
  navigateFn,
  store,
  issues_store = undefined,
  subscriptions = undefined,
  issue_stores = undefined
) {
  /** @type {string} */
  let status_filter = 'all';
  /** @type {string} */
  let search_text = '';
  /** @type {Issue[]} */
  let issues_cache = [];
  /** @type {string} */
  let type_filter = '';
  /** @type {string | null} */
  let selected_id = store ? store.getState().selected_id : null;
  /** @type {null | (() => void)} */
  let unsubscribe = null;
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
   * Event: select status change.
   */
  /**
   * @param {Event} ev
   */
  const onStatusChange = async (ev) => {
    /** @type {HTMLSelectElement} */
    const sel = /** @type {any} */ (ev.currentTarget);
    status_filter = sel.value;
    if (store) {
      store.setState({
        filters: { status: status_filter }
      });
    }
    // Always reload on status changes
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
    if (store) {
      store.setState({ filters: { search: search_text } });
    }
    doRender();
  };

  /**
   * Event: type select change.
   * @param {Event} ev
   */
  const onTypeChange = (ev) => {
    const sel = /** @type {HTMLSelectElement} */ (ev.currentTarget);
    type_filter = sel.value || '';
    if (store) {
      store.setState({ filters: { type: type_filter } });
    }
    doRender();
  };

  // Initialize filters from store on first render so reload applies persisted state
  if (store) {
    const s = store.getState();
    if (s && s.filters && typeof s.filters === 'object') {
      status_filter = s.filters.status || 'all';
      search_text = s.filters.search || '';
      type_filter = typeof s.filters.type === 'string' ? s.filters.type : '';
    }
  }
  // Initial values are reflected via bound `.value` in the template
  // Compose helpers: centralize membership + entity selection + sorting
  const selectors =
    subscriptions && issues_store
      ? createListSelectors(subscriptions, issues_store, issue_stores)
      : null;

  /**
   * Build lit-html template for the list view.
   */
  function template() {
    let filtered = issues_cache;
    if (status_filter !== 'all' && status_filter !== 'ready') {
      filtered = filtered.filter(
        (it) => String(it.status || '') === status_filter
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
    if (type_filter) {
      filtered = filtered.filter(
        (it) => String(it.issue_type || '') === String(type_filter)
      );
    }

    return html`
      <div class="panel__header">
        <select @change=${onStatusChange} .value=${status_filter}>
          <option value="all">All</option>
          <option value="ready">Ready</option>
          <option value="open">${statusLabel('open')}</option>
          <option value="in_progress">${statusLabel('in_progress')}</option>
          <option value="closed">${statusLabel('closed')}</option>
        </select>
        <select
          @change=${onTypeChange}
          .value=${type_filter}
          aria-label="Filter by type"
        >
          <option value="">All types</option>
          ${ISSUE_TYPES.map(
            (t) =>
              html`<option value=${t} ?selected=${type_filter === t}>
                ${typeLabel(t)}
              </option>`
          )}
        </select>
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
                aria-colcount="6"
              >
                <colgroup>
                  <col style="width: 100px" />
                  <col style="width: 120px" />
                  <col />
                  <col style="width: 120px" />
                  <col style="width: 160px" />
                  <col style="width: 130px" />
                </colgroup>
                <thead>
                  <tr role="row">
                    <th role="columnheader">ID</th>
                    <th role="columnheader">Type</th>
                    <th role="columnheader">Title</th>
                    <th role="columnheader">Status</th>
                    <th role="columnheader">Assignee</th>
                    <th role="columnheader">Priority</th>
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
   * @param {string} id
   * @param {{ [k: string]: any }} patch
   */
  async function updateInline(id, patch) {
    try {
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
      // Optionally fetch fresh row data while push updates arrive
      try {
        /** @type {any} */
        const full = await sendFn('show-issue', { id });
        const idx = issues_cache.findIndex((x) => x.id === id);
        if (idx >= 0 && full && typeof full === 'object') {
          issues_cache[idx] = /** @type {Issue} */ ({
            id: full.id,
            title: full.title,
            status: full.status,
            priority: full.priority,
            issue_type: full.issue_type,
            assignee: full.assignee,
            labels: Array.isArray(full.labels) ? full.labels : []
          });
          doRender();
        }
      } catch {
        // ignore refresh error; push will update view shortly
      }
    } catch {
      // ignore failures; UI state remains as-is
    }
  }

  /**
   * Load issues from local push stores and re-render.
   */
  async function load() {
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
    } catch {
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
          ? /** @type {HTMLTableElement} */ (
              tgt.closest('#list-root table.table')
            )
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
            tgt && typeof tgt.closest === 'function'
              ? /** @type {HTMLTableCellElement} */ (tgt.closest('td'))
              : null;
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

  // Keep selection in sync with store
  if (store) {
    unsubscribe = store.subscribe((s) => {
      if (s.selected_id !== selected_id) {
        selected_id = s.selected_id;
        doRender();
      }
      if (s.filters && typeof s.filters === 'object') {
        const next_status = s.filters.status;
        const next_search = s.filters.search || '';
        const next_type =
          typeof s.filters.type === 'string' ? s.filters.type : '';
        let needs_render = false;
        if (next_status !== status_filter) {
          status_filter = next_status;
          // Reload on any status scope change to keep cache correct
          void load();
          return;
        }
        if (next_search !== search_text) {
          search_text = next_search;
          needs_render = true;
        }
        if (next_type !== type_filter) {
          type_filter = next_type;
          needs_render = true;
        }
        if (needs_render) {
          doRender();
        }
      }
    });
  }

  // Live updates: recompose and re-render when issues store changes
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
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    }
  };
}
