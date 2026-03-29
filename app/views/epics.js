import { html, nothing, render } from 'lit-html';
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
  /** @type {'id'|'type'|'title'|'status'|'assignee'|'priority'} */
  let child_sort_column = 'priority';
  /** @type {'asc'|'desc'} */
  let child_sort_direction = 'asc';
  /** @type {Set<string>} */
  const expanded = new Set();
  /** @type {Set<string>} */
  const loading = new Set();
  /** @type {Map<string, () => Promise<void>>} */
  const epic_unsubs = new Map();
  const selectors = issue_stores ? createListSelectors(issue_stores) : null;

  if (selectors) {
    selectors.subscribe(() => {
      const had_none = groups.length === 0;
      groups = buildGroupsFromSnapshot();
      doRender();
      if (had_none && groups.length > 0) {
        const first_id = String(getSortedGroups(groups)[0]?.epic?.id || '');
        if (first_id && !expanded.has(first_id)) {
          void toggle(first_id);
        }
      }
    });
  }

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
      return html`<div
        class="panel__header muted"
        data-testid="epics-empty"
      >
        No epics found.
      </div>`;
    }
    const sorted_groups = getSortedGroups(groups);
    return html`
      <div class="epics-table-wrap" data-testid="epics-view">
        <table class="epics-table" data-testid="epics-table">
          <colgroup>
            <col class="epics-table__col epics-table__col--id" />
            <col class="epics-table__col epics-table__col--name" />
            <col class="epics-table__col epics-table__col--status" />
            <col class="epics-table__col epics-table__col--meta" />
          </colgroup>
          <thead class="epics-list-header" data-testid="epics-header">
            <tr>
              <th scope="col" data-testid="epics-header-id">${sortHeaderTemplate('id', 'Id')}</th>
              <th scope="col" data-testid="epics-header-name">${sortHeaderTemplate('name', 'Name')}</th>
              <th scope="col" data-testid="epics-header-status">${sortHeaderTemplate('status', 'Status')}</th>
              <th scope="col" class="epics-list-header__meta" data-testid="epics-header-progress">Progress</th>
            </tr>
          </thead>
          ${sorted_groups.map((group) => groupTemplate(group))}
        </table>
      </div>
    `;
  }

  /**
   * @param {'id'|'name'|'status'} column
   * @param {string} label
   */
  function sortHeaderTemplate(column, label) {
    return sortButtonTemplate({
      column,
      label,
      active_column: sort_column,
      active_direction: sort_direction,
      data_attribute_name: 'data-sort-column',
      onToggle: () => toggleSort(column)
    });
  }

  /**
   * @param {'id'|'type'|'title'|'status'|'assignee'|'priority'} column
   * @param {string} label
   */
  function childSortHeaderTemplate(column, label) {
    return sortButtonTemplate({
      column,
      label,
      active_column: child_sort_column,
      active_direction: child_sort_direction,
      data_attribute_name: 'data-child-sort-column',
      onToggle: () => toggleChildSort(column)
    });
  }

  /**
   * @param {{
   *   column: string,
   *   label: string,
   *   active_column: string,
   *   active_direction: 'asc'|'desc',
   *   data_attribute_name: string,
   *   onToggle: () => void
   * }} input
   */
  function sortButtonTemplate(input) {
    const {
      column,
      label,
      active_column,
      active_direction,
      data_attribute_name,
      onToggle
    } = input;
    const is_active = active_column === column;
    const next_direction =
      is_active && active_direction === 'asc' ? 'desc' : 'asc';
    const sort_icon = is_active
      ? active_direction === 'asc'
        ? html`<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>`
        : html`<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/></svg>`
      : html`<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 15l5 5 5-5"/><path d="M7 9l5-5 5 5"/></svg>`;
    return html`
      <button
        type="button"
        class="epics-sort-button ${is_active ? 'is-active' : ''}"
        data-sort-column=${data_attribute_name === 'data-sort-column'
          ? column
          : nothing}
        data-child-sort-column=${data_attribute_name === 'data-child-sort-column'
          ? column
          : nothing}
        data-testid=${data_attribute_name === 'data-sort-column'
          ? `epics-sort-${column}`
          : `epic-child-sort-${column}`}
        aria-label=${`Sort by ${label} ${next_direction}`}
        aria-pressed=${is_active}
        @click=${onToggle}
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
    const sorted_list = getSortedChildren(list);
    const is_loading = loading.has(id);
    return html`
      <tbody
        class="epic-group ${is_open ? 'is-open' : ''}"
        data-epic-id=${id}
        data-testid=${`epic-group-${id}`}
      >
        <tr
          class="epic-header"
          data-testid=${`epic-header-${id}`}
          @click=${() => toggle(id)}
          @keydown=${
            /** @param {KeyboardEvent} ev */ (ev) => onHeaderKeydown(ev, id)
          }
          role="button"
          tabindex="0"
          aria-expanded=${is_open}
        >
          <td
            class="epic-header__cell epic-header__cell--id"
            data-testid=${`epic-header-id-${id}`}
          >
            ${createIssueIdRenderer(id, { class_name: 'mono' })}
          </td>
          <td
            class="epic-header__cell epic-header__cell--name"
            data-testid=${`epic-header-name-${id}`}
          >
            ${is_open
              ? html`<svg class="epic-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>`
              : html`<svg class="epic-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>`}
            <span class="text-truncate">${epic.title || '(no title)'}</span>
          </td>
          <td
            class="epic-header__cell epic-header__cell--status"
            data-testid=${`epic-header-status-${id}`}
          >
            <span class="status-badge is-${status}">${status_text}</span>
          </td>
          <td
            class="epic-header__meta"
            data-testid=${`epic-header-progress-${id}`}
          >
            <span class="epic-progress">
              <progress
                value=${Number(group.closed_children || 0)}
                max=${Math.max(1, Number(group.total_children || 0))}
              ></progress>
              <span class="muted mono"
                >${group.closed_children}/${group.total_children}</span
              >
            </span>
          </td>
        </tr>
        ${is_open
          ? html`<tr
              class="epic-children-row"
              data-testid=${`epic-children-row-${id}`}
            >
              <td
                class="epic-children"
                colspan="4"
                data-testid=${`epic-children-${id}`}
              >
                ${is_loading
                  ? html`<div class="muted">Loading…</div>`
                  : list.length === 0
                    ? html`<div class="muted">No issues found</div>`
                    : html`<table
                        class="table"
                        data-testid=${`epic-children-table-${id}`}
                      >
                        <colgroup>
                          <col style="width: 100px" />
                          <col style="width: 120px" />
                          <col />
                          <col style="width: 120px" />
                          <col style="width: 160px" />
                          <col style="width: 130px" />
                        </colgroup>
                        <thead
                          testid="epic-children-header"
                          data-testid=${`epic-children-header-${id}`}
                        >
                          <tr>
                            <th data-testid="epic-children-header-id">${childSortHeaderTemplate('id', 'ID')}</th>
                            <th data-testid="epic-children-header-type">${childSortHeaderTemplate('type', 'Type')}</th>
                            <th data-testid="epic-children-header-title">${childSortHeaderTemplate('title', 'Title')}</th>
                            <th data-testid="epic-children-header-status">${childSortHeaderTemplate('status', 'Status')}</th>
                            <th data-testid="epic-children-header-assignee">${childSortHeaderTemplate('assignee', 'Assignee')}</th>
                            <th data-testid="epic-children-header-priority">${childSortHeaderTemplate('priority', 'Priority')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${sorted_list.map((item) => render_row(item))}
                        </tbody>
                      </table>`}
              </td>
            </tr>`
          : null}
      </tbody>
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
   * @param {'id'|'type'|'title'|'status'|'assignee'|'priority'} column
   */
  function toggleChildSort(column) {
    if (child_sort_column === column) {
      child_sort_direction = child_sort_direction === 'asc' ? 'desc' : 'asc';
    } else {
      child_sort_column = column;
      child_sort_direction = 'asc';
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
   * @param {IssueLite[]} next_items
   */
  function getSortedChildren(next_items) {
    return next_items.slice().sort(compareChildren);
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
   * @param {IssueLite} left_item
   * @param {IssueLite} right_item
   */
  function compareChildren(left_item, right_item) {
    let result = 0;
    switch (child_sort_column) {
      case 'id':
        result = compareText(left_item?.id, right_item?.id);
        break;
      case 'type':
        result = compareText(left_item?.issue_type, right_item?.issue_type);
        break;
      case 'title':
        result = compareText(left_item?.title, right_item?.title);
        break;
      case 'status':
        result = compareStatus(left_item?.status, right_item?.status);
        break;
      case 'assignee':
        result = compareText(left_item?.assignee, right_item?.assignee);
        break;
      case 'priority':
      default:
        result = comparePriority(left_item?.priority, right_item?.priority);
        break;
    }
    if (result === 0 && child_sort_column !== 'priority') {
      result = comparePriority(left_item?.priority, right_item?.priority);
    }
    if (result === 0) {
      result = compareCreated(left_item?.created_at, right_item?.created_at);
    }
    if (result === 0) {
      result = compareText(left_item?.id, right_item?.id);
    }
    return child_sort_direction === 'asc' ? result : result * -1;
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
   * @param {number | undefined} left
   * @param {number | undefined} right
   */
  function comparePriority(left, right) {
    return normalizePriority(left) - normalizePriority(right);
  }

  /**
   * @param {string | number | undefined} left
   * @param {string | number | undefined} right
   */
  function compareCreated(left, right) {
    return normalizeTimestamp(left) - normalizeTimestamp(right);
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
   * @param {number | undefined} value
   */
  function normalizePriority(value) {
    return Number.isFinite(value) ? Number(value) : Number.MAX_SAFE_INTEGER;
  }

  /**
   * @param {string | number | undefined} value
   */
  function normalizeTimestamp(value) {
    const parsed =
      typeof value === 'number' ? value : Date.parse(String(value || ''));
    return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
  }

  /**
   * @param {string} id
   * @param {{ [k: string]: any }} patch
   */
  async function updateInline(id, patch) {
    try {
      await data.updateIssue({ id, ...patch });
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
      if (subscriptions && typeof subscriptions.subscribeList === 'function') {
        try {
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
      loading.delete(epic_id);
    } else {
      expanded.delete(epic_id);
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
      try {
        if (groups.length > 0) {
          const first_id = String(getSortedGroups(groups)[0]?.epic?.id || '');
          if (first_id && !expanded.has(first_id)) {
            await toggle(first_id);
          }
        }
      } catch {
        // ignore auto-expand failures
      }
    }
  };
}
