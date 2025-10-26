import { html, render } from 'lit-html';
import { createListSelectors } from '../data/list-selectors.js';
import { createIssueIdRenderer } from '../utils/issue-id-renderer.js';
import { createIssueRowRenderer } from './issue-row.js';

/**
 * @typedef {{ id: string, title?: string, status?: string, priority?: number, issue_type?: string, assignee?: string, updated_at?: string }} IssueLite
 */

/**
 * Epics view (push-only):
 * - Derives epic groups from the local issues store (no RPC reads)
 * - Subscribes to `tab:epics` for top-level membership and per-epic children
 * - Renders children from `issuesStore.getMany(ids)` via `subscriptions.selectors.getIds()`
 * - Provides inline edits via mutations; UI re-renders on push
 * @param {HTMLElement} mount_element
 * @param {{ getIssue: (id: string) => Promise<any>, updateIssue: (input: any) => Promise<any> }} data
 * @param {(id: string) => void} goto_issue - Navigate to issue detail.
 * @param {{ subscribe: (fn: () => void) => () => void, getMany: (ids: string[]) => any[], getAll: () => any[], getById: (id: string) => any|null }} [issuesStore]
 * @param {{ subscribeList?: (client_id: string, spec: { type: string, params?: Record<string, string|number|boolean> }) => Promise<() => Promise<void>>, selectors?: { getIds: (client_id: string) => string[], count?: (client_id: string) => number } }} [subscriptions]
 */
export function createEpicsView(
  mount_element,
  data,
  goto_issue,
  issuesStore = undefined,
  subscriptions = undefined
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
  const selectors =
    subscriptions && issuesStore
      ? createListSelectors(
          /** @type {{ selectors: { getIds: (client_id: string) => string[] } }} */ (
            subscriptions
          ),
          issuesStore
        )
      : null;
  // Live re-render on pushes
  if (selectors) {
    selectors.subscribe(() => {
      doRender();
    });
  } else if (issuesStore && typeof issuesStore.subscribe === 'function') {
    issuesStore.subscribe(() => {
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
    /** @type {IssueLite[]} */
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
      }
    }
    doRender();
  }

  return {
    async load() {
      /**
       * Preferred: fetch epic status via RPC (`bd epic status --json`).
       * Fallback: derive groups from local store + subscriptions when RPC
       * isn't available (e.g., during tests with minimal data layer).
       */
      /** @type {any[]} */
      let next_groups = [];
      let used_rpc = false;
      try {
        if (
          data &&
          typeof (/** @type {any} */ (data).getEpicStatus) === 'function'
        ) {
          /** @type {unknown} */
          const res = await /** @type {any} */ (data).getEpicStatus();
          if (Array.isArray(res)) {
            // Expect objects like { epic: { id, title, ... }, total_children, closed_children }
            next_groups = res
              .map((g) => (g && typeof g === 'object' ? g : null))
              .filter(Boolean);
            used_rpc = true;
          }
        }
      } catch {
        // ignore RPC errors and fall back
      }

      if (!used_rpc) {
        // Derive groups from local issues store
        /** @type {any[]} */
        const derived = [];
        if (issuesStore) {
          /** @type {string[]} */
          let epic_ids = [];
          if (subscriptions && subscriptions.selectors) {
            try {
              epic_ids = subscriptions.selectors.getIds('tab:epics');
            } catch {
              epic_ids = [];
            }
          }
          if (epic_ids.length === 0) {
            // Fallback: derive from all issues
            const all = issuesStore.getAll();
            epic_ids = all
              .filter((it) => String(it.issue_type || '') === 'epic')
              .map((it) => String(it.id || ''))
              .filter((id) => !!id);
          }
          for (const id of epic_ids) {
            const epic = issuesStore.getById(id);
            if (!epic) {
              continue;
            }
            const dependents = Array.isArray(epic.dependents)
              ? epic.dependents
              : [];
            const total = dependents.length;
            let closed = 0;
            for (const d of dependents) {
              if (String(d.status || '') === 'closed') {
                closed++;
              }
            }
            derived.push({
              epic,
              total_children: total,
              closed_children: closed
            });
          }
        }
        next_groups = derived;
      }

      groups = next_groups;
      doRender();
      // Auto-expand first epic on screen
      try {
        if (groups.length > 0) {
          const first_id = String((groups[0].epic && groups[0].epic.id) || '');
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
