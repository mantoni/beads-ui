import { describe, expect, test } from 'vitest';
import { formatDateShort, formatDateValue } from './date-format.js';

describe('utils/date-format formatDateShort', () => {
  test('formats a numeric epoch-ms timestamp as a compact date', () => {
    const ms = Date.parse('2026-06-15T12:00:00Z');

    const out = formatDateShort(ms);

    expect(out).toContain('2026');
    expect(out).toContain('Jun');
    expect(out).toContain('15');
  });

  test('formats an ISO string identically to the numeric instant', () => {
    const iso = '2026-06-15T12:00:00Z';

    expect(formatDateShort(iso)).toBe(formatDateShort(Date.parse(iso)));
  });

  test('returns empty string for missing values', () => {
    expect(formatDateShort(null)).toBe('');
    expect(formatDateShort(undefined)).toBe('');
    expect(formatDateShort('')).toBe('');
  });

  test('returns empty string for an unparseable value', () => {
    expect(formatDateShort('not-a-date')).toBe('');
  });

  test('renders the bd zero-time sentinel as empty, not "Jan 1, 1"', () => {
    // Unenriched epic children carry Go's zero time; it must not render.
    expect(formatDateShort('0001-01-01T00:00:00Z')).toBe('');
  });
});

describe('utils/date-format formatDateValue', () => {
  test('renders the bd zero-time sentinel as empty', () => {
    expect(formatDateValue('0001-01-01T00:00:00Z')).toBe('');
  });
});
