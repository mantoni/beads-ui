import { describe, expect, test, vi } from 'vitest';
import { createDetailView, formatDateValue } from './detail.js';

/** @type {(impl: (type: string, payload?: unknown) => Promise<any>) => (type: string, payload?: unknown) => Promise<any>} */
const mockSend = (impl) => vi.fn(impl);

/**
 * Mount the detail view with a given issue object and return the mount element.
 *
 * @param {Record<string, unknown> & { id: string }} issue
 * @returns {Promise<HTMLElement>}
 */
async function mountIssue(issue) {
  document.body.innerHTML =
    '<section class="panel"><div id="mount"></div></section>';
  const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
  const client_id = `detail:${issue.id}`;
  const stores = {
    /** @param {string} id */
    snapshotFor(id) {
      return id === client_id ? [issue] : [];
    },
    subscribe() {
      return () => {};
    }
  };
  const send = mockSend(async () => {
    throw new Error('Unexpected send');
  });
  const view = createDetailView(mount, send, undefined, stores);
  await view.load(issue.id);
  return mount;
}

/**
 * Find the Dates card root element.
 *
 * @param {HTMLElement} mount
 * @returns {Element | null}
 */
function datesCard(mount) {
  const titles = Array.from(mount.querySelectorAll('.props-card__title'));
  const title = titles.find((t) => t.textContent === 'Dates');
  return title ? title.closest('.props-card') : null;
}

/**
 * Return the value text for a labeled row inside the Dates card.
 *
 * @param {Element} card
 * @param {string} label
 * @returns {string | null}
 */
function rowValue(card, label) {
  const rows = Array.from(card.querySelectorAll('.prop'));
  for (const row of rows) {
    const l = row.querySelector('.label');
    if (l && l.textContent === label) {
      const v = row.querySelector('.value');
      return v ? (v.textContent || '').trim() : '';
    }
  }
  return null;
}

describe('formatDateValue', () => {
  test('formats a numeric epoch-ms timestamp', () => {
    // 2026-06-15T12:00:00Z — mid-day UTC, day stable across timezones
    const ms = Date.parse('2026-06-15T12:00:00Z');
    const out = formatDateValue(ms);
    expect(out).toContain('2026');
    expect(out).toContain('Jun');
    expect(out).toContain('15');
  });

  test('formats an ISO string', () => {
    const out = formatDateValue('2026-06-15T12:00:00Z');
    expect(out).toContain('2026');
    expect(out).toContain('Jun');
    expect(out).toContain('15');
  });

  test('numeric and ISO inputs for the same instant agree', () => {
    const iso = '2026-06-15T12:00:00Z';
    expect(formatDateValue(Date.parse(iso))).toBe(formatDateValue(iso));
  });

  test('returns empty string for missing values', () => {
    expect(formatDateValue(null)).toBe('');
    expect(formatDateValue(undefined)).toBe('');
  });
});

describe('views/detail Dates card', () => {
  test('Created and Updated always render with formatted dates', async () => {
    const mount = await mountIssue({
      id: 'UI-200',
      title: 'D',
      status: 'open',
      priority: 2,
      created_at: Date.parse('2026-03-27T18:11:00Z'),
      updated_at: Date.parse('2026-03-28T09:00:00Z')
    });
    const card = datesCard(mount);
    expect(card).toBeTruthy();
    const created = rowValue(/** @type {Element} */ (card), 'Created');
    const updated = rowValue(/** @type {Element} */ (card), 'Updated');
    expect(created).toContain('2026');
    expect(created).toContain('Mar');
    expect(created).toContain('27');
    expect(updated).toContain('2026');
    expect(updated).toContain('Mar');
    expect(updated).toContain('28');
  });

  test('Started renders only when started_at present', async () => {
    const withStart = await mountIssue({
      id: 'UI-201',
      title: 'D',
      status: 'in_progress',
      created_at: Date.parse('2026-03-27T18:11:00Z'),
      updated_at: Date.parse('2026-03-28T09:00:00Z'),
      started_at: '2026-03-27T20:00:00Z'
    });
    const card1 = /** @type {Element} */ (datesCard(withStart));
    expect(rowValue(card1, 'Started')).toContain('Mar');

    const withoutStart = await mountIssue({
      id: 'UI-202',
      title: 'D',
      status: 'open',
      created_at: Date.parse('2026-03-27T18:11:00Z'),
      updated_at: Date.parse('2026-03-28T09:00:00Z')
    });
    const card2 = /** @type {Element} */ (datesCard(withoutStart));
    expect(rowValue(card2, 'Started')).toBeNull();
  });

  test('Closed renders the date only (reason lives in Properties) and is absent when open', async () => {
    const closed = await mountIssue({
      id: 'UI-203',
      title: 'D',
      status: 'closed',
      created_at: Date.parse('2026-03-27T18:11:00Z'),
      updated_at: Date.parse('2026-03-28T09:00:00Z'),
      closed_at: Date.parse('2026-03-28T10:00:00Z'),
      close_reason: 'Done'
    });
    const card1 = /** @type {Element} */ (datesCard(closed));
    const closedVal = /** @type {string} */ (rowValue(card1, 'Closed'));
    expect(closedVal).toContain('Mar');
    // Close reason is shown in the Properties card, not duplicated here.
    expect(closedVal).not.toContain('Done');
    expect(closedVal).not.toContain('—');

    const open = await mountIssue({
      id: 'UI-204',
      title: 'D',
      status: 'open',
      created_at: Date.parse('2026-03-27T18:11:00Z'),
      updated_at: Date.parse('2026-03-28T09:00:00Z')
    });
    const card2 = /** @type {Element} */ (datesCard(open));
    expect(rowValue(card2, 'Closed')).toBeNull();
  });

  test('Closed without close_reason shows just the date', async () => {
    const closed = await mountIssue({
      id: 'UI-205',
      title: 'D',
      status: 'closed',
      created_at: Date.parse('2026-03-27T18:11:00Z'),
      updated_at: Date.parse('2026-03-28T09:00:00Z'),
      closed_at: Date.parse('2026-03-28T10:00:00Z'),
      close_reason: null
    });
    const card = /** @type {Element} */ (datesCard(closed));
    const closedVal = /** @type {string} */ (rowValue(card, 'Closed'));
    expect(closedVal).toContain('Mar');
    expect(closedVal).not.toContain('—');
  });

  test('Deferred until renders only when defer_until set', async () => {
    const deferred = await mountIssue({
      id: 'UI-206',
      title: 'D',
      status: 'open',
      created_at: Date.parse('2026-03-27T18:11:00Z'),
      updated_at: Date.parse('2026-03-28T09:00:00Z'),
      defer_until: '2026-04-01T12:00:00Z'
    });
    const card1 = /** @type {Element} */ (datesCard(deferred));
    expect(rowValue(card1, 'Deferred until')).toContain('Apr');

    const notDeferred = await mountIssue({
      id: 'UI-207',
      title: 'D',
      status: 'open',
      created_at: Date.parse('2026-03-27T18:11:00Z'),
      updated_at: Date.parse('2026-03-28T09:00:00Z')
    });
    const card2 = /** @type {Element} */ (datesCard(notDeferred));
    expect(rowValue(card2, 'Deferred until')).toBeNull();
  });
});
