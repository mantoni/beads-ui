/**
 * Known issue types in canonical order for dropdowns.
 *
 * @type {Array<'bug'|'feature'|'task'|'epic'|'chore'>}
 */
export const ISSUE_TYPES = ['bug', 'feature', 'task', 'epic', 'chore'];

/**
 * Return a human-friendly label for an issue type.
 *
 * @param {string | null | undefined} type
 * @returns {string}
 */
export function typeLabel(type) {
  switch ((type || '').toString().toLowerCase()) {
    case 'bug':
      return 'Bug';
    case 'feature':
      return 'Feature';
    case 'task':
      return 'Task';
    case 'epic':
      return 'Epic';
    case 'chore':
      return 'Chore';
    default:
      return '';
  }
}
