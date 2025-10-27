/**
 * @import { MessageType } from './protocol.js'
 */
import { html, render } from 'lit-html';
import { createListSelectors } from './data/list-selectors.js';
import { createDataLayer } from './data/providers.js';
import { createSubscriptionIssueStores } from './data/subscription-issue-stores.js';
import { createSubscriptionStore } from './data/subscriptions-store.js';
import { createHashRouter, parseHash } from './router.js';
import { createStore } from './state.js';
import { showToast } from './utils/toast.js';
import { createBoardView } from './views/board.js';
import { createDetailView } from './views/detail.js';
import { createEpicsView } from './views/epics.js';
import { createIssueDialog } from './views/issue-dialog.js';
import { createListView } from './views/list.js';
import { createTopNav } from './views/nav.js';
import { createNewIssueDialog } from './views/new-issue-dialog.js';
import { createWsClient } from './ws.js';

/**
 * Bootstrap the SPA shell with two panels.
 *
 * @param {HTMLElement} root_element - The container element to render into.
 */
export function bootstrap(root_element) {
  // Render route shells (nav is mounted in header)
  const shell = html`
    <section id="issues-root" class="route issues">
      <aside id="list-panel" class="panel"></aside>
    </section>
    <section id="epics-root" class="route epics" hidden></section>
    <section id="board-root" class="route board" hidden></section>
    <section id="detail-panel" class="route detail" hidden></section>
  `;
  render(shell, root_element);

  /** @type {HTMLElement|null} */
  const nav_mount = document.getElementById('top-nav');
  /** @type {HTMLElement|null} */
  const issues_root = document.getElementById('issues-root');
  /** @type {HTMLElement|null} */
  const epics_root = document.getElementById('epics-root');
  /** @type {HTMLElement|null} */
  const board_root = document.getElementById('board-root');

  /** @type {HTMLElement|null} */
  const list_mount = document.getElementById('list-panel');
  /** @type {HTMLElement|null} */
  const detail_mount = document.getElementById('detail-panel');
  if (list_mount && issues_root && epics_root && board_root && detail_mount) {
    const client = createWsClient();
    // Subscriptions: wire client events and expose subscribe/unsubscribe helpers
    const subscriptions = createSubscriptionStore((type, payload) =>
      client.send(type, payload)
    );
    // Per-subscription stores (source of truth)
    const sub_issue_stores = createSubscriptionIssueStores();
    // Route per-subscription push envelopes to the owning store
    client.on('snapshot', (payload) => {
      const p = /** @type {any} */ (payload);
      const id = p && typeof p.id === 'string' ? p.id : '';
      const store = id ? sub_issue_stores.getStore(id) : null;
      if (store && p && p.type === 'snapshot') {
        try {
          store.applyPush(p);
        } catch {
          // ignore
        }
      }
    });
    client.on('upsert', (payload) => {
      const p = /** @type {any} */ (payload);
      const id = p && typeof p.id === 'string' ? p.id : '';
      const store = id ? sub_issue_stores.getStore(id) : null;
      if (store && p && p.type === 'upsert') {
        try {
          store.applyPush(p);
        } catch {
          // ignore
        }
      }
    });
    client.on('delete', (payload) => {
      const p = /** @type {any} */ (payload);
      const id = p && typeof p.id === 'string' ? p.id : '';
      const store = id ? sub_issue_stores.getStore(id) : null;
      if (store && p && p.type === 'delete') {
        try {
          store.applyPush(p);
        } catch {
          // ignore
        }
      }
    });
    // Derived list selectors: render from per-subscription snapshots
    const listSelectors = createListSelectors(sub_issue_stores);
    // Show toasts for WebSocket connectivity changes
    /** @type {boolean} */
    let had_disconnect = false;
    if (typeof client.onConnection === 'function') {
      /** @type {(s: 'connecting'|'open'|'closed'|'reconnecting') => void} */
      const onConn = (s) => {
        if (s === 'reconnecting' || s === 'closed') {
          had_disconnect = true;
          showToast('Connection lost. Reconnecting…', 'error', 4000);
        } else if (s === 'open' && had_disconnect) {
          had_disconnect = false;
          showToast('Reconnected', 'success', 2200);
        }
      };
      client.onConnection(onConn);
    }
    // Load persisted filters (status/search/type) from localStorage
    /** @type {{ status: 'all'|'open'|'in_progress'|'closed'|'ready', search: string, type: string }} */
    let persisted_filters = { status: 'all', search: '', type: '' };
    try {
      const raw = window.localStorage.getItem('beads-ui.filters');
      if (raw) {
        const obj = JSON.parse(raw);
        if (obj && typeof obj === 'object') {
          const ALLOWED = ['bug', 'feature', 'task', 'epic', 'chore'];
          let parsed_type = '';
          if (typeof obj.type === 'string' && ALLOWED.includes(obj.type)) {
            parsed_type = obj.type;
          } else if (Array.isArray(obj.types)) {
            // Backwards compatibility: pick first valid from previous array format
            let first_valid = '';
            for (const it of obj.types) {
              if (ALLOWED.includes(String(it))) {
                first_valid = /** @type {string} */ (it);
                break;
              }
            }
            parsed_type = first_valid;
          }
          persisted_filters = {
            status: ['all', 'open', 'in_progress', 'closed', 'ready'].includes(
              obj.status
            )
              ? obj.status
              : 'all',
            search: typeof obj.search === 'string' ? obj.search : '',
            type: parsed_type
          };
        }
      }
    } catch {
      // ignore parse errors
    }
    // Load last-view from storage
    /** @type {'issues'|'epics'|'board'} */
    let last_view = 'issues';
    try {
      const raw_view = window.localStorage.getItem('beads-ui.view');
      if (
        raw_view === 'issues' ||
        raw_view === 'epics' ||
        raw_view === 'board'
      ) {
        last_view = raw_view;
      }
    } catch {
      // ignore
    }
    // Load board preferences
    /** @type {{ closed_filter: 'today'|'3'|'7' }} */
    let persistedBoard = { closed_filter: 'today' };
    try {
      const raw_board = window.localStorage.getItem('beads-ui.board');
      if (raw_board) {
        const obj = JSON.parse(raw_board);
        if (obj && typeof obj === 'object') {
          const cf = String(obj.closed_filter || 'today');
          if (cf === 'today' || cf === '3' || cf === '7') {
            persistedBoard.closed_filter = cf;
          }
        }
      }
    } catch {
      // ignore parse errors
    }

    const store = createStore({
      filters: persisted_filters,
      view: last_view,
      board: persistedBoard
    });
    const router = createHashRouter(store);
    router.start();
    /**
     * @param {string} type
     * @param {unknown} payload
     */
    const transport = async (type, payload) => {
      try {
        return await client.send(/** @type {MessageType} */ (type), payload);
      } catch {
        return [];
      }
    };
    // Top navigation (optional mount)
    if (nav_mount) {
      createTopNav(nav_mount, store, router);
    }

    // Global New Issue dialog (UI-106) mounted at root so it is always visible
    const new_issue_dialog = createNewIssueDialog(
      root_element,
      (type, payload) => client.send(type, payload),
      router,
      store
    );
    // Header button
    try {
      const btn_new = /** @type {HTMLButtonElement|null} */ (
        document.getElementById('new-issue-btn')
      );
      if (btn_new) {
        btn_new.addEventListener('click', () => new_issue_dialog.open());
      }
    } catch {
      // ignore missing header
    }

    // Local transport shim: for list-issues, serve from local listSelectors;
    // otherwise forward to ws transport for mutations/show.
    /**
     * @param {MessageType} type
     * @param {unknown} payload
     */
    const listTransport = async (type, payload) => {
      if (type === 'list-issues') {
        try {
          return listSelectors.selectIssuesFor('tab:issues');
        } catch {
          return [];
        }
      }
      return transport(type, payload);
    };

    const issues_view = createListView(
      list_mount,
      /** @type {any} */ (listTransport),
      (hash) => {
        const id = parseHash(hash);
        if (id) {
          router.gotoIssue(id);
        }
      },
      store,
      subscriptions,
      sub_issue_stores
    );
    // Persist filter changes to localStorage
    store.subscribe((s) => {
      try {
        const data = {
          status: s.filters.status,
          search: s.filters.search,
          type: typeof s.filters.type === 'string' ? s.filters.type : ''
        };
        window.localStorage.setItem('beads-ui.filters', JSON.stringify(data));
      } catch {
        // ignore
      }
    });
    // Persist board preferences
    store.subscribe((s) => {
      try {
        window.localStorage.setItem(
          'beads-ui.board',
          JSON.stringify({ closed_filter: s.board.closed_filter })
        );
      } catch {
        // ignore
      }
    });
    void issues_view.load();

    // Dialog for issue details (UI-104)
    const dialog = createIssueDialog(detail_mount, store, () => {
      // Close: clear selection and return to current view
      const s = store.getState();
      store.setState({ selected_id: null });
      try {
        /** @type {'issues'|'epics'|'board'} */
        const v = s.view || 'issues';
        router.gotoView(v);
      } catch {
        // ignore
      }
    });

    /** @type {ReturnType<typeof createDetailView> | null} */
    let detail = null;
    // Mount details into the dialog body only
    detail = createDetailView(
      dialog.getMount(),
      transport,
      (hash) => {
        const id = parseHash(hash);
        if (id) {
          router.gotoIssue(id);
        }
      },
      sub_issue_stores
    );

    // If router already set a selected id (deep-link), open dialog now
    const initial_id = store.getState().selected_id;
    if (initial_id) {
      detail_mount.hidden = false;
      dialog.open(initial_id);
      if (detail) {
        void detail.load(initial_id);
      }
      // Ensure detail subscription is active on initial deep-link
      const client_id = `detail:${initial_id}`;
      const spec = { type: 'issue-detail', params: { id: initial_id } };
      // Register store first to avoid dropping the initial snapshot
      try {
        sub_issue_stores.register(client_id, spec);
      } catch {
        // ignore
      }
      void subscriptions.subscribeList(client_id, spec).catch(() => {});
    }

    // Open/close dialog based on selected_id (always dialog; no page variant)
    /** @type {null | (() => Promise<void>)} */
    let unsub_detail = null;
    store.subscribe((s) => {
      const id = s.selected_id;
      if (id) {
        detail_mount.hidden = false;
        dialog.open(id);
        if (detail) {
          void detail.load(id);
        }
        // Wire per-issue subscription for detail
        const client_id = `detail:${id}`;
        const spec = { type: 'issue-detail', params: { id } };
        // Ensure per-subscription issue store exists before subscribing
        try {
          sub_issue_stores.register(client_id, spec);
        } catch {
          // ignore
        }
        // Subscribe server-side
        void subscriptions
          .subscribeList(client_id, spec)
          .then((unsub) => {
            // Unsubscribe previous if any
            if (unsub_detail) {
              void unsub_detail().catch(() => {});
            }
            unsub_detail = unsub;
          })
          .catch(() => {});
      } else {
        try {
          dialog.close();
        } catch {
          // ignore
        }
        if (detail) {
          detail.clear();
        }
        detail_mount.hidden = true;
        if (unsub_detail) {
          void unsub_detail().catch(() => {});
          unsub_detail = null;
        }
      }
    });

    // Removed: issues-changed handling. All views re-render from
    // per-subscription stores which are updated by snapshot/upsert/delete.

    // Toggle route shells on view/detail change and persist
    const data = createDataLayer(transport);
    const epics_view = createEpicsView(
      epics_root,
      data,
      (id) => router.gotoIssue(id),
      subscriptions,
      sub_issue_stores
    );
    const board_view = createBoardView(
      board_root,
      data,
      (id) => router.gotoIssue(id),
      store,
      subscriptions,
      sub_issue_stores
    );
    // Preload epics when switching to view
    /**
     * @param {{ selected_id: string | null, view: 'issues'|'epics'|'board', filters: any }} s
     */
    // --- Subscriptions: tab-level management and filter-driven updates ---
    /** @type {null | (() => Promise<void>)} */
    let unsub_issues_tab = null;
    /** @type {null | (() => Promise<void>)} */
    let unsub_epics_tab = null;
    /** @type {null | (() => Promise<void>)} */
    let unsub_board_ready = null;
    /** @type {null | (() => Promise<void>)} */
    let unsub_board_in_progress = null;
    /** @type {null | (() => Promise<void>)} */
    let unsub_board_closed = null;
    /** @type {null | (() => Promise<void>)} */
    let unsub_board_blocked = null;

    /**
     * Compute subscription spec for Issues tab based on filters.
     *
     * @param {{ status?: string }} filters
     * @returns {{ type: string, params?: Record<string, string|number|boolean> }}
     */
    function computeIssuesSpec(filters) {
      const st = String(filters?.status || 'all');
      if (st === 'ready') {
        return { type: 'ready-issues' };
      }
      if (st === 'in_progress') {
        return { type: 'in-progress-issues' };
      }
      if (st === 'closed') {
        return { type: 'closed-issues' };
      }
      // "all" and "open" map to all-issues; client filters apply locally
      return { type: 'all-issues' };
    }

    /** @type {string|null} */
    let last_issues_spec_key = null;
    /**
     * Ensure only the active tab has subscriptions; clean up previous.
     *
     * @param {{ view: 'issues'|'epics'|'board', filters: any }} s
     */
    function ensureTabSubscriptions(s) {
      // Issues tab
      if (s.view === 'issues') {
        const spec = computeIssuesSpec(s.filters || {});
        const key = JSON.stringify(spec);
        // Register store first to capture the initial snapshot
        try {
          sub_issue_stores.register('tab:issues', spec);
        } catch {
          // ignore
        }
        // Only (re)subscribe if not yet subscribed or the spec changed
        if (!unsub_issues_tab || key !== last_issues_spec_key) {
          void subscriptions
            .subscribeList('tab:issues', spec)
            .then((unsub) => {
              unsub_issues_tab = unsub;
              last_issues_spec_key = key;
            })
            .catch(() => {
              // ignore transport errors; retry on next change
            });
        }
      } else if (unsub_issues_tab) {
        void unsub_issues_tab().catch(() => {});
        unsub_issues_tab = null;
        last_issues_spec_key = null;
        try {
          sub_issue_stores.unregister('tab:issues');
        } catch {
          // ignore
        }
      }

      // Epics tab
      if (s.view === 'epics') {
        // Register store first to avoid race with initial snapshot
        try {
          sub_issue_stores.register('tab:epics', { type: 'epics' });
        } catch {
          // ignore
        }
        void subscriptions
          .subscribeList('tab:epics', { type: 'epics' })
          .then((unsub) => {
            unsub_epics_tab = unsub;
          })
          .catch(() => {});
      } else if (unsub_epics_tab) {
        void unsub_epics_tab().catch(() => {});
        unsub_epics_tab = null;
        try {
          sub_issue_stores.unregister('tab:epics');
        } catch {
          // ignore
        }
      }

      // Board tab subscribes to lists used by columns
      if (s.view === 'board') {
        if (!unsub_board_ready) {
          try {
            sub_issue_stores.register('tab:board:ready', {
              type: 'ready-issues'
            });
          } catch {
            // ignore
          }
          void subscriptions
            .subscribeList('tab:board:ready', { type: 'ready-issues' })
            .then((u) => (unsub_board_ready = u))
            .catch(() => {});
        }
        if (!unsub_board_in_progress) {
          try {
            sub_issue_stores.register('tab:board:in-progress', {
              type: 'in-progress-issues'
            });
          } catch {
            // ignore
          }
          void subscriptions
            .subscribeList('tab:board:in-progress', {
              type: 'in-progress-issues'
            })
            .then((u) => (unsub_board_in_progress = u))
            .catch(() => {});
        }
        if (!unsub_board_closed) {
          try {
            sub_issue_stores.register('tab:board:closed', {
              type: 'closed-issues'
            });
          } catch {
            // ignore
          }
          void subscriptions
            .subscribeList('tab:board:closed', { type: 'closed-issues' })
            .then((u) => (unsub_board_closed = u))
            .catch(() => {});
        }
        if (!unsub_board_blocked) {
          try {
            sub_issue_stores.register('tab:board:blocked', {
              type: 'blocked-issues'
            });
          } catch {
            // ignore
          }
          void subscriptions
            .subscribeList('tab:board:blocked', { type: 'blocked-issues' })
            .then((u) => (unsub_board_blocked = u))
            .catch(() => {});
        }
      } else {
        // Unsubscribe all board lists when leaving the board view
        if (unsub_board_ready) {
          void unsub_board_ready().catch(() => {});
          unsub_board_ready = null;
          try {
            sub_issue_stores.unregister('tab:board:ready');
          } catch {
            // ignore
          }
        }
        if (unsub_board_in_progress) {
          void unsub_board_in_progress().catch(() => {});
          unsub_board_in_progress = null;
          try {
            sub_issue_stores.unregister('tab:board:in-progress');
          } catch {
            // ignore
          }
        }
        if (unsub_board_closed) {
          void unsub_board_closed().catch(() => {});
          unsub_board_closed = null;
          try {
            sub_issue_stores.unregister('tab:board:closed');
          } catch {
            // ignore
          }
        }
        if (unsub_board_blocked) {
          void unsub_board_blocked().catch(() => {});
          unsub_board_blocked = null;
          try {
            sub_issue_stores.unregister('tab:board:blocked');
          } catch {
            // ignore
          }
        }
      }
    }

    /**
     * Manage route visibility and list subscriptions per view.
     *
     * @param {{ selected_id: string | null, view: 'issues'|'epics'|'board', filters: any }} s
     */
    const onRouteChange = (s) => {
      if (issues_root && epics_root && board_root && detail_mount) {
        // Underlying route visibility is controlled only by selected view
        issues_root.hidden = s.view !== 'issues';
        epics_root.hidden = s.view !== 'epics';
        board_root.hidden = s.view !== 'board';
        // detail_mount visibility handled in subscription above
      }
      // Ensure subscriptions for the active tab before loading the view to
      // avoid empty initial renders due to racing list-delta.
      ensureTabSubscriptions(s);
      if (!s.selected_id && s.view === 'epics') {
        void epics_view.load();
      }
      if (!s.selected_id && s.view === 'board') {
        void board_view.load();
      }
      try {
        window.localStorage.setItem('beads-ui.view', s.view);
      } catch {
        // ignore
      }
    };
    store.subscribe(onRouteChange);
    // Ensure initial state is reflected (fixes reload on #/epics)
    onRouteChange(store.getState());

    // Removed redundant filter-change subscription: handled by ensureTabSubscriptions

    // Keyboard shortcuts: Ctrl/Cmd+N opens new issue; Ctrl/Cmd+Enter submits inside dialog
    window.addEventListener('keydown', (ev) => {
      const is_modifier = ev.ctrlKey || ev.metaKey;
      const key = String(ev.key || '').toLowerCase();
      const target = /** @type {HTMLElement} */ (ev.target);
      const tag =
        target && target.tagName ? String(target.tagName).toLowerCase() : '';
      const is_editable =
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        (target &&
          typeof target.isContentEditable === 'boolean' &&
          target.isContentEditable);
      if (is_modifier && key === 'n') {
        // Do not hijack when typing in inputs; common UX
        if (!is_editable) {
          ev.preventDefault();
          new_issue_dialog.open();
        }
      }
    });
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    // Initialize theme from saved preference or OS preference
    try {
      const saved = window.localStorage.getItem('beads-ui.theme');
      const prefersDark =
        window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;
      const initial =
        saved === 'dark' || saved === 'light'
          ? saved
          : prefersDark
            ? 'dark'
            : 'light';
      document.documentElement.setAttribute('data-theme', initial);
      const sw = /** @type {HTMLInputElement|null} */ (
        document.getElementById('theme-switch')
      );
      if (sw) {
        sw.checked = initial === 'dark';
      }
    } catch {
      // ignore theme init errors
    }

    // Wire up theme switch in header
    const themeSwitch = /** @type {HTMLInputElement|null} */ (
      document.getElementById('theme-switch')
    );
    if (themeSwitch) {
      themeSwitch.addEventListener('change', () => {
        const mode = themeSwitch.checked ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', mode);
        try {
          window.localStorage.setItem('beads-ui.theme', mode);
        } catch {
          // ignore persistence errors
        }
      });
    }

    /** @type {HTMLElement|null} */
    const app_root = document.getElementById('app');
    if (app_root) {
      bootstrap(app_root);
    }
  });
}
