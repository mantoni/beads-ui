/**
 * Create a compact, colored badge for an issue type.
 * @param {string | undefined | null} issue_type - One of: bug, feature, task, epic, chore
 * @returns {HTMLSpanElement}
 */
export function createTypeBadge(issue_type) {
  const el = document.createElement('span');
  el.className = 'type-badge';

  const t = (issue_type || '').toString().toLowerCase();
  const KNOWN = new Set(['bug', 'feature', 'task', 'epic', 'chore']);
  const kind = KNOWN.has(t) ? t : 'neutral';
  el.classList.add(`type-badge--${kind}`);
  el.setAttribute('role', 'img');
  const label = KNOWN.has(t)
    ? t === 'bug'
      ? 'Bug'
      : t === 'feature'
        ? 'Feature'
        : t === 'task'
          ? 'Task'
          : t === 'epic'
            ? 'Epic'
            : 'Chore'
    : '—';
  el.setAttribute(
    'aria-label',
    KNOWN.has(t) ? `Issue type: ${label}` : 'Issue type: unknown'
  );
  el.setAttribute('title', KNOWN.has(t) ? `Type: ${label}` : 'Type: unknown');
  el.textContent = label;
  return el;
}
