import { describe, expect, test, vi } from 'vitest';
import { createSubscriptionIssueStores } from './subscription-issue-stores.js';

/** Wait for coalesced store notifications. */
async function flushStoreNotifications() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('subscription issue stores', () => {
  test('reports the changed subscription id', async () => {
    const stores = createSubscriptionIssueStores();
    stores.register('list:a', { type: 'all-issues' });
    const listener = vi.fn();
    stores.subscribe(listener);

    stores.getStore('list:a')?.applyPush({
      type: 'snapshot',
      id: 'list:a',
      revision: 1,
      issues: []
    });
    await flushStoreNotifications();

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith('list:a');
  });

  test('notifies scoped listeners only for selected subscriptions', async () => {
    const stores = createSubscriptionIssueStores();
    stores.register('list:a', { type: 'all-issues' });
    stores.register('list:b', { type: 'ready-issues' });
    const listener = vi.fn();
    stores.subscribeFor('list:b', listener);

    stores.getStore('list:a')?.applyPush({
      type: 'snapshot',
      id: 'list:a',
      revision: 1,
      issues: []
    });
    await flushStoreNotifications();
    expect(listener).not.toHaveBeenCalled();

    stores.getStore('list:b')?.applyPush({
      type: 'snapshot',
      id: 'list:b',
      revision: 1,
      issues: []
    });
    await flushStoreNotifications();

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith('list:b');
  });
});
