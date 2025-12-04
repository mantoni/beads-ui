/**
 * Format a beads issue id as a user-facing display string.
 * Returns the full ID (e.g., UI-123, UI-TREE, UI-apzw).
 *
 * @param {string | null | undefined} id
 * @returns {string}
 */
export function issueDisplayId(id) {
  return String(id || '') || '#';
}
