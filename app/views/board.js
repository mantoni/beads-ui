import { html, render } from 'lit-html';
import { createIssueIdRenderer } from '../utils/issue-id-renderer.js';
import { createPriorityBadge } from '../utils/priority-badge.js';
import { createTypeBadge } from '../utils/type-badge.js';

/**
 * @typedef {{
 *   id: string,
 *   title?: string,
 *   status?: 'open'|'in_progress'|'closed',
 *   priority?: number,
 *   issue_type?: string,
 *   updated_at?: string,
 *   closed_at?: string
 * }} IssueLite
 */

/**
 * Create the Board view with Blocked, Ready, In progress, Closed.
 * Data providers are expected to return raw arrays; this view applies sorting.
 *
 * Sorting rules:
 * - Ready/Blocked: priority asc, then updated_at desc when present
 * - In progress: updated_at desc
 * - Closed: closed_at desc (fallback to updated_at)
 * @param {HTMLElement} mount_element
 * @param {{ getReady: () => Promise<any[]>, getBlocked?: () => Promise<any[]>, getInProgress: () => Promise<any[]>, getClosed: (limit?: number) => Promise<any[]> }} data
 * @param {(id: string) => void} gotoIssue - Navigate to issue detail.
 * @param {{ getState: () => any, setState: (patch: any) => void, subscribe?: (fn: (s:any)=>void)=>()=>void }} [store]
 * @returns {{ load: () => Promise<void>, clear: () => void }}
 */
export function createBoardView(mount_element, data, gotoIssue, store) {
  /** @type {IssueLite[]} */
  let list_ready = [];
  /** @type {IssueLite[]} */
  let list_blocked = [];
  /** @type {IssueLite[]} */
  let list_in_progress = [];
  /** @type {IssueLite[]} */
  let list_closed = [];
  /** @type {IssueLite[]} */
  let list_closed_raw = [];

  /**
   * Closed column filter mode.
   * 'today' → items with closed_at since local day start
   * '3' → last 3 days; '7' → last 7 days
   * @type {'today'|'3'|'7'}
   */
  let closed_filter_mode = 'today';
  if (store) {
    try {
      const s = store.getState();
      const cf =
        s && s.board ? String(s.board.closed_filter || 'today') : 'today';
      if (cf === 'today' || cf === '3' || cf === '7') {
        closed_filter_mode = /** @type {any} */ (cf);
      }
    } catch {
      // ignore store init errors
    }
  }

  function template() {
    return html`
      <div class="panel__body board-root">
        ${columnTemplate('Blocked', 'blocked-col', list_blocked)}
        ${columnTemplate('Ready', 'ready-col', list_ready)}
        ${columnTemplate('In Progress', 'in-progress-col', list_in_progress)}
        ${columnTemplate('Closed', 'closed-col', list_closed)}
      </div>
    `;
  }

  /**
   * @param {string} title
   * @param {string} id
   * @param {IssueLite[]} items
   */
  function columnTemplate(title, id, items) {
    return html`
      <section class="board-column" id=${id}>
        <header
          class="board-column__header"
          id=${id + '-header'}
          role="heading"
          aria-level="2"
        >
          <span>${title}</span>
          ${id === 'closed-col'
            ? html`<label class="board-closed-filter">
                <span class="visually-hidden">Filter closed issues</span>
                <select
                  id="closed-filter"
                  aria-label="Filter closed issues"
                  @change=${onClosedFilterChange}
                >
                  <option
                    value="today"
                    ?selected=${closed_filter_mode === 'today'}
                  >
                    Today
                  </option>
                  <option value="3" ?selected=${closed_filter_mode === '3'}>
                    Last 3 days
                  </option>
                  <option value="7" ?selected=${closed_filter_mode === '7'}>
                    Last 7 days
                  </option>
                </select>
              </label>`
            : ''}
        </header>
        <div
          class="board-column__body"
          role="list"
          aria-labelledby=${id + '-header'}
        >
          ${items.map((it) => cardTemplate(it))}
        </div>
      </section>
    `;
  }

  /**
   * @param {IssueLite} it
   */
  function cardTemplate(it) {
    return html`
      <article
        class="board-card"
        data-issue-id=${it.id}
        role="listitem"
        tabindex="-1"
        @click=${() => gotoIssue(it.id)}
      >
        <div class="board-card__title text-truncate">
          ${it.title || '(no title)'}
        </div>
        <div class="board-card__meta">
          ${createTypeBadge(/** @type {any} */ (it).issue_type)}
          ${createPriorityBadge(/** @type {any} */ (it).priority)}
          ${createIssueIdRenderer(it.id, { class_name: 'mono' })}
        </div>
      </article>
    `;
  }

  function doRender() {
    render(template(), mount_element);
    postRenderEnhance();
  }

  /**
   * Enhance rendered board with a11y and keyboard navigation.
   * - Roving tabindex per column (first card tabbable)
   * - ArrowUp/ArrowDown within column
   * - ArrowLeft/ArrowRight to adjacent non-empty column (focus top card)
   * - Enter/Space to open details for focused card
   */
  function postRenderEnhance() {
    try {
      /** @type {HTMLElement[]} */
      const columns = Array.from(
        mount_element.querySelectorAll('.board-column')
      );
      for (const col of columns) {
        /** @type {HTMLElement|null} */
        const body = /** @type {any} */ (
          col.querySelector('.board-column__body')
        );
        if (!body) {
          continue;
        }
        /** @type {HTMLElement[]} */
        const cards = Array.from(body.querySelectorAll('.board-card'));
        // Assign aria-label using column header for screen readers
        const header = /** @type {HTMLElement|null} */ (
          col.querySelector('.board-column__header')
        );
        const col_name = header ? header.textContent?.trim() || '' : '';
        for (const card of cards) {
          const title_el = /** @type {HTMLElement|null} */ (
            card.querySelector('.board-card__title')
          );
          const t = title_el ? title_el.textContent?.trim() || '' : '';
          card.setAttribute(
            'aria-label',
            `Issue ${t || '(no title)'} — Column ${col_name}`
          );
          // Default roving setup
          card.tabIndex = -1;
        }
        if (cards.length > 0) {
          cards[0].tabIndex = 0;
        }
      }
    } catch {
      // non-fatal
    }
  }

  // Delegate keyboard handling from mount_element
  mount_element.addEventListener('keydown', (ev) => {
    /** @type {HTMLElement} */
    const target = /** @type {any} */ (ev.target);
    if (!target || !(target instanceof HTMLElement)) {
      return;
    }
    // Do not intercept keys inside editable controls
    const tag = String(target.tagName || '').toLowerCase();
    if (
      tag === 'input' ||
      tag === 'textarea' ||
      tag === 'select' ||
      /** @type {any} */ (target).isContentEditable === true
    ) {
      return;
    }
    const card = target.closest('.board-card');
    if (!card) {
      return;
    }
    const key = String(ev.key || '');
    if (key === 'Enter' || key === ' ') {
      ev.preventDefault();
      const id = /** @type {HTMLElement} */ (card).getAttribute(
        'data-issue-id'
      );
      if (id) {
        gotoIssue(id);
      }
      return;
    }
    if (
      key !== 'ArrowUp' &&
      key !== 'ArrowDown' &&
      key !== 'ArrowLeft' &&
      key !== 'ArrowRight'
    ) {
      return;
    }
    ev.preventDefault();
    // Column context
    const col = /** @type {HTMLElement|null} */ (card.closest('.board-column'));
    if (!col) {
      return;
    }
    const body = /** @type {HTMLElement|null} */ (
      col.querySelector('.board-column__body')
    );
    if (!body) {
      return;
    }
    /** @type {HTMLElement[]} */
    const cards = Array.from(body.querySelectorAll('.board-card'));
    const idx = cards.indexOf(/** @type {HTMLElement} */ (card));
    if (idx === -1) {
      return;
    }
    if (key === 'ArrowDown' && idx < cards.length - 1) {
      moveFocus(cards[idx], cards[idx + 1]);
      return;
    }
    if (key === 'ArrowUp' && idx > 0) {
      moveFocus(cards[idx], cards[idx - 1]);
      return;
    }
    if (key === 'ArrowRight' || key === 'ArrowLeft') {
      // Find adjacent column with at least one card
      /** @type {HTMLElement[]} */
      const cols = Array.from(mount_element.querySelectorAll('.board-column'));
      const col_idx = cols.indexOf(col);
      if (col_idx === -1) {
        return;
      }
      const dir = key === 'ArrowRight' ? 1 : -1;
      let next_idx = col_idx + dir;
      /** @type {HTMLElement|null} */
      let target_col = null;
      while (next_idx >= 0 && next_idx < cols.length) {
        const candidate = cols[next_idx];
        const c_body = /** @type {HTMLElement|null} */ (
          candidate.querySelector('.board-column__body')
        );
        const c_cards = c_body
          ? Array.from(c_body.querySelectorAll('.board-card'))
          : [];
        if (c_cards.length > 0) {
          target_col = candidate;
          break;
        }
        next_idx += dir;
      }
      if (target_col) {
        const first = /** @type {HTMLElement|null} */ (
          target_col.querySelector('.board-column__body .board-card')
        );
        if (first) {
          moveFocus(/** @type {HTMLElement} */ (card), first);
        }
      }
      return;
    }
  });

  /**
   * @param {HTMLElement} from
   * @param {HTMLElement} to
   */
  function moveFocus(from, to) {
    try {
      from.tabIndex = -1;
      to.tabIndex = 0;
      to.focus();
    } catch {
      // ignore focus errors
    }
  }

  /**
   * Sort helpers.
   */
  /**
   * @param {IssueLite[]} arr
   */
  function sortReady(arr) {
    arr.sort((a, b) => {
      const pa = a.priority ?? 2;
      const pb = b.priority ?? 2;
      if (pa !== pb) {
        return pa - pb;
      }
      const ua = a.updated_at || '';
      const ub = b.updated_at || '';
      return ua < ub ? 1 : ua > ub ? -1 : 0;
    });
  }

  /**
   * @param {IssueLite[]} arr
   */
  function sortByUpdatedDesc(arr) {
    arr.sort((a, b) => {
      const ua = a.updated_at || '';
      const ub = b.updated_at || '';
      return ua < ub ? 1 : ua > ub ? -1 : 0;
    });
  }

  /**
   * Sort by closed_at desc with updated_at fallback.
   * @param {IssueLite[]} arr
   */
  function sortByClosedDesc(arr) {
    arr.sort((a, b) => {
      const ca = a.closed_at || a.updated_at || '';
      const cb = b.closed_at || b.updated_at || '';
      return ca < cb ? 1 : ca > cb ? -1 : 0;
    });
  }

  /**
   * Recompute closed list from raw using the current filter and sort.
   */
  function applyClosedFilter() {
    /** @type {IssueLite[]} */
    let items = Array.isArray(list_closed_raw) ? [...list_closed_raw] : [];
    const now = new Date();
    /** @type {number} */
    let since_ts = 0;
    if (closed_filter_mode === 'today') {
      const start = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        0,
        0,
        0,
        0
      );
      since_ts = start.getTime();
    } else if (closed_filter_mode === '3') {
      since_ts = now.getTime() - 3 * 24 * 60 * 60 * 1000;
    } else if (closed_filter_mode === '7') {
      since_ts = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    }
    items = items.filter((it) => {
      const s = it.closed_at || '';
      if (!s || isNaN(Date.parse(s))) {
        return false;
      }
      const t = Date.parse(s);
      return t >= since_ts;
    });
    sortByClosedDesc(items);
    list_closed = items;
  }

  /**
   * @param {Event} ev
   */
  function onClosedFilterChange(ev) {
    try {
      const el = /** @type {HTMLSelectElement} */ (ev.target);
      const v = String(el.value || 'today');
      closed_filter_mode = v === '3' || v === '7' ? v : 'today';
      if (store) {
        try {
          store.setState({ board: { closed_filter: closed_filter_mode } });
        } catch {
          // ignore store errors
        }
      }
      applyClosedFilter();
      doRender();
    } catch {
      // ignore
    }
  }

  return {
    async load() {
      /** @type {IssueLite[]} */
      let r = [];
      /** @type {IssueLite[]} */
      let b = [];
      /** @type {IssueLite[]} */
      let p = [];
      /** @type {IssueLite[]} */
      let c = [];
      try {
        r = /** @type {any} */ (await data.getReady());
      } catch {
        r = [];
      }
      try {
        // getBlocked is optional for backward compatibility in tests
        const fn = /** @type {any} */ (data).getBlocked;
        b = typeof fn === 'function' ? /** @type {any} */ (await fn()) : [];
      } catch {
        b = [];
      }
      try {
        p = /** @type {any} */ (await data.getInProgress());
      } catch {
        p = [];
      }
      try {
        c = /** @type {any} */ (await data.getClosed());
      } catch {
        c = [];
      }

      // Remove items from Ready that are already In Progress by id
      if (r.length > 0 && p.length > 0) {
        /** @type {Set<string>} */
        const in_progress_ids = new Set(p.map((it) => it.id));
        r = r.filter((it) => !in_progress_ids.has(it.id));
      }

      // Sort lists for display
      sortReady(r);
      sortReady(b);
      sortByUpdatedDesc(p);
      // Closed handled separately to use closed_at and filtering

      list_ready = r;
      list_blocked = b;
      list_in_progress = p;
      list_closed_raw = c;
      applyClosedFilter();
      doRender();
    },
    clear() {
      mount_element.replaceChildren();
      list_ready = [];
      list_blocked = [];
      list_in_progress = [];
      list_closed = [];
    }
  };
}
