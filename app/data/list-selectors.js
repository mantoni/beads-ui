/**
 * List selectors utility: compose subscription membership with issues entities
 * and apply view-specific sorting. Provides a lightweight `subscribe` that
 * triggers once per issues envelope to let views re-render.
 */

/**
 * @typedef {{ id: string, title?: string, status?: 'open'|'in_progress'|'closed', priority?: number, issue_type?: string, updated_at?: number, closed_at?: number }} IssueLite
 */

/**
 * Factory for list selectors.
 *
 * Source of truth is per-subscription stores providing snapshots for a given
 * client id. Central issues store fallback has been removed.
 * @param {{ snapshotFor?: (client_id: string) => IssueLite[], subscribe?: (fn: () => void) => () => void }} [issue_stores]
 */
export function createListSelectors(issue_stores = undefined) {
  /**
   * Compare by priority asc, then updated_at desc, then id asc.
   * @param {IssueLite} a
   * @param {IssueLite} b
   */
  function cmpPriorityThenUpdated(a, b) {
    const pa = Number.isFinite(a.priority)
      ? /** @type {number} */ (a.priority)
      : 2;
    const pb = Number.isFinite(b.priority)
      ? /** @type {number} */ (b.priority)
      : 2;
    if (pa !== pb) {
      return pa - pb;
    }
    const ua = Number.isFinite(a.updated_at)
      ? /** @type {number} */ (a.updated_at)
      : 0;
    const ub = Number.isFinite(b.updated_at)
      ? /** @type {number} */ (b.updated_at)
      : 0;
    if (ua !== ub) {
      return ua < ub ? 1 : -1;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  }

  /**
   * Compare by updated_at desc, then id asc.
   * @param {IssueLite} a
   * @param {IssueLite} b
   */
  function cmpUpdatedDesc(a, b) {
    const ua = Number.isFinite(a.updated_at)
      ? /** @type {number} */ (a.updated_at)
      : 0;
    const ub = Number.isFinite(b.updated_at)
      ? /** @type {number} */ (b.updated_at)
      : 0;
    if (ua !== ub) {
      return ua < ub ? 1 : -1;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  }

  /**
   * Compare by closed_at desc (fallback updated_at), then id asc.
   * @param {IssueLite} a
   * @param {IssueLite} b
   */
  function cmpClosedDesc(a, b) {
    const ca = Number.isFinite(a.closed_at)
      ? /** @type {number} */ (a.closed_at)
      : Number.isFinite(a.updated_at)
        ? /** @type {number} */ (a.updated_at)
        : 0;
    const cb = Number.isFinite(b.closed_at)
      ? /** @type {number} */ (b.closed_at)
      : Number.isFinite(b.updated_at)
        ? /** @type {number} */ (b.updated_at)
        : 0;
    if (ca !== cb) {
      return ca < cb ? 1 : -1;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  }

  /**
   * Get entities for a subscription id with Issues List sort (priority asc → updated desc).
   * @param {string} client_id
   * @returns {IssueLite[]}
   */
  function selectIssuesFor(client_id) {
    if (!issue_stores || typeof issue_stores.snapshotFor !== 'function') {
      return [];
    }
    return issue_stores
      .snapshotFor(client_id)
      .slice()
      .sort(cmpPriorityThenUpdated);
  }

  /**
   * Get entities for a Board column with column-specific sort.
   * @param {string} client_id
   * @param {'ready'|'blocked'|'in_progress'|'closed'} mode
   * @returns {IssueLite[]}
   */
  function selectBoardColumn(client_id, mode) {
    const arr =
      issue_stores && issue_stores.snapshotFor
        ? issue_stores.snapshotFor(client_id).slice()
        : [];
    if (mode === 'in_progress') {
      arr.sort(cmpUpdatedDesc);
    } else if (mode === 'closed') {
      arr.sort(cmpClosedDesc);
    } else {
      // ready/blocked share the same sort
      arr.sort(cmpPriorityThenUpdated);
    }
    return arr;
  }

  /**
   * Get children for an epic subscribed as client id `epic:${id}`.
   * Sorted as Issues List (priority asc → updated desc).
   * @param {string} epic_id
   * @returns {IssueLite[]}
   */
  function selectEpicChildren(epic_id) {
    const client_id = `epic:${epic_id}`;
    return selectIssuesFor(client_id);
  }

  /**
   * Subscribe for re-render; triggers once per issues envelope.
   * @param {() => void} fn
   * @returns {() => void}
   */
  function subscribe(fn) {
    if (issue_stores && typeof issue_stores.subscribe === 'function') {
      return issue_stores.subscribe(fn);
    }
    return () => {};
  }

  return {
    selectIssuesFor,
    selectBoardColumn,
    selectEpicChildren,
    subscribe
  };
}
