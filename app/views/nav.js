import { html, render } from 'lit-html';
import { debug } from '../utils/logging.js';

/**
 * Render the top navigation with three tabs and handle route changes.
 *
 * @param {HTMLElement} mount_element
 * @param {{ getState: () => any, subscribe: (fn: (s: any) => void) => () => void }} store
 * @param {{ gotoView: (v: 'issues'|'epics'|'board') => void }} router
 * @param {{ fetchFn?: typeof fetch, reloadFn?: () => void }} [options]
 */
export function createTopNav(mount_element, store, router, options = {}) {
  const log = debug('views:nav');
  /** @type {(() => void) | null} */
  let unsubscribe = null;

  const fetch_fn =
    options.fetchFn ||
    (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  const reload_fn =
    options.reloadFn ||
    (() => {
      try {
        window.location.reload();
      } catch {
        // ignore
      }
    });

  /** @type {HTMLDialogElement | null} */
  let workspace_dialog = null;
  /** @type {string} */
  let workspace_root_dir = '';

  /** @type {string} */
  let browse_path = '';
  /** @type {string | null} */
  let browse_parent = null;
  /** @type {Array<{ name: string, path: string, has_beads: boolean }>} */
  let browse_entries = [];
  /** @type {boolean} */
  let browse_loading = false;
  /** @type {string} */
  let browse_error = '';
  /** @type {boolean} */
  let switching = false;

  /**
   * @param {'issues'|'epics'|'board'} view
   * @returns {(ev: MouseEvent) => void}
   */
  function onClick(view) {
    return (ev) => {
      ev.preventDefault();
      log('click tab %s', view);
      router.gotoView(view);
    };
  }

  async function loadWorkspaceRootDir() {
    if (!fetch_fn) {
      return;
    }
    try {
      const res = await fetch_fn('/api/workspace');
      if (!res.ok) {
        return;
      }
      const json = await res.json();
      const root =
        json && typeof json.root_dir === 'string' ? json.root_dir : '';
      if (root.length > 0) {
        workspace_root_dir = root;
        doRender();
      }
    } catch {
      // ignore
    }
  }

  /**
   * @param {string} next_path
   */
  async function loadBrowse(next_path) {
    if (!fetch_fn) {
      browse_error = 'Directory browsing is not available.';
      doRender();
      return;
    }
    browse_loading = true;
    browse_error = '';
    doRender();
    try {
      const url = `/api/browse?path=${encodeURIComponent(next_path)}`;
      const res = await fetch_fn(url);
      const json = await res.json();
      if (!res.ok || !json || json.ok !== true) {
        browse_error =
          (json && typeof json.error === 'string' && json.error) ||
          'Failed to browse directory.';
        return;
      }
      browse_path = typeof json.path === 'string' ? json.path : next_path;
      browse_parent = typeof json.parent === 'string' ? json.parent : null;
      browse_entries = Array.isArray(json.entries) ? json.entries : [];
    } catch (err) {
      browse_error =
        (err && /** @type {any} */ (err).message) ||
        'Failed to browse directory.';
    } finally {
      browse_loading = false;
      doRender();
    }
  }

  function ensureWorkspaceDialog() {
    if (workspace_dialog) {
      return workspace_dialog;
    }
    workspace_dialog = document.createElement('dialog');
    workspace_dialog.id = 'workspace-dialog';
    workspace_dialog.setAttribute('role', 'dialog');
    document.body.appendChild(workspace_dialog);
    return workspace_dialog;
  }

  function openWorkspaceDialog() {
    const d = ensureWorkspaceDialog();
    browse_path = workspace_root_dir || browse_path || '.';
    void loadBrowse(browse_path);
    try {
      d.showModal();
    } catch {
      // ignore
    }
    doRender();
  }

  function closeWorkspaceDialog() {
    if (!workspace_dialog) {
      return;
    }
    switching = false;
    browse_loading = false;
    browse_error = '';
    try {
      workspace_dialog.close();
    } catch {
      // ignore
    }
    doRender();
  }

  async function selectWorkspaceDir() {
    if (!fetch_fn) {
      return;
    }
    switching = true;
    browse_error = '';
    doRender();
    try {
      const res = await fetch_fn('/api/workspace', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ root_dir: browse_path })
      });
      const json = await res.json();
      if (!res.ok || !json || json.ok !== true) {
        browse_error =
          (json && typeof json.error === 'string' && json.error) ||
          'Failed to switch workspace.';
        switching = false;
        doRender();
        return;
      }
      workspace_root_dir =
        typeof json.root_dir === 'string' ? json.root_dir : browse_path;
      try {
        closeWorkspaceDialog();
      } catch {
        // ignore
      }
      reload_fn();
    } catch (err) {
      browse_error =
        (err && /** @type {any} */ (err).message) ||
        'Failed to switch workspace.';
      switching = false;
      doRender();
    }
  }

  function template() {
    const s = store.getState();
    const active = s.view || 'issues';
    return html`
      <button
        type="button"
        class="workspace-button"
        aria-haspopup="dialog"
        title="Switch project"
        @click=${openWorkspaceDialog}
      >
        ${workspace_root_dir
          ? `Project: ${workspace_root_dir}`
          : 'Select project…'}
      </button>
      <a
        href="#/issues"
        class="tab ${active === 'issues' ? 'active' : ''}"
        @click=${onClick('issues')}
        >Issues</a
      >
      <a
        href="#/epics"
        class="tab ${active === 'epics' ? 'active' : ''}"
        @click=${onClick('epics')}
        >Epics</a
      >
      <a
        href="#/board"
        class="tab ${active === 'board' ? 'active' : ''}"
        @click=${onClick('board')}
        >Board</a
      >
    `;
  }

  function dialogTemplate() {
    return html`
      <div class="workspace-dialog__header">
        <div class="workspace-dialog__title">Switch project</div>
        <button
          type="button"
          class="workspace-dialog__close"
          aria-label="Close"
          @click=${closeWorkspaceDialog}
        >
          ✕
        </button>
      </div>
      <div class="workspace-dialog__body">
        <div class="workspace-browser__path">
          <button
            type="button"
            class="btn"
            ?disabled=${browse_loading || !browse_parent}
            @click=${() => {
              if (browse_parent) {
                void loadBrowse(browse_parent);
              }
            }}
          >
            Up
          </button>
          <input
            class="workspace-browser__input"
            type="text"
            spellcheck="false"
            .value=${browse_path}
            @input=${
              /** @param {InputEvent} ev */ (ev) => {
                browse_path = /** @type {HTMLInputElement} */ (ev.target).value;
              }
            }
            @keydown=${
              /** @param {KeyboardEvent} ev */ (ev) => {
                if (ev.key === 'Enter') {
                  ev.preventDefault();
                  void loadBrowse(browse_path);
                }
              }
            }
          />
          <button
            type="button"
            class="btn"
            ?disabled=${browse_loading}
            @click=${() => void loadBrowse(browse_path)}
          >
            Go
          </button>
        </div>

        ${browse_error
          ? html`<div class="workspace-browser__error">${browse_error}</div>`
          : null}

        <div class="workspace-browser__list" role="list">
          ${browse_loading
            ? html`<div class="workspace-browser__loading">Loading…</div>`
            : null}
          ${browse_parent && !browse_loading
            ? html`
                <button
                  type="button"
                  class="workspace-browser__row"
                  @click=${() => void loadBrowse(browse_parent || '')}
                >
                  <span class="name">..</span>
                  <span class="hint">parent</span>
                </button>
              `
            : null}
          ${!browse_loading
            ? browse_entries.map((e) => {
                const hint = e && e.has_beads ? '.beads' : '';
                return html`
                  <button
                    type="button"
                    class="workspace-browser__row"
                    @click=${() => void loadBrowse(String(e.path || ''))}
                  >
                    <span class="name">${e.name}</span>
                    <span class="hint">${hint}</span>
                  </button>
                `;
              })
            : null}
        </div>
      </div>
      <div class="workspace-dialog__footer">
        <button type="button" class="btn" @click=${closeWorkspaceDialog}>
          Cancel
        </button>
        <button
          type="button"
          class="btn primary"
          ?disabled=${browse_loading || switching || browse_path.length === 0}
          @click=${selectWorkspaceDir}
        >
          ${switching ? 'Selecting…' : 'Select'}
        </button>
      </div>
    `;
  }

  function doRender() {
    render(template(), mount_element);
    if (workspace_dialog) {
      render(dialogTemplate(), workspace_dialog);
    }
  }

  doRender();
  unsubscribe = store.subscribe(() => doRender());
  void loadWorkspaceRootDir();

  return {
    destroy() {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      if (workspace_dialog) {
        try {
          workspace_dialog.close();
        } catch {
          // ignore
        }
        try {
          workspace_dialog.remove();
        } catch {
          // ignore
        }
        workspace_dialog = null;
      }
      render(html``, mount_element);
    }
  };
}
