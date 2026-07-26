import { html } from 'lit-html';

/**
 * Resizable table columns shared by the issues and epics tables.
 *
 * Widths are stored per view in localStorage. Content columns carry an
 * explicit pixel width; one column may stay `null` (auto) so the table keeps
 * filling its container. A trailing spacer column absorbs the leftover space
 * once every content column has an explicit width.
 */

/**
 * @typedef {Object} ColumnSpec
 * @property {string} key - Stable column key.
 * @property {string} label - Header label.
 * @property {number} width - Default width in pixels.
 * @property {boolean} [flex] - Column stretches to fill the row by default.
 * @property {number} [min] - Minimum width in pixels.
 */

const MIN_COLUMN_WIDTH = 48;
const MAX_COLUMN_WIDTH = 1000;
const KEYBOARD_STEP = 16;

/**
 * Clamp a width to the allowed range for a column.
 *
 * @param {number} px
 * @param {ColumnSpec} column
 */
function clampWidth(px, column) {
  const min = typeof column.min === 'number' ? column.min : MIN_COLUMN_WIDTH;
  return Math.max(min, Math.min(MAX_COLUMN_WIDTH, Math.round(px)));
}

/**
 * Default width of a single column (`null` for the auto sizing column).
 *
 * @param {ColumnSpec} column
 * @returns {number | null}
 */
function defaultWidth(column) {
  return column.flex ? null : column.width;
}

/**
 * Default widths for all columns.
 *
 * @param {ColumnSpec[]} columns
 * @returns {(number | null)[]}
 */
function defaultWidths(columns) {
  return columns.map((column) => defaultWidth(column));
}

/**
 * Read persisted widths, falling back to defaults for missing or invalid
 * entries.
 *
 * @param {string} storage_key
 * @param {ColumnSpec[]} columns
 * @returns {(number | null)[]}
 */
function loadWidths(storage_key, columns) {
  try {
    const raw = window.localStorage.getItem(storage_key);
    if (!raw) {
      return defaultWidths(columns);
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== columns.length) {
      return defaultWidths(columns);
    }
    return columns.map((column, index) => {
      const value = parsed[index];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return defaultWidth(column);
      }
      return clampWidth(value, column);
    });
  } catch {
    return defaultWidths(columns);
  }
}

/**
 * Trailing spacer cell for a body row. Keeps body rows aligned with the
 * spacer column declared by `createColumnResizer().colgroup()`.
 */
export function columnSpacerCell() {
  return html`<td class="col-spacer" aria-hidden="true"></td>`;
}

/**
 * Create resizable column support for the `.table` elements rendered inside
 * `mount_element`. All tables in the mount share one set of widths, so the
 * epics view keeps its per-epic tables aligned.
 *
 * @param {Object} options
 * @param {HTMLElement} options.mount_element - Element the tables render into.
 * @param {string} options.storage_key - localStorage key for persisted widths.
 * @param {ColumnSpec[]} options.columns - Column definitions, in cell order.
 * @param {() => void} options.requestRender - Re-render the owning view.
 */
export function createColumnResizer(options) {
  const mount_element = options.mount_element;
  const storage_key = options.storage_key;
  const columns = options.columns;
  const requestRender = options.requestRender;
  /** @type {(number | null)[]} */
  let widths = loadWidths(storage_key, columns);
  /** @type {null | (() => void)} */
  let endDrag = null;

  function persist() {
    try {
      window.localStorage.setItem(storage_key, JSON.stringify(widths));
    } catch {
      // Storage unavailable; widths remain in memory for this session.
    }
  }

  /**
   * Width the spacer column should use: it only stretches once every content
   * column has an explicit width.
   *
   * @param {(number | null)[]} next_widths
   */
  function spacerWidth(next_widths) {
    return next_widths.some((w) => w === null) ? '0' : '';
  }

  /**
   * Rendered width of a column, used as the starting point of a resize.
   *
   * @param {number} index
   * @param {HTMLElement | null} cell
   */
  function currentWidth(index, cell) {
    if (cell) {
      const rect = cell.getBoundingClientRect();
      if (rect.width > 0) {
        return rect.width;
      }
    }
    const stored = widths[index];
    return typeof stored === 'number' ? stored : columns[index].width;
  }

  /**
   * Apply a width to every table in the mount without a full re-render so
   * dragging stays smooth.
   *
   * @param {number} index
   * @param {number} px
   */
  function applyLiveWidth(index, px) {
    const next_widths = widths.map((w, i) => (i === index ? px : w));
    const tables = Array.from(mount_element.querySelectorAll('table.table'));
    for (const table of tables) {
      const cols = /** @type {HTMLElement[]} */ (
        Array.from(table.querySelectorAll('colgroup > col'))
      );
      const col_element = cols[index];
      if (col_element) {
        col_element.style.width = `${px}px`;
      }
      const spacer_element = cols[columns.length];
      if (spacer_element) {
        spacer_element.style.width = spacerWidth(next_widths);
      }
    }
  }

  /**
   * Store a new width for a column and re-render.
   *
   * @param {number} index
   * @param {number | null} px
   */
  function commitWidth(index, px) {
    widths = widths.map((w, i) => (i === index ? px : w));
    persist();
    requestRender();
  }

  /**
   * Start a drag resize.
   *
   * @param {MouseEvent} ev
   * @param {number} index
   */
  function onPointerDown(ev, index) {
    if (ev.button !== 0) {
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    if (endDrag) {
      endDrag();
    }
    const handle = /** @type {HTMLElement} */ (ev.currentTarget);
    const cell = /** @type {HTMLElement | null} */ (handle.closest('th'));
    const column = columns[index];
    const start_x = ev.clientX;
    const start_width = currentWidth(index, cell);
    let next_width = clampWidth(start_width, column);

    /** @param {MouseEvent} move_ev */
    const onPointerMove = (move_ev) => {
      next_width = clampWidth(
        start_width + (move_ev.clientX - start_x),
        column
      );
      applyLiveWidth(index, next_width);
    };
    const onPointerUp = () => {
      if (endDrag) {
        endDrag();
      }
      commitWidth(index, next_width);
    };
    endDrag = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      document.body.classList.remove('is-col-resizing');
      endDrag = null;
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    document.body.classList.add('is-col-resizing');
  }

  /**
   * Resize with the keyboard while the handle is focused.
   *
   * @param {KeyboardEvent} ev
   * @param {number} index
   */
  function onKeyDown(ev, index) {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') {
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    const handle = /** @type {HTMLElement} */ (ev.currentTarget);
    const cell = /** @type {HTMLElement | null} */ (handle.closest('th'));
    const column = columns[index];
    const delta = ev.key === 'ArrowRight' ? KEYBOARD_STEP : -KEYBOARD_STEP;
    commitWidth(index, clampWidth(currentWidth(index, cell) + delta, column));
  }

  /**
   * Restore a column to its default width.
   *
   * @param {number} index
   */
  function resetColumn(index) {
    commitWidth(index, defaultWidth(columns[index]));
  }

  return {
    /**
     * Render the `<colgroup>` of a resizable table.
     */
    colgroup() {
      return html`<colgroup>
        ${widths.map((w) =>
          w === null ? html`<col />` : html`<col style="width: ${w}px" />`
        )}
        <col
          class="col-spacer"
          style=${spacerWidth(widths) ? 'width: 0' : ''}
        />
      </colgroup>`;
    },

    /**
     * Render the header cells, each with a resize handle.
     */
    headerCells() {
      return html`${columns.map(
          (column, index) =>
            html`<th role="columnheader" scope="col">
              <span class="text-truncate">${column.label}</span>
              <span
                class="col-resizer"
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize ${column.label} column"
                title="Drag to resize, double-click to reset"
                tabindex="0"
                @pointerdown=${
                  /** @param {Event} e */ (e) =>
                    onPointerDown(/** @type {MouseEvent} */ (e), index)
                }
                @keydown=${
                  /** @param {Event} e */ (e) =>
                    onKeyDown(/** @type {KeyboardEvent} */ (e), index)
                }
                @dblclick=${
                  /** @param {Event} e */ (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    resetColumn(index);
                  }
                }
                @click=${/** @param {Event} e */ (e) => e.stopPropagation()}
              ></span>
            </th>`
        )}
        <th class="col-spacer" aria-hidden="true"></th>`;
    },

    /**
     * Current widths, `null` for auto sized columns.
     */
    widths() {
      return widths.slice();
    },

    destroy() {
      if (endDrag) {
        endDrag();
      }
    }
  };
}
