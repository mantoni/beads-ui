import { describe, expect, test } from 'vitest';
import { createSubscriptionIssueStores } from './data/subscription-issue-stores.js';
import { createDetailView } from './views/detail.js';

describe('detail view via subscription push', () => {
  test('renders snapshot from detail:<id> store', async () => {
    document.body.innerHTML = '<section id="mount"></section>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));

    const issueStores = createSubscriptionIssueStores();
    const view = createDetailView(
      mount,
      // sendFn not used for load in push mode
      async () => ({}),
      (hash) => (window.location.hash = hash),
      issueStores
    );

    await view.load('UI-1');

    // Register store and push a snapshot for detail subscription
    issueStores.register('detail:UI-1', {
      type: 'issue-detail',
      params: { id: 'UI-1' }
    });

    const store = issueStores.getStore('detail:UI-1');
    expect(store).not.toBeNull();
    store?.applyPush({
      type: 'snapshot',
      id: 'detail:UI-1',
      revision: 1,
      issues: [
        {
          id: 'UI-1',
          title: 'A title',
          status: 'open',
          priority: 2,
          created_at: 1700000000000,
          updated_at: 1700000000000,
          closed_at: 0
        }
      ]
    });

    // Expect title to appear in the detail view
    const h2 = mount.querySelector('#detail-root h2');
    expect(h2?.textContent || '').toContain('A title');
  });
});
