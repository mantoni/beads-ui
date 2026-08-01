/**
 * @import { Status } from '../protocol.js'
 */
import { SETTABLE_STATUSES, STATUSES, isSettableStatus } from '../protocol.js';

// Guiding rule: render everything, offer only what a human should set.
// `STATUSES` is every status bd can emit, so all of them get a label and a
// badge colour. `SETTABLE_STATUSES` drives the editable selects: `pinned` and
// `hooked` are owned by bd's own machinery and hand-setting them desyncs it.
// Both live in protocol.js because the server validates against the settable
// set; re-exported here as the view layer's status vocabulary.
export { SETTABLE_STATUSES, STATUSES, isSettableStatus };

/**
 * One entry of the issue list's status filter: any status bd can report, plus
 * the derived `ready` membership. There is no `all` member — an empty
 * selection *is* "all issues".
 *
 * @typedef {'ready' | Status} StatusFilter
 */

/**
 * Statuses offered as filter checkboxes. `hooked` is excluded: it is
 * gate-managed by bd and the all-issues query does not pass `--include-gates`,
 * so a hooked filter would be a dead option that always yields nothing.
 * (`pinned` issues DO appear in a normal bd list, so it stays.)
 *
 * @type {readonly Status[]}
 */
export const FILTERABLE_STATUSES = STATUSES.filter((s) => s !== 'hooked');

/**
 * Every value a status filter entry may take.
 *
 * @type {readonly StatusFilter[]}
 */
const STATUS_FILTER_VALUES = ['ready', ...STATUSES];

/**
 * Normalize any stored, persisted or legacy status filter into the canonical
 * array form and enforce the model's invariant: the result is either exactly
 * `['ready']` or a subset of the stored statuses, never a mix.
 *
 * `ready` is not a per-row predicate — readiness is a top-level membership
 * concept the server answers with its own list, and a list row carries no
 * dependency-graph state to evaluate it client-side. It therefore cannot join
 * a union with stored statuses; a mixed value resolves to the stored statuses,
 * which are the narrower, evaluable half of the selection.
 *
 * Accepts the legacy scalar form (`'open'`, `'all'`) so a selection persisted
 * by an older build survives the upgrade.
 *
 * @param {unknown} value
 * @returns {StatusFilter[]}
 */
export function normalizeStatusFilters(value) {
  /** @type {string[]} */
  let raw = [];
  if (Array.isArray(value)) {
    raw = value.map((v) => String(v));
  } else if (typeof value === 'string' && value !== '' && value !== 'all') {
    raw = [value];
  }

  /** @type {StatusFilter[]} */
  const selected = [];
  for (const entry of raw) {
    const known = /** @type {readonly string[]} */ (
      STATUS_FILTER_VALUES
    ).includes(entry);
    if (known && !(/** @type {string[]} */ (selected).includes(entry))) {
      selected.push(/** @type {StatusFilter} */ (entry));
    }
  }

  const stored = selected.filter((s) => s !== 'ready');
  if (stored.length > 0) {
    return stored;
  }
  return selected.length > 0 ? ['ready'] : [];
}

/**
 * Whether two status filter selections are equal.
 *
 * @param {readonly StatusFilter[]} a
 * @param {readonly StatusFilter[]} b
 */
export function sameStatusFilters(a, b) {
  return a.length === b.length && a.every((s, i) => s === b[i]);
}

/**
 * Map a status to its display label. Unknown values are title-cased rather
 * than defaulted to a known status: a status bdui has never heard of must not
 * masquerade as `Open`.
 *
 * @param {string | null | undefined} status
 * @returns {string}
 */
export function statusLabel(status) {
  const raw = (status || '').toString();
  switch (raw) {
    case 'open':
      return 'Open';
    case 'in_progress':
      return 'In progress';
    case 'blocked':
      return 'Blocked';
    case 'deferred':
      return 'Deferred';
    case 'closed':
      return 'Closed';
    case 'pinned':
      return 'Pinned';
    case 'hooked':
      return 'Hooked';
    default:
      return titleize(raw);
  }
}

/**
 * Options for an editable status `<select>`: the settable statuses, plus the
 * issue's current status when bd has it in a state we don't offer (e.g.
 * `pinned`) — otherwise the select would silently display the wrong option.
 *
 * @param {string | null | undefined} current
 * @returns {Array<Status | string>}
 */
export function statusOptions(current) {
  const cur = (current || '').toString();
  /** @type {string[]} */
  const settable = [...SETTABLE_STATUSES];
  if (cur && !settable.includes(cur)) {
    return [...settable, cur];
  }
  return settable;
}

/**
 * Title-case a raw status: `in_review` → `In review`, empty → `Unknown`.
 *
 * @param {string} raw
 * @returns {string}
 */
function titleize(raw) {
  if (!raw) {
    return 'Unknown';
  }
  const words = raw.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
