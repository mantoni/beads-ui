import { statusLabel } from './status.js';

/**
 * Create a colored badge for a status value.
 *
 * @param {string | null | undefined} status - Any status bd can report.
 * @returns {HTMLSpanElement}
 */
export function createStatusBadge(status) {
  const el = document.createElement('span');
  el.className = 'status-badge';
  const s = String(status || 'open');
  const label = statusLabel(s);
  el.classList.add(`is-${s}`);
  el.setAttribute('role', 'img');
  el.setAttribute('title', label);
  el.setAttribute('aria-label', `Status: ${label}`);
  el.textContent = label;
  return el;
}
