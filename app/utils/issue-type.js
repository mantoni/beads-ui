/**
 * Known issue types in canonical order for dropdowns.
 *
 * @type {string[]}
 */
export const ISSUE_TYPES = [
  'bug',
  'feature',
  'task',
  'epic',
  'chore',
  'decision',
  'spike',
  'story',
  'milestone'
];

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
    case 'decision':
      return 'Decision';
    case 'spike':
      return 'Spike';
    case 'story':
      return 'Story';
    case 'milestone':
      return 'Milestone';
    default:
      return type || '';
  }
}
