import { describe, expect, test } from 'vitest';
import { createStatusBadge } from './status-badge.js';

describe('createStatusBadge', () => {
  test('creates badge for open status', () => {
    const badge = createStatusBadge('open');

    expect(badge.tagName).toBe('SPAN');
    expect(badge.className).toContain('status-badge');
    expect(badge.className).toContain('is-open');
    expect(badge.textContent).toBe('Open');
    expect(badge.getAttribute('title')).toBe('Open');
    expect(badge.getAttribute('aria-label')).toBe('Status: Open');
    expect(badge.getAttribute('role')).toBe('img');
  });

  test('creates badge for in_progress status', () => {
    const badge = createStatusBadge('in_progress');

    expect(badge.className).toContain('is-in_progress');
    expect(badge.textContent).toBe('In progress');
    expect(badge.getAttribute('title')).toBe('In progress');
    expect(badge.getAttribute('aria-label')).toBe('Status: In progress');
  });

  test('creates badge for closed status', () => {
    const badge = createStatusBadge('closed');

    expect(badge.className).toContain('is-closed');
    expect(badge.textContent).toBe('Closed');
    expect(badge.getAttribute('title')).toBe('Closed');
    expect(badge.getAttribute('aria-label')).toBe('Status: Closed');
  });

  test('handles null status as open', () => {
    const badge = createStatusBadge(null);

    expect(badge.className).toContain('is-open');
    expect(badge.textContent).toBe('Open');
  });

  test('handles undefined status as open', () => {
    const badge = createStatusBadge(undefined);

    expect(badge.className).toContain('is-open');
    expect(badge.textContent).toBe('Open');
  });

  test('handles unknown status', () => {
    const badge = createStatusBadge('invalid_status');

    expect(badge.className).toContain('is-invalid_status');
    expect(badge.textContent).toBe('Unknown');
    expect(badge.getAttribute('title')).toBe('Unknown');
  });

  test('returns HTMLSpanElement instance', () => {
    const badge = createStatusBadge('open');

    expect(badge instanceof HTMLSpanElement).toBe(true);
  });

  test('accessibility: includes role and aria-label', () => {
    const badge = createStatusBadge('in_progress');

    expect(badge.getAttribute('role')).toBe('img');
    expect(badge.hasAttribute('aria-label')).toBe(true);
  });
});
