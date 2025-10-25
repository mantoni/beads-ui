import { html, render } from 'lit-html';
import { createIssueIdRenderer } from '../utils/issue-id-renderer.js';
import { createIssueRowRenderer } from './issue-row.js';

/**
 * @typedef {{ id: string, title?: string, status?: string, priority?: number, issue_type?: string, assignee?: string, updated_at?: string }} IssueLite
 */

/**
 * Epics view: grouped table using `bd epic status --json`. Expanding a group loads
 * the epic via `getIssue(id)` and then loads each dependent issue to filter out
 * closed items. Provides inline editing for type, title, priority, status, assignee.
 * @param {HTMLElement} mount_element
 * @param {{ getEpicStatus: () => Promise<any[]>, getIssue: (id: string) => Promise<any>, updateIssue: (input: any) => Promise<any> }} data
 * @param {(id: string) => void} goto_issue - Navigate to issue detail.
 */
/**
 * @param {HTMLElement} mount_element
 * @param {{ getEpicStatus: () => Promise<any[]>, getIssue: (id: string) => Promise<any>, updateIssue: (input: any) => Promise<any> }} data
 * @param {(id: string) => void} goto_issue
 * @param {{ subscribeList?: (client_id: string, spec: { type: string, params?: Record<string, string|number|boolean> }) => Promise<() => Promise<void>> }} [subscriptions]
 */
export function createEpicsView(
  mount_element,
  data,
  goto_issue,
  subscriptions
) {
  /** @type {any[]} */
  let groups = [];
  /** @type {Set<string>} */
  const expanded = new Set();
  /** @type {Map<string, IssueLite[]>} */
  const children = new Map();
  /** @type {Set<string>} */
  const loading = new Set();
  /** @type {Map<string, () => Promise<void>>} */
  const epic_unsubs = new Map();

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
    const list = children.get(id) || [];
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
      // Opportunistic refresh for that row
      const full = await data.getIssue(id);
      /** @type {IssueLite} */
      const lite = {
        id: full.id,
        title: full.title,
        status: full.status,
        priority: full.priority,
        issue_type: full.issue_type,
        assignee: full.assignee
      };
      // Replace in children map
      for (const arr of children.values()) {
        const idx = arr.findIndex((x) => x.id === id);
        if (idx >= 0) {
          arr[idx] = lite;
        }
      }
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
      // Load children if not present
      if (!children.has(epic_id)) {
        loading.add(epic_id);
        doRender();
        // Subscribe to issues-for-epic deltas for this epic (best-effort)
        if (
          subscriptions &&
          typeof subscriptions.subscribeList === 'function'
        ) {
          try {
            const u = await subscriptions.subscribeList(`epic:${epic_id}`, {
              type: 'issues-for-epic',
              params: { epic: epic_id }
            });
            epic_unsubs.set(epic_id, u);
          } catch {
            // ignore subscription failures
          }
        }
        try {
          const epic = await data.getIssue(epic_id);
          // Children for the Epics view come from dependents: issues that list
          // the epic as a dependency. This matches how progress is tracked.
          /** @type {{ id: string }[]} */
          const deps = Array.isArray(epic.dependents) ? epic.dependents : [];
          /** @type {IssueLite[]} */
          const list = [];
          for (const d of deps) {
            try {
              const full = await data.getIssue(d.id);
              if (full.status !== 'closed') {
                list.push({
                  id: full.id,
                  title: full.title,
                  status: full.status,
                  priority: full.priority,
                  issue_type: full.issue_type,
                  assignee: full.assignee,
                  // include updated_at for secondary sort within same priority
                  updated_at: /** @type {any} */ (full).updated_at
                });
              }
            } catch {
              // ignore individual failures
            }
          }
          // Sort by priority then updated_at (if present)
          list.sort((a, b) => {
            const pa = a.priority ?? 2;
            const pb = b.priority ?? 2;
            if (pa !== pb) {
              return pa - pb;
            }
            // @ts-ignore optional updated_at if present
            const ua = a.updated_at || '';
            // @ts-ignore
            const ub = b.updated_at || '';
            return ua < ub ? 1 : ua > ub ? -1 : 0;
          });
          children.set(epic_id, list);
        } finally {
          loading.delete(epic_id);
        }
      }
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
      const res = await data.getEpicStatus();
      groups = Array.isArray(res) ? res : [];
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
