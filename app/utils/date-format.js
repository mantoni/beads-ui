/**
 * Date formatting helpers shared by the detail card and the list/epics tables.
 *
 * Timestamps reach the client as either numeric epoch-ms (top-level items pass
 * through `normalizeIssueList`) or ISO strings (some nested fields). `new
 * Date(value)` handles both identically.
 */

/**
 * Format a date value as a full local datetime (date + hour/minute).
 * Used by the detail view's Dates card and as the table cell tooltip.
 *
 * @param {number | string | null | undefined} value
 * @returns {string} Formatted local datetime, or '' when value is missing.
 */
export function formatDateValue(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return '';
  }
}

/**
 * Format a date value as a compact local date (no time) for table cells.
 * The full datetime is surfaced via the cell's `title` tooltip.
 *
 * @param {number | string | null | undefined} value
 * @returns {string} Formatted local date, or '' when value is missing.
 */
export function formatDateShort(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return '';
  }
}
