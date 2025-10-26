import { describe, expect, test } from 'vitest';
import { createTypeBadge } from './type-badge.js';

describe('utils/type-badge', () => {
  test('renders known types with modifier class and accessible labels', () => {
    const types = [
      ['bug', 'Bug'],
      ['feature', 'Feature'],
      ['task', 'Task'],
      ['epic', 'Epic'],
      ['chore', 'Chore']
    ];
    for (const [t, label] of types) {
      const el = createTypeBadge(t);
      expect(el.classList.contains('type-badge')).toBe(true);
      expect(el.classList.contains(`type-badge--${t}`)).toBe(true);
      expect(el.getAttribute('role')).toBe('img');
      const aria = el.getAttribute('aria-label') || '';
      expect(aria.toLowerCase()).toContain('issue type');
      expect(aria).toContain(label);
      expect(el.textContent).toBe(label);
    }
  });

  test('falls back to neutral for unknown types', () => {
    const el = createTypeBadge('unknown');
    expect(el.classList.contains('type-badge--neutral')).toBe(true);
    expect(el.textContent).toBe('—');
  });
});
