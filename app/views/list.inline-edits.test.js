import { describe, expect, test, vi } from 'vitest';
import { createIssuesStore } from '../data/issues-store.js';
import { createSubscriptionStore } from '../data/subscriptions-store.js';
import { createListView } from './list.js';

describe('views/list inline edits', () => {
  test('priority select dispatches update and refreshes row', async () => {
    document.body.innerHTML = '<aside id="mount" class="panel"></aside>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));

    const initial = [
      {
        id: 'UI-1',
        title: 'One',
        status: 'open',
        priority: 1,
        issue_type: 'task'
      },
      {
        id: 'UI-2',
        title: 'Two',
        status: 'open',
        priority: 2,
        issue_type: 'bug'
      }
    ];

    /** @type {{ calls: Array<{ type: string, payload: any }> }} */
    const spy = { calls: [] };
    let current = [...initial];

    /** @type {(type: string, payload?: any) => Promise<any>} */
    const send = vi.fn(async (type, payload) => {
      spy.calls.push({ type, payload });
      // no list-issues requests in push-only mode
      if (type === 'update-priority') {
        // no-op; list refresh happens via show-issue below
        return {};
      }
      if (type === 'show-issue') {
        const id = payload.id;
        const idx = current.findIndex((x) => x.id === id);
        if (idx >= 0) {
          // Return an updated item with a different priority to simulate backend
          const updated = { ...current[idx], priority: 4 };
          // and reflect it into the list that will be rendered after refresh
          current[idx] = updated;
          return updated;
        }
        return null;
      }
      throw new Error('Unexpected');
    });
    const issuesStore = createIssuesStore();
    const subscriptions = createSubscriptionStore(async () => {});
    await subscriptions.subscribeList('tab:issues', { type: 'all-issues' });
    subscriptions._applyDelta('all-issues', {
      added: current.map((i) => i.id),
      updated: [],
      removed: []
    });
    issuesStore._applyEnvelope({
      topic: 'issues',
      revision: 1,
      snapshot: true,
      added: current,
      updated: [],
      removed: []
    });

    const view = createListView(
      mount,
      send,
      undefined,
      undefined,
      issuesStore,
      subscriptions
    );
    await view.load();

    const firstRow = /** @type {HTMLElement} */ (
      mount.querySelector('tr.issue-row[data-issue-id="UI-1"]')
    );
    expect(firstRow).toBeTruthy();
    const prio = /** @type {HTMLSelectElement} */ (
      firstRow.querySelector('select.badge--priority')
    );
    expect(prio.value).toBe('1');

    // Change to a different priority; handler should call update-priority then show-issue
    prio.value = '4';
    prio.dispatchEvent(new Event('change'));

    await Promise.resolve();

    const types = spy.calls.map((c) => c.type);
    expect(types).toContain('update-priority');
    expect(types).toContain('show-issue');

    const prio2 = /** @type {HTMLSelectElement} */ (
      mount.querySelector(
        'tr.issue-row[data-issue-id="UI-1"] select.badge--priority'
      )
    );
    expect(prio2.value).toBe('4');
  });
});
