/**
 * Create a colored badge for a status value.
 * @param {string | null | undefined} status - 'open' | 'in_progress' | 'closed'
 * @returns {HTMLSpanElement}
 */
export function createStatusBadge(status) {
  const el = document.createElement('span');
  el.className = 'status-badge';
  const s = String(status || 'open');
  el.classList.add(`is-${s}`);
  el.setAttribute('role', 'img');
  el.setAttribute('title', labelForStatus(s));
  el.setAttribute('aria-label', `Status: ${labelForStatus(s)}`);
  el.textContent = labelForStatus(s);
  return el;
}

/**
 * @param {string} s
 */
function labelForStatus(s) {
  switch (s) {
    case 'open':
      return 'Open';
    case 'in_progress':
      return 'In progress';
    case 'closed':
      return 'Closed';
    default:
      return 'Unknown';
  }
}
