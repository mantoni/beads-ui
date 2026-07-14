import { describe, expect, test } from 'vitest';
import { createStatusBadge } from './status-badge.js';

describe('utils/status-badge', () => {
  test('renders every bd status with modifier class and accessible labels', () => {
    const statuses = [
      ['open', 'Open'],
      ['in_progress', 'In progress'],
      ['blocked', 'Blocked'],
      ['deferred', 'Deferred'],
      ['closed', 'Closed'],
      ['pinned', 'Pinned'],
      ['hooked', 'Hooked']
    ];
    for (const [s, label] of statuses) {
      const el = createStatusBadge(s);
      expect(el.classList.contains('status-badge')).toBe(true);
      expect(el.classList.contains(`is-${s}`)).toBe(true);
      expect(el.getAttribute('role')).toBe('img');
      expect(el.getAttribute('aria-label')).toBe(`Status: ${label}`);
      expect(el.textContent).toBe(label);
    }
  });
});
