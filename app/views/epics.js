import { html, render } from 'lit-html';
import { createListSelectors } from '../data/list-selectors.js';
import { createIssueIdRenderer } from '../utils/issue-id-renderer.js';
import { statusLabel } from '../utils/status.js';
import { createIssueRowRenderer } from './issue-row.js';

/**
 * @typedef {{ id: string, title?: string, status?: string, priority?: number, issue_type?: string, assignee?: string, created_at?: number, updated_at?: number }} IssueLite
 */

/**
 * Epics view (push-only):
 * - Derives epic groups from the local issues store (no RPC reads).
 * - Subscribes to `tab:epics` for top-level membership.
 * - On expand, subscribes to `detail:{id}` (issue-detail) for the epic.
 * - Renders children from the epic detail's `dependents` list.
 * - Provides inline edits via mutations; UI re-renders on push.
 *
 * @param {HTMLElement} mount_element
 * @param {{ updateIssue: (input: any) => Promise<any> }} data
 * @param {(id: string) => void} goto_issue - Navigate to issue detail.
 * @param {{ subscribeList: (client_id: string, spec: { type: string, params?: Record<string, string|number|boolean> }) => Promise<() => Promise<void>>, selectors: { getIds: (client_id: string) => string[], count?: (client_id: string) => number } }} [subscriptions]
 * @param {{ snapshotFor?: (client_id: string) => any[], subscribe?: (fn: () => void) => () => void }} [issue_stores]
 */
export function createEpicsView(
  mount_element,
  data,
  goto_issue,
  subscriptions = undefined,
  issue_stores = undefined
) {
  /** @type {any[]} */
  let groups = [];
  /** @type {'id'|'name'|'status'} */
  let sort_column = 'id';
  /** @type {'asc'|'desc'} */
  let sort_direction = 'asc';
  /** @type {Set<string>} */
  const expanded = new Set();
  /** @type {Set<string>} */
  const loading = new Set();
  /** @type {Map<string, () => Promise<void>>} */
  const epic_unsubs = new Map();
  // Centralized selection helpers
  const selectors = issue_stores ? createListSelectors(issue_stores) : null;
  // Live re-render on pushes: recompute groups when stores change
  if (selectors) {
    selectors.subscribe(() => {
      const had_none = groups.length === 0;
      groups = buildGroupsFromSnapshot();
      doRender();
      // Auto-expand first epic when transitioning from empty to non-empty
      if (had_none && groups.length > 0) {
        const first_id = String(getSortedGroups(groups)[0]?.epic?.id || '');
        if (first_id && !expanded.has(first_id)) {
          void toggle(first_id);
        }
      }
    });
  }

  // Shared row renderer used for children rows
  const render_row = createIssueRowRenderer({
    navigate: (id) => goto_issue(id),
    onUpdate: updateInline,
    requestRender: doRender,
    getSelectedId: () => null,
    row_class: 'epic-row'
  });

  function doRender() {
    render(template(), mount_element);
  }

  function template() {
    if (!groups.length) {
      return html`<div class="panel__header muted">No epics found.</div>`;
    }
    const sorted_groups = getSortedGroups(groups);
    return html`
      <div class="epics-list-header" role="toolbar" aria-label="Sort epics">
        ${sortHeaderTemplate('id', 'Id')} ${sortHeaderTemplate('name', 'Name')}
        ${sortHeaderTemplate('status', 'Status')}
        <div class="epics-list-header__meta" aria-hidden="true"></div>
      </div>
      ${sorted_groups.map((group) => groupTemplate(group))}
    `;
  }

  /**
   * @param {'id'|'name'|'status'} column
   * @param {string} label
   */
  function sortHeaderTemplate(column, label) {
    const is_active = sort_column === column;
    const next_direction =
      is_active && sort_direction === 'asc' ? 'desc' : 'asc';
    const sort_icon = is_active
      ? sort_direction === 'asc'
        ? html`<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>`
        : html`<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/></svg>`
      : html`<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 15l5 5 5-5"/><path d="M7 9l5-5 5 5"/></svg>`;
    return html`
      <button
        type="button"
        class="epics-sort-button ${is_active ? 'is-active' : ''}"
        data-sort-column=${column}
        aria-label=${`Sort by ${label} ${next_direction}`}
        aria-pressed=${is_active}
        @click=${() => toggleSort(column)}
      >
        <span>${label}</span>
        ${sort_icon}
      </button>
    `;
  }

  /**
   * @param {any} group
   */
  function groupTemplate(group) {
    const epic = group.epic || {};
    const id = String(epic.id || '');
    const is_open = expanded.has(id);
    const status = String(epic.status || 'open');
    const status_text = statusLabel(status);
    const list = selectors ? selectors.selectEpicChildren(id) : [];
    const is_loading = loading.has(id);
    return html`
      <div class="epic-group" data-epic-id=${id}>
        <div
          class="epic-header"
          @click=${() => toggle(id)}
          @keydown=${
            /** @param {KeyboardEvent} ev */ (ev) => onHeaderKeydown(ev, id)
          }
          role="button"
          tabindex="0"
          aria-expanded=${is_open}
        >
          <div class="epic-header__cell epic-header__cell--id">
            ${createIssueIdRenderer(id, { class_name: 'mono' })}
          </div>
          <div class="epic-header__cell epic-header__cell--name">
            ${is_open
              ? html`<svg class="epic-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>`
              : html`<svg class="epic-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>`}
            <span class="text-truncate">${epic.title || '(no title)'}</span>
          </div>
          <div class="epic-header__cell epic-header__cell--status">
            <span class="status-badge is-${status}">${status_text}</span>
          </div>
          <div class="epic-header__meta">
            <span class="epic-progress">
              <progress
                value=${Number(group.closed_children || 0)}
                max=${Math.max(1, Number(group.total_children || 0))}
              ></progress>
              <span class="muted mono"
                >${group.closed_children}/${group.total_children}</span
              >
            </span>
          </div>
        </div>
        ${is_open
          ? html`<div class="epic-children">
              ${is_loading
                ? html`<div class="muted">Loading…</div>`
                : list.length === 0
                  ? html`<div class="muted">No issues found</div>`
                  : html`<table class="table">
                      <colgroup>
                        <col style="width: 100px" />
                        <col style="width: 120px" />
                        <col />
                        <col style="width: 120px" />
                        <col style="width: 160px" />
                        <col style="width: 130px" />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Type</th>
                          <th>Title</th>
                          <th>Status</th>
                          <th>Assignee</th>
                          <th>Priority</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${list.map((item) => render_row(item))}
                      </tbody>
                    </table>`}
            </div>`
          : null}
      </div>
    `;
  }

  /**
   * @param {KeyboardEvent} ev
   * @param {string} epic_id
   */
  function onHeaderKeydown(ev, epic_id) {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      void toggle(epic_id);
    }
  }

  /**
   * @param {'id'|'name'|'status'} column
   */
  function toggleSort(column) {
    if (sort_column === column) {
      sort_direction = sort_direction === 'asc' ? 'desc' : 'asc';
    } else {
      sort_column = column;
      sort_direction = 'asc';
    }
    doRender();
  }

  /**
   * @param {any[]} next_groups
   */
  function getSortedGroups(next_groups) {
    return next_groups.slice().sort(compareGroups);
  }

  /**
   * @param {any} left_group
   * @param {any} right_group
   */
  function compareGroups(left_group, right_group) {
    let result = 0;
    if (sort_column === 'id') {
      result = compareText(left_group?.epic?.id, right_group?.epic?.id);
    } else if (sort_column === 'name') {
      result = compareText(left_group?.epic?.title, right_group?.epic?.title);
    } else {
      result = compareStatus(
        left_group?.epic?.status,
        right_group?.epic?.status
      );
    }
    if (result === 0) {
      result = compareText(left_group?.epic?.id, right_group?.epic?.id);
    }
    return sort_direction === 'asc' ? result : result * -1;
  }

  /**
   * @param {string | undefined} left
   * @param {string | undefined} right
   */
  function compareText(left, right) {
    return String(left || '').localeCompare(String(right || ''), undefined, {
      numeric: true,
      sensitivity: 'base'
    });
  }

  /**
   * @param {string | undefined} left
   * @param {string | undefined} right
   */
  function compareStatus(left, right) {
    return statusRank(left) - statusRank(right);
  }

  /**
   * @param {string | undefined} value
   */
  function statusRank(value) {
    switch (String(value || 'open')) {
      case 'open':
        return 0;
      case 'in_progress':
        return 1;
      case 'closed':
        return 2;
      default:
        return 3;
    }
  }

  /**
   * @param {string} id
   * @param {{ [k: string]: any }} patch
   */
  async function updateInline(id, patch) {
    try {
      await data.updateIssue({ id, ...patch });
      // Re-render; view will update on subsequent push
      doRender();
    } catch {
      // swallow; UI remains
    }
  }

  /**
   * @param {string} epic_id
   */
  async function toggle(epic_id) {
    if (!expanded.has(epic_id)) {
      expanded.add(epic_id);
      loading.add(epic_id);
      doRender();
      // Subscribe to epic detail; children are rendered from `dependents`
      if (subscriptions && typeof subscriptions.subscribeList === 'function') {
        try {
          // Register store first to avoid dropping the initial snapshot
          try {
            if (issue_stores && /** @type {any} */ (issue_stores).register) {
              /** @type {any} */ (issue_stores).register(`detail:${epic_id}`, {
                type: 'issue-detail',
                params: { id: epic_id }
              });
            }
          } catch {
            // ignore
          }
          const unsub = await subscriptions.subscribeList(`detail:${epic_id}`, {
            type: 'issue-detail',
            params: { id: epic_id }
          });
          epic_unsubs.set(epic_id, unsub);
        } catch {
          // ignore subscription failures
        }
      }
      // Mark as not loading after subscribe attempt; membership will stream in
      loading.delete(epic_id);
    } else {
      expanded.delete(epic_id);
      // Unsubscribe when collapsing
      if (epic_unsubs.has(epic_id)) {
        try {
          const unsub = epic_unsubs.get(epic_id);
          if (unsub) {
            await unsub();
          }
        } catch {
          // ignore
        }
        epic_unsubs.delete(epic_id);
        try {
          if (issue_stores && /** @type {any} */ (issue_stores).unregister) {
            /** @type {any} */ (issue_stores).unregister(`detail:${epic_id}`);
          }
        } catch {
          // ignore
        }
      }
    }
    doRender();
  }

  /** Build groups from the current `tab:epics` snapshot. */
  function buildGroupsFromSnapshot() {
    /** @type {IssueLite[]} */
    const epic_entities =
      issue_stores && issue_stores.snapshotFor
        ? /** @type {IssueLite[]} */ (
            issue_stores.snapshotFor('tab:epics') || []
          )
        : [];
    const next_groups = [];
    for (const epic of epic_entities) {
      const dependents = Array.isArray(/** @type {any} */ (epic).dependents)
        ? /** @type {any[]} */ (/** @type {any} */ (epic).dependents)
        : [];
      // Prefer explicit counters when provided by server; otherwise derive
      const has_total = Number.isFinite(
        /** @type {any} */ (epic).total_children
      );
      const has_closed = Number.isFinite(
        /** @type {any} */ (epic).closed_children
      );
      const total = has_total
        ? Number(/** @type {any} */ (epic).total_children) || 0
        : dependents.length;
      let closed = has_closed
        ? Number(/** @type {any} */ (epic).closed_children) || 0
        : 0;
      if (!has_closed) {
        for (const dependent of dependents) {
          if (String(dependent.status || '') === 'closed') {
            closed++;
          }
        }
      }
      next_groups.push({
        epic,
        total_children: total,
        closed_children: closed
      });
    }
    return next_groups;
  }

  return {
    async load() {
      groups = buildGroupsFromSnapshot();
      doRender();
      // Auto-expand first epic on screen
      try {
        if (groups.length > 0) {
          const first_id = String(getSortedGroups(groups)[0]?.epic?.id || '');
          if (first_id && !expanded.has(first_id)) {
            // This will render and load children lazily
            await toggle(first_id);
          }
        }
      } catch {
        // ignore auto-expand failures
      }
    }
  };
}
