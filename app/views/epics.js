import { html, render } from 'lit-html';
import { createListSelectors } from '../data/list-selectors.js';
import { createIssueIdRenderer } from '../utils/issue-id-renderer.js';
import { createIssueRowRenderer } from './issue-row.js';

/**
 * @typedef {{ id: string, title?: string, status?: string, priority?: number, issue_type?: string, assignee?: string, updated_at?: number }} IssueLite
 */

/**
 * Epics view (push-only):
 * - Derives epic groups from the local issues store (no RPC reads)
 * - Subscribes to `tab:epics` for top-level membership and per-epic children
 * - Renders children from per-subscription store snapshots for `epic:{id}`
 * - Provides inline edits via mutations; UI re-renders on push
 * @param {HTMLElement} mount_element
 * @param {{ getIssue: (id: string) => Promise<any>, updateIssue: (input: any) => Promise<any> }} data
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
  /** @type {Map<string, () => Promise<void>>} */
  const epic_unsubs = new Map();
  // Centralized selection helpers
  const selectors = issue_stores ? createListSelectors(issue_stores) : null;
  // Live re-render on pushes
  if (selectors) {
    selectors.subscribe(() => {
      doRender();
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

  function template() {
    if (!groups.length) {
      return html`<div class="panel__header muted">No epics found.</div>`;
    }
    return html`${groups.map((g) => groupTemplate(g))}`;
  }

  /**
   * @param {any} g
   */
  function groupTemplate(g) {
    const epic = g.epic || {};
    const id = String(epic.id || '');
    const is_open = expanded.has(id);
    // Compose children via selectors; then filter out closed locally
    let list = selectors ? selectors.selectEpicChildren(id) : [];
    list = list.filter((it) => String(it.status || '') !== 'closed');
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
                  ? html`<div class="muted">No open issues</div>`
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
      // Subscribe to issues-for-epic deltas for this epic (best-effort)
      if (subscriptions && typeof subscriptions.subscribeList === 'function') {
        try {
          const u = await subscriptions.subscribeList(`epic:${epic_id}`, {
            type: 'issues-for-epic',
            params: { epic_id: epic_id }
          });
          epic_unsubs.set(epic_id, u);
          // Register mapping for per-subscription store snapshots if available
          try {
            if (issue_stores && /** @type {any} */ (issue_stores).register) {
              /** @type {any} */ (issue_stores).register(`epic:${epic_id}`, {
                type: 'issues-for-epic',
                params: { epic_id: epic_id }
              });
            }
          } catch {
            // ignore
          }
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
            /** @type {any} */ (issue_stores).unregister(`epic:${epic_id}`);
          }
        } catch {
          // ignore
        }
      }
    }
    doRender();
  }

  return {
    async load() {
      // Compose groups from per-subscription store snapshot for `tab:epics`
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
        const total = dependents.length;
        let closed = 0;
        for (const d of dependents) {
          if (String(d.status || '') === 'closed') {
            closed++;
          }
        }
        next_groups.push({
          epic,
          total_children: total,
          closed_children: closed
        });
      }

      groups = next_groups;
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
