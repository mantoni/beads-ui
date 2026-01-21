import { html, render } from 'lit-html';
import { createListSelectors } from '../data/list-selectors.js';
import { createIssueIdRenderer } from '../utils/issue-id-renderer.js';
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
  /** @type {Set<string>} */
  const expanded = new Set();
  /** @type {Set<string>} */
  const loading = new Set();
  /** Whether to show closed epics */
  let show_closed = false;
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
        const first_id = String(groups[0].epic?.id || '');
        if (first_id && !expanded.has(first_id)) {
          void toggle(first_id);
        }
      }
    });
  }

  // Shared row renderer used for children rows
  const renderRow = createIssueRowRenderer({
    navigate: (id) => goto_issue(id),
    onUpdate: updateInline,
    requestRender: doRender,
    getSelectedId: () => null,
    row_class: 'epic-row'
  });

  function doRender() {
    render(template(), mount_element);
  }

  /**
   * Check if an epic has the 'backlog' label.
   * @param {any} epic
   */
  function isBacklogged(epic) {
    const labels = Array.isArray(epic?.labels) ? epic.labels : [];
    return labels.includes('backlog');
  }

  /**
   * Check if an epic is closed.
   * @param {any} epic
   */
  function isClosed(epic) {
    return String(epic?.status || '').toLowerCase() === 'closed';
  }

  /**
   * Toggle show_closed state.
   */
  function toggleShowClosed() {
    show_closed = !show_closed;
    doRender();
  }

  /**
   * Find the parent epic ID for a given epic.
   * Uses explicit parent field first, then falls back to ID pattern detection.
   * @param {any} epic - The epic object
   * @param {Set<string>} all_epic_ids - Set of all epic IDs in the current view
   * @returns {string | null}
   */
  function findParentEpicId(epic, all_epic_ids) {
    // First, check for explicit parent field from bd show
    const explicit_parent = epic?.parent;
    if (explicit_parent && typeof explicit_parent === 'string' && all_epic_ids.has(explicit_parent)) {
      return explicit_parent;
    }
    // Fall back to ID pattern detection (e.g., "si-oqo.2" -> "si-oqo")
    const id = String(epic?.id || '');
    const last_dot = id.lastIndexOf('.');
    if (last_dot === -1) {
      return null;
    }
    const potential_parent = id.substring(0, last_dot);
    if (all_epic_ids.has(potential_parent)) {
      return potential_parent;
    }
    return null;
  }

  /**
   * Build hierarchical tree from flat groups.
   * @param {any[]} flat_groups
   * @returns {any[]} - Array of { group, children: [...] }
   */
  function buildHierarchy(flat_groups) {
    const all_epic_ids = new Set(flat_groups.map((g) => String(g.epic?.id || '')));
    /** @type {Map<string, any>} */
    const group_map = new Map();
    for (const g of flat_groups) {
      const id = String(g.epic?.id || '');
      group_map.set(id, { group: g, children: [] });
    }

    /** @type {any[]} */
    const roots = [];
    for (const g of flat_groups) {
      const id = String(g.epic?.id || '');
      const parent_id = findParentEpicId(g.epic, all_epic_ids);
      const node = group_map.get(id);
      if (parent_id && group_map.has(parent_id)) {
        group_map.get(parent_id).children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  /**
   * Render a hierarchy node (epic + its child epics).
   * @param {any} node - { group, children }
   * @param {boolean} is_child - Whether this is a child epic
   */
  function hierarchyTemplate(node, is_child = false) {
    const { group, children } = node;
    const has_children = children.length > 0;
    return html`
      <div class="epic-hierarchy ${is_child ? 'epic-hierarchy--child' : ''}">
        ${groupTemplate(group)}
        ${has_children
          ? html`<div class="epic-hierarchy__children">
              ${children.map((c) => hierarchyTemplate(c, true))}
            </div>`
          : null}
      </div>
    `;
  }

  function template() {
    if (!groups.length) {
      return html`<div class="panel__header muted">No epics found.</div>`;
    }
    // Filter closed epics unless show_closed is true
    const visible_groups = show_closed
      ? groups
      : groups.filter((g) => !isClosed(g.epic));
    const active_groups = visible_groups.filter((g) => !isBacklogged(g.epic));
    const backlog_groups = visible_groups.filter((g) => isBacklogged(g.epic));
    const active_hierarchy = buildHierarchy(active_groups);
    const backlog_hierarchy = buildHierarchy(backlog_groups);

    // Count closed epics for display
    const closed_count = groups.filter((g) => isClosed(g.epic)).length;

    return html`
      ${active_hierarchy.length > 0 || closed_count > 0
        ? html`
            <div class="epics-section">
              <h2 class="epics-section__header">
                <span>Active Epics</span>
                ${closed_count > 0
                  ? html`<label class="epics-filter">
                      <input
                        type="checkbox"
                        .checked=${show_closed}
                        @change=${() => toggleShowClosed()}
                      />
                      <span>Show closed (${closed_count})</span>
                    </label>`
                  : null}
              </h2>
              ${active_hierarchy.length > 0
                ? active_hierarchy.map((node) => hierarchyTemplate(node))
                : html`<div class="muted" style="margin: 12px;">No open epics</div>`}
            </div>
          `
        : null}
      ${backlog_hierarchy.length > 0
        ? html`
            <div class="epics-section epics-section--backlog">
              <h2 class="epics-section__header">Backlog</h2>
              ${backlog_hierarchy.map((node) => hierarchyTemplate(node))}
            </div>
          `
        : null}
    `;
  }

  /**
   * @param {any} g
   */
  function groupTemplate(g) {
    const epic = g.epic || {};
    const id = String(epic.id || '');
    const is_open = expanded.has(id);
    // Compose children via selectors
    const list = selectors ? selectors.selectEpicChildren(id) : [];
    const is_loading = loading.has(id);
    return html`
      <div class="epic-group" data-epic-id=${id}>
        <div
          class="epic-header"
          @click=${() => toggle(id)}
          role="button"
          tabindex="0"
          aria-expanded=${is_open}
        >
          ${createIssueIdRenderer(id, { class_name: 'mono' })}
          <span class="text-truncate" style="margin-left:8px"
            >${epic.title || '(no title)'}</span
          >
          <span
            class="epic-progress"
            style="margin-left:auto; display:flex; align-items:center; gap:8px;"
          >
            <progress
              value=${Number(g.closed_children || 0)}
              max=${Math.max(1, Number(g.total_children || 0))}
            ></progress>
            <span class="muted mono"
              >${g.closed_children}/${g.total_children}</span
            >
          </span>
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
                        ${list.map((it) => renderRow(it))}
                      </tbody>
                    </table>`}
            </div>`
          : null}
      </div>
    `;
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
          const u = await subscriptions.subscribeList(`detail:${epic_id}`, {
            type: 'issue-detail',
            params: { id: epic_id }
          });
          epic_unsubs.set(epic_id, u);
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
          const u = epic_unsubs.get(epic_id);
          if (u) {
            await u();
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
        for (const d of dependents) {
          if (String(d.status || '') === 'closed') {
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
          const first_id = String(groups[0].epic?.id || '');
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
