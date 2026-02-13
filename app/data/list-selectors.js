/**
 * List selectors utility: compose subscription membership with issues entities
 * and apply view-specific sorting. Provides a lightweight `subscribe` that
 * triggers once per issues envelope to let views re-render.
 */
/**
 * @typedef {{ id: string, title?: string, status?: 'open'|'in_progress'|'closed', priority?: number, issue_type?: string, created_at?: number, updated_at?: number, closed_at?: number, created_by?: string, assignee?: string }} IssueLite
 */
import { cmpClosedDesc, cmpPriorityThenCreated } from './sort.js';

/**
 * Factory for list selectors.
 *
 * Source of truth is per-subscription stores providing snapshots for a given
 * client id. Central issues store fallback has been removed.
 *
 * @param {{ snapshotFor?: (client_id: string) => IssueLite[], subscribe?: (fn: () => void) => () => void }} [issue_stores]
 */
export function createListSelectors(issue_stores = undefined) {
  // Sorting comparators are centralized in app/data/sort.js

  /**
   * Get entities for a subscription id with Issues List sort (priority asc → created asc).
   *
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
      .sort(cmpPriorityThenCreated);
  }

  /**
   * Get entities for a Board column with column-specific sort.
   *
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
      arr.sort(cmpPriorityThenCreated);
    } else if (mode === 'closed') {
      arr.sort(cmpClosedDesc);
    } else {
      // ready/blocked share the same sort
      arr.sort(cmpPriorityThenCreated);
    }
    return arr;
  }

  /**
   * Get children for an epic subscribed as client id `epic:${id}`.
   * Sorted as Issues List (priority asc → created asc).
   *
   * @param {string} epic_id
   * @returns {IssueLite[]}
   */
  function selectEpicChildren(epic_id) {
    if (!issue_stores || typeof issue_stores.snapshotFor !== 'function') {
      return [];
    }
    // Epic detail subscription uses client id `detail:<id>` and contains the
    // epic entity with a `dependents` array. Render children from that list.
    const arr = /** @type {any[]} */ (
      issue_stores.snapshotFor(`detail:${epic_id}`) || []
    );
    const epic = arr.find((it) => String(it?.id || '') === String(epic_id));
    const dependents = Array.isArray(epic?.dependents) ? epic.dependents : [];
    return /** @type {IssueLite[]} */ (
      dependents.slice().sort(cmpPriorityThenCreated)
    );
  }

  /**
   * Subscribe for re-render; triggers once per issues envelope.
   *
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
