import { html, nothing } from 'lit-html';

/**
 * @typedef {{ key: string | null, dir: 'asc' | 'desc' }} SortState
 */

/**
 * Render a clickable, sortable table header cell. The whole label is a button
 * so it is keyboard-focusable; the active column reflects direction via
 * `aria-sort` and a ▲/▼ indicator.
 *
 * @param {{
 *   label: string,
 *   sort_key: string,
 *   sort_state: SortState,
 *   on_sort: (key: string) => void,
 *   columnheader?: boolean
 * }} opts
 * @returns {import('lit-html').TemplateResult<1>}
 */
export function sortableHeaderCell(opts) {
  const is_active = opts.sort_state.key === opts.sort_key;
  const aria_sort = is_active
    ? opts.sort_state.dir === 'asc'
      ? 'ascending'
      : 'descending'
    : 'none';
  const indicator = is_active
    ? opts.sort_state.dir === 'asc'
      ? '▲'
      : '▼'
    : '';
  return html`<th
    role=${opts.columnheader ? 'columnheader' : nothing}
    aria-sort=${aria_sort}
    class="th-sortable ${is_active ? 'is-sorted' : ''}"
  >
    <button
      type="button"
      class="th-sort"
      data-sort-key=${opts.sort_key}
      @click=${() => opts.on_sort(opts.sort_key)}
    >
      <span class="th-sort__label">${opts.label}</span>
      <span class="th-sort__arrow" aria-hidden="true">${indicator}</span>
    </button>
  </th>`;
}
