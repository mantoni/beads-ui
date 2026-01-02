/**
 * Global fuzzy search component for beads-ui.
 * Searches all issues (including those not in current view) and displays
 * results with visual distinction for out-of-view items.
 */
import Fuse from 'fuse.js';
import { html, render } from 'lit-html';
import { debug } from '../utils/logging.js';

const log = debug('global-search');

/**
 * @typedef {Object} SearchIssue
 * @property {string} id
 * @property {string} title
 * @property {string} status
 * @property {string} issue_type
 * @property {number} [priority]
 * @property {number} [created_at]
 * @property {number} [closed_at]
 */

/**
 * Create the global search component.
 *
 * @param {HTMLElement} mount - Element to render into
 * @param {Object} options
 * @param {(type: string, payload?: unknown) => Promise<unknown>} options.send - WebSocket send function
 * @param {(id: string) => void} options.onSelect - Callback when an issue is selected
 */
export function createGlobalSearch(mount, options) {
  const { send, onSelect } = options;

  /** @type {SearchIssue[]} */
  let all_issues = [];
  /** @type {Fuse<SearchIssue> | null} */
  let fuse = null;
  /** @type {string} */
  let query = '';
  /** @type {SearchIssue[]} */
  let results = [];
  /** @type {boolean} */
  let is_open = false;
  /** @type {boolean} */
  let is_loading = false;
  /** @type {number} */
  let selected_index = -1;

  /**
   * Fetch all issues from the server and initialize Fuse.js index.
   */
  async function loadAllIssues() {
    if (all_issues.length > 0) {
      return; // Already loaded
    }
    is_loading = true;
    doRender();

    try {
      const res = /** @type {{ items: SearchIssue[] }} */ (
        await send('search-all-issues', {})
      );
      all_issues = res.items || [];
      fuse = new Fuse(all_issues, {
        keys: ['title', 'id'],
        threshold: 0.4, // Fuzzy tolerance (0 = exact, 1 = match anything)
        includeScore: true,
        minMatchCharLength: 2
      });
      log('loaded %d issues for search', all_issues.length);
    } catch (err) {
      log('failed to load issues: %o', err);
      all_issues = [];
      fuse = null;
    }

    is_loading = false;
    doRender();
  }

  /**
   * Perform fuzzy search on cached issues.
   *
   * @param {string} q - Search query.
   */
  function search(q) {
    query = q;
    selected_index = -1;

    if (!fuse || q.length < 2) {
      results = [];
      doRender();
      return;
    }

    const fuse_results = fuse.search(q, { limit: 10 });
    results = fuse_results.map((r) => r.item);
    doRender();
  }

  /**
   * Handle search input changes.
   *
   * @param {Event} e - Input event.
   */
  function onInput(e) {
    const input = /** @type {HTMLInputElement} */ (e.target);
    search(input.value);
  }

  /**
   * Handle focus event by loading issues and opening dropdown.
   */
  async function onFocus() {
    is_open = true;
    await loadAllIssues();
    if (query.length >= 2) {
      search(query);
    }
    doRender();
  }

  /**
   * Handle blur event by closing dropdown after a short delay.
   */
  function onBlur() {
    setTimeout(() => {
      is_open = false;
      doRender();
    }, 200);
  }

  /**
   * Handle keyboard navigation in search results.
   *
   * @param {KeyboardEvent} e - Keyboard event.
   */
  function onKeyDown(e) {
    if (!is_open || results.length === 0) {
      if (e.key === 'Escape') {
        is_open = false;
        doRender();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        selected_index = Math.min(selected_index + 1, results.length - 1);
        doRender();
        break;
      case 'ArrowUp':
        e.preventDefault();
        selected_index = Math.max(selected_index - 1, 0);
        doRender();
        break;
      case 'Enter':
        e.preventDefault();
        if (selected_index >= 0 && selected_index < results.length) {
          selectResult(results[selected_index]);
        }
        break;
      case 'Escape':
        is_open = false;
        doRender();
        break;
    }
  }

  /**
   * Select a search result and navigate to it.
   *
   * @param {SearchIssue} issue - Selected issue.
   */
  function selectResult(issue) {
    query = '';
    results = [];
    is_open = false;
    doRender();
    onSelect(issue.id);
  }

  /**
   * Get CSS class for status badge styling.
   *
   * @param {string} status - Issue status.
   * @returns {string} CSS class name.
   */
  function getStatusClass(status) {
    switch (status) {
      case 'open':
        return 'badge--open';
      case 'in_progress':
        return 'badge--in-progress';
      case 'closed':
        return 'badge--closed';
      default:
        return '';
    }
  }

  /**
   * Render the search component to the DOM.
   */
  function doRender() {
    const tpl = html`
      <div class="global-search ${is_open ? 'is-open' : ''}">
        <div class="global-search__input-wrapper">
          <input
            type="search"
            class="global-search__input"
            placeholder="Search issues…"
            .value=${query}
            @input=${onInput}
            @focus=${onFocus}
            @blur=${onBlur}
            @keydown=${onKeyDown}
            aria-label="Search issues"
            aria-expanded=${is_open}
            aria-controls="global-search-results"
            autocomplete="off"
          />
          ${is_loading
            ? html`<span class="global-search__loading"></span>`
            : html`<svg
                class="global-search__icon"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>`}
        </div>
        ${is_open && (results.length > 0 || query.length >= 2)
          ? html`
              <ul
                id="global-search-results"
                class="global-search__results"
                role="listbox"
              >
                ${results.length === 0
                  ? html`<li class="global-search__no-results">
                      No matches found
                    </li>`
                  : results.map(
                      (issue, i) => html`
                        <li
                          class="global-search__result ${i === selected_index
                            ? 'is-selected'
                            : ''}"
                          role="option"
                          aria-selected=${i === selected_index}
                          @mousedown=${() => selectResult(issue)}
                          @mouseenter=${() => {
                            selected_index = i;
                            doRender();
                          }}
                        >
                          <span class="global-search__result-id mono">
                            ${issue.id.split('-').pop()}
                          </span>
                          <span class="global-search__result-title">
                            ${issue.title || '(untitled)'}
                          </span>
                          <span
                            class="badge badge--sm ${getStatusClass(
                              issue.status
                            )}"
                          >
                            ${issue.status}
                          </span>
                        </li>
                      `
                    )}
              </ul>
            `
          : ''}
      </div>
    `;
    render(tpl, mount);
  }

  /**
   * Clear the issues cache to force a refresh on next search.
   */
  function refresh() {
    all_issues = [];
    fuse = null;
  }

  // Initial render
  doRender();

  return {
    refresh,
    doRender
  };
}
