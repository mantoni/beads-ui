import { describe, expect, test } from 'vitest';
import {
  SETTABLE_STATUSES,
  STATUSES,
  isSettableStatus,
  statusLabel,
  statusOptions
} from './status.js';

describe('utils/status', () => {
  test('STATUSES lists every bd status in canonical order', () => {
    expect(STATUSES).toEqual([
      'open',
      'in_progress',
      'blocked',
      'deferred',
      'closed',
      'pinned',
      'hooked'
    ]);
  });

  test('SETTABLE_STATUSES omits the machine-managed statuses', () => {
    expect(SETTABLE_STATUSES).toEqual([
      'open',
      'in_progress',
      'blocked',
      'deferred',
      'closed'
    ]);
    expect(SETTABLE_STATUSES).not.toContain('pinned');
    expect(SETTABLE_STATUSES).not.toContain('hooked');
    for (const s of SETTABLE_STATUSES) {
      expect(STATUSES).toContain(s);
    }
  });

  test('labels every known status', () => {
    const labels = [
      ['open', 'Open'],
      ['in_progress', 'In progress'],
      ['blocked', 'Blocked'],
      ['deferred', 'Deferred'],
      ['closed', 'Closed'],
      ['pinned', 'Pinned'],
      ['hooked', 'Hooked']
    ];
    for (const [status, label] of labels) {
      expect(statusLabel(status)).toBe(label);
    }
  });

  test('titleizes unknown statuses instead of masquerading as Open', () => {
    expect(statusLabel('in_review')).toBe('In review');
    expect(statusLabel('wibble')).toBe('Wibble');
  });

  test('reports missing status as Unknown, never Open', () => {
    expect(statusLabel('')).toBe('Unknown');
    expect(statusLabel(null)).toBe('Unknown');
    expect(statusLabel(undefined)).toBe('Unknown');
  });

  test('statusOptions offers the settable statuses', () => {
    expect(statusOptions('open')).toEqual(SETTABLE_STATUSES);
    expect(statusOptions('')).toEqual(SETTABLE_STATUSES);
    expect(statusOptions(undefined)).toEqual(SETTABLE_STATUSES);
  });

  test('statusOptions appends a current status outside the settable set', () => {
    expect(statusOptions('pinned')).toEqual([...SETTABLE_STATUSES, 'pinned']);
    expect(statusOptions('hooked')).toEqual([...SETTABLE_STATUSES, 'hooked']);
  });

  test('isSettableStatus gates exactly the human-settable statuses', () => {
    /** @type {readonly string[]} */
    const settable = SETTABLE_STATUSES;
    for (const s of STATUSES) {
      expect(isSettableStatus(s)).toBe(settable.includes(s));
    }
    expect(isSettableStatus('pinned')).toBe(false);
    expect(isSettableStatus('hooked')).toBe(false);
    expect(isSettableStatus('in_review')).toBe(false);
    expect(isSettableStatus('')).toBe(false);
  });
});
