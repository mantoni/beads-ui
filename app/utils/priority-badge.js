import { priority_levels } from './priority.js';

/**
 * Create a colored badge for a priority value (0..4).
 * @param {number | null | undefined} priority
 * @returns {HTMLSpanElement}
 */
export function createPriorityBadge(priority) {
  const p = typeof priority === 'number' ? priority : 2;
  const el = document.createElement('span');
  el.className = 'priority-badge';
  el.classList.add(`is-p${Math.max(0, Math.min(4, p))}`);
  el.setAttribute('role', 'img');
  const label = labelForPriority(p);
  el.setAttribute('title', label);
  el.setAttribute('aria-label', `Priority: ${label}`);
  el.textContent = emojiForPriority(p) + ' ' + label;
  return el;
}

/**
 * @param {number} p
 */
function labelForPriority(p) {
  const i = Math.max(0, Math.min(4, p));
  return priority_levels[i] || 'Medium';
}

/**
 * @param {number} p
 */
export function emojiForPriority(p) {
  switch (p) {
    case 0:
      return '🔥';
    case 1:
      return '⚡️';
    case 2:
      return '🔧';
    case 3:
      return '🪶';
    case 4:
      return '💤';
    default:
      return '🔧';
  }
}
