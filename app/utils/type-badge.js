import { ISSUE_TYPES, typeLabel } from './issue-type.js';

/**
 * Create a compact, colored badge for an issue type.
 *
 * @param {string | undefined | null} issue_type - Built-in or custom issue type.
 * @returns {HTMLSpanElement}
 */
export function createTypeBadge(issue_type) {
  const el = document.createElement('span');
  el.className = 'type-badge';

  const t = (issue_type || '').toString().toLowerCase();
  const KNOWN = new Set(ISSUE_TYPES);
  const kind = KNOWN.has(t) ? t : 'neutral';
  el.classList.add(`type-badge--${kind}`);
  el.setAttribute('role', 'img');
  const label = typeLabel(issue_type) || '—';
  el.setAttribute(
    'aria-label',
    issue_type ? `Issue type: ${label}` : 'Issue type: unknown'
  );
  el.setAttribute('title', issue_type ? `Type: ${label}` : 'Type: unknown');
  el.textContent = label;
  return el;
}
