import { describe, expect, test } from 'vitest';
import { createIssuesStore } from '../data/issues-store.js';
import { createSubscriptionStore } from '../data/subscriptions-store.js';
import { createBoardView } from './board.js';

describe('views/board closed filter', () => {
  test('filters closed issues by timeframe and sorts by closed_at', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));

    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    const issues = [
      {
        id: 'C-1',
        title: 'four days',
        closed_at: new Date(now - 4 * oneDay).toISOString()
      },
      {
        id: 'C-2',
        title: 'yesterday',
        closed_at: new Date(now - 1 * oneDay).toISOString()
      },
      { id: 'C-3', title: 'today', closed_at: new Date(now).toISOString() }
    ];
    const issuesStore = createIssuesStore();
    const subscriptions = createSubscriptionStore(async () => {});
    await subscriptions.subscribeList('tab:board:closed', {
      type: 'closed-issues'
    });
    subscriptions._applyDelta('closed-issues', {
      added: issues.map((i) => i.id),
      updated: [],
      removed: []
    });
    issuesStore._applyEnvelope({
      topic: 'issues',
      revision: 1,
      snapshot: true,
      added: issues,
      updated: [],
      removed: []
    });

    const view = createBoardView(
      mount,
      null,
      () => {},
      undefined,
      issuesStore,
      subscriptions
    );
    await view.load();

    // Default filter: Today → only C-3 visible
    let closed_ids = Array.from(
      mount.querySelectorAll('#closed-col .board-card .mono')
    ).map((el) => el.textContent?.trim());
    expect(closed_ids).toEqual(['#3']);

    // Change to Last 3 days → C-3 (today) and C-2 (yesterday)
    const select = /** @type {HTMLSelectElement} */ (
      mount.querySelector('#closed-filter')
    );
    select.value = '3';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    closed_ids = Array.from(
      mount.querySelectorAll('#closed-col .board-card .mono')
    ).map((el) => el.textContent?.trim());
    expect(closed_ids).toEqual(['#3', '#2']);

    // Change to Last 7 days → all three, sorted by closed_at desc
    select.value = '7';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    closed_ids = Array.from(
      mount.querySelectorAll('#closed-col .board-card .mono')
    ).map((el) => el.textContent?.trim());
    expect(closed_ids).toEqual(['#3', '#2', '#1']);
  });
});
