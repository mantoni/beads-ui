import { html, render } from 'lit-html';
import { createListSelectors } from '../data/list-selectors.js';
import { cmpClosedDesc } from '../data/sort.js';
import { ISSUE_TYPES, typeLabel } from '../utils/issue-type.js';
import { issueHashFor } from '../utils/issue-url.js';
import { debug } from '../utils/logging.js';
import { statusLabel } from '../utils/status.js';
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
 * @param {{
 *   selectors?: { getIds?: (client_id: string) => string[] },
 *   subscribeList?: (client_id: string, spec: { type: string, params?: Record<string, string|number|boolean> }) => Promise<() => Promise<void>>
 * }} [subscriptions]
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
 * @param {{
 *   selectors?: { getIds?: (client_id: string) => string[] },
 *   subscribeList?: (client_id: string, spec: { type: string, params?: Record<string, string|number|boolean> }) => Promise<() => Promise<void>>
 * }} [subscriptions]
 * @param {{ snapshotFor?: (client_id: string) => any[], subscribe?: (fn: () => void) => () => void }} [issue_stores]
 * @returns {{ load: () => Promise<void>, destroy: () => void }}
 */
export function createListView(
  mount_element,
  sendFn,
  navigateFn,
  store,
  subscriptions = undefined,
  issue_stores = undefined
) {
  const log = debug('views:list');
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
  /** @type {Set<string>} */
  const expanded = new Set();
  /** @type {Set<string>} */
  const loading = new Set();
  /** @type {Map<string, () => Promise<void>>} */
  const epic_unsubs = new Map();
  /** @type {null | (() => void)} */
  let unsubscribe = null;
  let status_dropdown_open = false;
  let type_dropdown_open = false;

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

  /**
   * Build navigate handler shared by all three row renderers.
   *
   * @param {string} id
   */
  function navigateToIssue(id) {
    const nav = navigateFn || ((h) => (window.location.hash = h));
    /** @type {'issues'|'epics'|'board'} */
    const view = store ? store.getState().view : 'issues';
    nav(issueHashFor(view, id));
  }

  // Shared row renderer for non-epic top-level rows
  const row_renderer = createIssueRowRenderer({
    navigate: navigateToIssue,
    onUpdate: updateInline,
    requestRender: doRender,
    getSelectedId: () => selected_id,
    row_class: 'issue-row'
  });

  // Child rows are canonical rows with an extra class for visual differentiation
  const child_row_renderer = createIssueRowRenderer({
    navigate: navigateToIssue,
    onUpdate: updateInline,
    requestRender: doRender,
    getSelectedId: () => selected_id,
    row_class: 'issue-row epic-child-row'
  });

  // Epic rows use the canonical pipeline but inject a custom title cell
  // (chevron + title text + progress bar). Only the chevron toggles expand.
  const epic_row_renderer = createIssueRowRenderer({
    navigate: navigateToIssue,
    onUpdate: updateInline,
    requestRender: doRender,
    getSelectedId: () => selected_id,
    row_class: 'issue-row epic-row-inline',
    title_renderer: /** @param {{ id: string, title?: string }} it */ (it) => {
      const id = String(it.id);
      const is_open = expanded.has(id);
      const { total, closed } = getEpicCounters(id);
      return html`
        <span class="epic-title-cell" data-epic-id=${id}>
          <span
            class="epic-chevron"
            role="button"
            tabindex="0"
            aria-expanded=${is_open ? 'true' : 'false'}
            aria-label=${is_open ? 'Collapse epic' : 'Expand epic'}
            @click=${
              /** @param {Event} ev */ (ev) => {
                ev.stopPropagation();
                ev.preventDefault();
                void toggleEpic(id);
              }
            }
            @keydown=${
              /** @param {KeyboardEvent} ev */ (ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                  ev.preventDefault();
                  ev.stopPropagation();
                  void toggleEpic(id);
                }
              }
            }
            >${is_open ? '▾' : '▸'}</span
          >
          <span class="epic-title-text">${it.title || ''}</span>
          <span class="epic-progress">
            <progress value=${closed} max=${Math.max(1, total)}></progress>
            <span class="muted mono">${closed}/${total}</span>
          </span>
        </span>
      `;
    }
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
   * Look up counters for an epic from the tab:epics snapshot.
   * Returns {total: 0, closed: 0} if the epic isn't in the snapshot yet
   * (race condition during initial load — progress bar will update on
   * the next push when tab:epics arrives).
   *
   * @param {string} epic_id
   */
  function getEpicCounters(epic_id) {
    if (!issue_stores || typeof issue_stores.snapshotFor !== 'function') {
      return { total: 0, closed: 0 };
    }
    const arr = issue_stores.snapshotFor('tab:epics') || [];
    const meta = arr.find((e) => String(e?.id || '') === String(epic_id));
    if (!meta) return { total: 0, closed: 0 };
    return {
      total: Number(/** @type {any} */ (meta).total_children || 0),
      closed: Number(/** @type {any} */ (meta).closed_children || 0)
    };
  }

  /**
   * Partition the (filtered ∪ expanded-epics) list into:
   *  - epic_rows: items with issue_type === 'epic' (rendered with header + optional children)
   *  - top_level_rows: non-epic items WHOSE PARENT IS NOT IN epic_ids
   *  - (children of epics in epic_ids are rendered inline under their epic when expanded)
   *
   * Recovers any expanded epic that the filter excluded — expanded epics
   * always render so their (possibly-matching) children remain reachable.
   *
   * @param {Issue[]} filtered - Items that passed the top-level filter
   * @param {Issue[]} all - The full issues_cache (used to recover expanded-but-filtered epics)
   */
  function partitionForTree(filtered, all) {
    const filtered_ids = new Set(filtered.map((it) => String(it.id)));
    /** @type {Issue[]} */
    const recovered = [];
    for (const ep of all) {
      if (String(ep.issue_type || '') !== 'epic') continue;
      const id = String(ep.id);
      if (expanded.has(id) && !filtered_ids.has(id)) {
        recovered.push(ep);
      }
    }
    const effective = filtered.concat(recovered);

    const epic_ids = new Set(
      effective
        .filter((it) => String(it.issue_type || '') === 'epic')
        .map((it) => String(it.id))
    );
    /** @type {Issue[]} */
    const epic_rows = [];
    /** @type {Issue[]} */
    const top_level_rows = [];
    for (const it of effective) {
      const is_epic = String(it.issue_type || '') === 'epic';
      if (is_epic) {
        epic_rows.push(it);
        continue;
      }
      const parent = String(/** @type {any} */ (it).parent || '');
      if (parent && epic_ids.has(parent)) {
        continue; // Hidden — will appear under its epic if expanded
      }
      top_level_rows.push(it);
    }
    return { epic_rows, top_level_rows, epic_ids };
  }

  /**
   * Apply current filters to a list of issues (used for child filtering).
   *
   * Intentionally narrower than the top-level filter:
   *  - No 'ready' branch — 'ready' is a top-level membership concept, not a per-row predicate.
   *    Children inherit visibility from their epic's filter pass.
   *  - No closed-sort branch — children sort within their parent epic; closed-only sort
   *    is a list-level concern, not a child concern.
   *
   * @param {Issue[]} list
   */
  function applyFiltersToIssues(list) {
    let out = list;
    if (status_filters.length > 0 && !status_filters.includes('ready')) {
      out = out.filter((it) =>
        status_filters.includes(String(it.status || ''))
      );
    }
    if (search_text) {
      const needle = search_text.toLowerCase();
      out = out.filter((it) => {
        const a = String(it.id).toLowerCase();
        const b = String(it.title || '').toLowerCase();
        return a.includes(needle) || b.includes(needle);
      });
    }
    if (type_filters.length > 0) {
      out = out.filter((it) =>
        type_filters.includes(String(it.issue_type || ''))
      );
    }
    return out;
  }

  /**
   * Build lit-html template for the list view.
   */
  function template() {
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
    // Sorting: closed list is a special case → sort by closed_at desc only
    if (status_filters.length === 1 && status_filters[0] === 'closed') {
      filtered = filtered.slice().sort(cmpClosedDesc);
    }

    const { epic_rows, top_level_rows } = partitionForTree(
      filtered,
      issues_cache
    );

    // Merge epics and non-epic top-level rows by the existing priority/created sort.
    const merged = [...epic_rows, ...top_level_rows].sort((a, b) => {
      const pa = a.priority ?? 2;
      const pb = b.priority ?? 2;
      if (pa !== pb) return pa - pb;
      const ca = /** @type {any} */ (a).created_at ?? 0;
      const cb = /** @type {any} */ (b).created_at ?? 0;
      if (ca !== cb) return ca < cb ? -1 : 1;
      return String(a.id) < String(b.id) ? -1 : 1;
    });

    /** @type {import('lit-html').TemplateResult<1>[]} */
    const rows_array = [];
    for (const it of merged) {
      if (String(it.issue_type || '') === 'epic') {
        rows_array.push(epic_row_renderer(it));
        if (expanded.has(String(it.id))) {
          const children = selectors
            ? selectors.selectEpicChildren(String(it.id))
            : [];
          const filtered_children = applyFiltersToIssues(
            /** @type {Issue[]} */ (children)
          );
          for (const child of filtered_children) {
            rows_array.push(child_row_renderer(child));
          }
        }
      } else {
        rows_array.push(row_renderer(it));
      }
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
      <div class="panel__body" id="list-root">
        ${rows_array.length === 0
          ? html`<div class="issues-block">
              <div class="muted" style="padding:10px 12px;">No issues</div>
            </div>`
          : html`<div class="issues-block">
              <table
                class="table"
                role="grid"
                aria-rowcount=${String(rows_array.length)}
                aria-colcount="6"
              >
                <colgroup>
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
                  ${rows_array}
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
    } catch {
      // ignore failures; UI state remains as-is
    }
  }

  /**
   * Toggle expanded state for an epic row.
   *
   * @param {string} epic_id
   */
  async function toggleEpic(epic_id) {
    if (!expanded.has(epic_id)) {
      expanded.add(epic_id);
      loading.add(epic_id);
      doRender();
      if (
        subscriptions &&
        typeof (/** @type {any} */ (subscriptions).subscribeList) === 'function'
      ) {
        try {
          if (issue_stores && /** @type {any} */ (issue_stores).register) {
            /** @type {any} */ (issue_stores).register(`detail:${epic_id}`, {
              type: 'issue-detail',
              params: { id: epic_id }
            });
          }
          const u = await /** @type {any} */ (subscriptions).subscribeList(
            `detail:${epic_id}`,
            {
              type: 'issue-detail',
              params: { id: epic_id }
            }
          );
          epic_unsubs.set(epic_id, u);
        } catch {
          // ignore subscription failures
        }
      }
      loading.delete(epic_id);
    } else {
      expanded.delete(epic_id);
      const u = epic_unsubs.get(epic_id);
      if (u) {
        try {
          await u();
        } catch {
          /* ignore */
        }
        epic_unsubs.delete(epic_id);
      }
      if (issue_stores && /** @type {any} */ (issue_stores).unregister) {
        try {
          /** @type {any} */ (issue_stores).unregister(`detail:${epic_id}`);
        } catch {
          /* ignore */
        }
      }
    }
    doRender();
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
      for (const u of epic_unsubs.values()) {
        try {
          void u();
        } catch {
          /* ignore */
        }
      }
      epic_unsubs.clear();
      expanded.clear();
      mount_element.replaceChildren();
      document.removeEventListener('click', clickOutsideHandler);
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    }
  };
}
