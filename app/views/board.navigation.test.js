import { describe, expect, test } from 'vitest';
import { createIssuesStore } from '../data/issues-store.js';
import { createSubscriptionStore } from '../data/subscriptions-store.js';
import { createBoardView } from './board.js';

describe('views/board keyboard navigation', () => {
  test('ArrowUp/ArrowDown move within column', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));

    const issues = [
      { id: 'P-1', title: 'p1', updated_at: '2025-10-23T10:00:00.000Z' },
      { id: 'P-2', title: 'p2', updated_at: '2025-10-23T09:00:00.000Z' }
    ];
    const issuesStore = createIssuesStore();
    const subscriptions = createSubscriptionStore(async () => {});
    await subscriptions.subscribeList('tab:board:in-progress', {
      type: 'in-progress-issues'
    });
    subscriptions._applyDelta('in-progress-issues', {
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

    const first = /** @type {HTMLElement} */ (
      mount.querySelector('#in-progress-col .board-card')
    );
    const second = /** @type {HTMLElement} */ (
      mount.querySelectorAll('#in-progress-col .board-card')[1]
    );
    first.focus();
    expect(document.activeElement).toBe(first);

    first.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })
    );
    expect(document.activeElement).toBe(second);

    second.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })
    );
    expect(document.activeElement).toBe(first);
  });

  test('ArrowLeft/ArrowRight jump to top card in adjacent non-empty column, skipping empty', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));

    const issues = [
      { id: 'B-1', title: 'b1', updated_at: '2025-10-23T10:00:00.000Z' },
      { id: 'P-1', title: 'p1', updated_at: '2025-10-23T10:00:00.000Z' },
      { id: 'P-2', title: 'p2', updated_at: '2025-10-23T09:00:00.000Z' }
    ];
    const issuesStore = createIssuesStore();
    const subscriptions = createSubscriptionStore(async () => {});
    await subscriptions.subscribeList('tab:board:ready', {
      type: 'ready-issues'
    });
    await subscriptions.subscribeList('tab:board:blocked', {
      type: 'blocked-issues'
    });
    await subscriptions.subscribeList('tab:board:in-progress', {
      type: 'in-progress-issues'
    });
    subscriptions._applyDelta('blocked-issues', {
      added: ['B-1'],
      updated: [],
      removed: []
    });
    subscriptions._applyDelta('in-progress-issues', {
      added: ['P-1', 'P-2'],
      updated: [],
      removed: []
    });
    // ready remains empty (skipped)
    issuesStore._applyEnvelope({
      topic: 'issues',
      revision: 1,
      snapshot: true,
      added: issues,
      updated: [],
      removed: []
    });

    /** @type {string[]} */
    const opened = [];
    const view = createBoardView(
      mount,
      null,
      (id) => {
        opened.push(id);
      },
      undefined,
      issuesStore,
      subscriptions
    );
    await view.load();

    const open_first = /** @type {HTMLElement} */ (
      mount.querySelector('#blocked-col .board-card')
    );
    const prog_first = /** @type {HTMLElement} */ (
      mount.querySelector('#in-progress-col .board-card')
    );
    open_first.focus();
    open_first.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
    );
    expect(document.activeElement).toBe(prog_first);

    // Enter opens the details (via goto_issue callback)
    prog_first.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    );
    expect(opened).toEqual(['P-1']);

    // Space also opens
    prog_first.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', bubbles: true })
    );
    expect(opened).toEqual(['P-1', 'P-1']);
  });
});
