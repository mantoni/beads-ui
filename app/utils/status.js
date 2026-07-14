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
