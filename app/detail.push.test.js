import { describe, expect, test } from 'vitest';
import { createSubscriptionIssueStores } from './data/subscription-issue-stores.js';
import { createDetailView } from './views/detail.js';

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function deferred() {
  /** @type {(value: unknown) => void} */
  let resolve = () => {};
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/**
 * @param {number} id
 * @param {string} text
 * @param {string} [created_at]
 */
function comment(id, text, created_at = '2026-06-15T00:00:00Z') {
  return {
    id,
    author: 'Fetched',
    text,
    created_at
  };
}

/**
 * @param {string} id
 * @param {Record<string, unknown>} [fields]
 */
function issue(id, fields = {}) {
  return {
    id,
    title: 'Original',
    comment_count: 1,
    created_at: 1700000000000,
    updated_at: 1700000000000,
    closed_at: 0,
    ...fields
  };
}

/**
 * @param {any} store
 * @param {string} id
 * @param {Record<string, unknown>} [fields]
 */
function pushSnapshot(store, id, fields = {}) {
  store.applyPush({
    type: 'snapshot',
    id: `detail:${id}`,
    revision: 1,
    issues: [issue(id, fields)]
  });
}

/**
 * @param {any} store
 * @param {string} id
 * @param {number} revision
 * @param {Record<string, unknown>} [fields]
 */
function pushUpsert(store, id, revision, fields = {}) {
  store.applyPush({
    type: 'upsert',
    id: `detail:${id}`,
    revision,
    issue: issue(id, {
      updated_at: 1700000000000 + revision * 1000,
      ...fields
    })
  });
}

/**
 * @param {string} id
 * @param {(type: string, payload?: unknown) => Promise<unknown>} sendFn
 */
async function setupDetail(id, sendFn) {
  document.body.innerHTML = '<section id="mount"></section>';
  const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
  const issueStores = createSubscriptionIssueStores();
  const view = createDetailView(
    mount,
    sendFn,
    (hash) => (window.location.hash = hash),
    issueStores
  );

  await view.load(id);
  issueStores.register(`detail:${id}`, {
    type: 'issue-detail',
    params: { id }
  });
  const store = issueStores.getStore(`detail:${id}`);
  expect(store).not.toBeNull();
  return {
    mount,
    store: /** @type {NonNullable<typeof store>} */ (store),
    view,
    issueStores
  };
}

describe('detail view via subscription push', () => {
  test('renders snapshot from detail:<id> store', async () => {
    const { mount, store } = await setupDetail('UI-1', async () => ({}));
    pushSnapshot(store, 'UI-1', {
      title: 'A title',
      status: 'open',
      priority: 2
    });

    // Expect title to appear in the detail view
    const h2 = mount.querySelector('#detail-root h2');
    expect(h2?.textContent || '').toContain('A title');
  });

  test('fetches comments after delayed detail snapshot arrives', async () => {
    /** @type {Array<{type: string, payload: unknown}>} */
    const calls = [];

    const { mount, store } = await setupDetail(
      'UI-2',
      async (type, payload) => {
        calls.push({ type, payload });
        if (type === 'get-comments') {
          return [comment(1, 'Fetched comment')];
        }
        return {};
      }
    );

    pushSnapshot(store, 'UI-2', {
      title: 'Delayed title'
    });
    await tick();

    expect(calls).toEqual([{ type: 'get-comments', payload: { id: 'UI-2' } }]);
    expect(mount.querySelectorAll('.comment-item').length).toBe(1);
    expect(mount.textContent).toContain('Fetched comment');
  });

  test('keeps comments after later detail update omits comments', async () => {
    let fetch_count = 0;

    const { mount, store } = await setupDetail('UI-3', async (type) => {
      if (type === 'get-comments') {
        fetch_count += 1;
        return [comment(1, 'Persistent comment')];
      }
      return {};
    });

    pushSnapshot(store, 'UI-3');
    await tick();

    pushUpsert(store, 'UI-3', 2, {
      title: 'Updated'
    });
    await tick();

    expect(fetch_count).toBe(1);
    expect(mount.textContent).toContain('Updated');
    expect(mount.textContent).toContain('Persistent comment');
  });

  test('refetches comments when comment count changes', async () => {
    let fetch_count = 0;

    const { mount, store } = await setupDetail('UI-4', async (type) => {
      if (type === 'get-comments') {
        fetch_count += 1;
        return fetch_count === 1
          ? [comment(1, 'First comment')]
          : [
              comment(1, 'First comment'),
              comment(2, 'Second comment', '2026-06-15T00:01:00Z')
            ];
      }
      return {};
    });

    pushSnapshot(store, 'UI-4');
    await tick();

    pushUpsert(store, 'UI-4', 2, {
      title: 'Updated',
      comment_count: 2
    });
    await tick();

    expect(fetch_count).toBe(2);
    expect(mount.querySelectorAll('.comment-item').length).toBe(2);
    expect(mount.textContent).toContain('Second comment');
  });

  test('keeps comments until count-matching refetch succeeds', async () => {
    let fetch_count = 0;

    const { mount, store } = await setupDetail('UI-4B', async (type) => {
      if (type === 'get-comments') {
        fetch_count += 1;
        if (fetch_count === 1) {
          return [comment(1, 'Original comment')];
        }
        if (fetch_count === 2) {
          return [comment(1, 'Incomplete replacement')];
        }
        return [
          comment(1, 'Original comment'),
          comment(2, 'Complete replacement', '2026-06-15T00:01:00Z')
        ];
      }
      return {};
    });

    pushSnapshot(store, 'UI-4B');
    await tick();

    pushUpsert(store, 'UI-4B', 2, {
      title: 'Count changed',
      comment_count: 2
    });
    await tick();

    expect(fetch_count).toBe(2);
    expect(mount.textContent).toContain('Original comment');
    expect(mount.textContent).not.toContain('Incomplete replacement');

    pushUpsert(store, 'UI-4B', 3, {
      title: 'Count still changed',
      comment_count: 2
    });
    await tick();

    expect(fetch_count).toBe(3);
    expect(mount.textContent).toContain('Complete replacement');
  });

  test('retries comments after failed fetch clears in-flight state', async () => {
    let fetch_count = 0;

    const { mount, store } = await setupDetail('UI-5', async (type) => {
      if (type === 'get-comments') {
        fetch_count += 1;
        if (fetch_count === 1) {
          throw new Error('temporary failure');
        }
        return [comment(1, 'Recovered comment')];
      }
      return {};
    });

    pushSnapshot(store, 'UI-5');
    await tick();

    pushUpsert(store, 'UI-5', 2, {
      title: 'Retry'
    });
    await tick();

    expect(fetch_count).toBe(2);
    expect(mount.textContent).toContain('Recovered comment');
  });

  test('retries comments after non-array response', async () => {
    let fetch_count = 0;

    const { mount, store } = await setupDetail('UI-5B', async (type) => {
      if (type === 'get-comments') {
        fetch_count += 1;
        if (fetch_count === 1) {
          return { error: 'not ready' };
        }
        return [comment(1, 'Recovered array comment')];
      }
      return {};
    });

    pushSnapshot(store, 'UI-5B');
    await tick();

    pushUpsert(store, 'UI-5B', 2, {
      title: 'Retry'
    });
    await tick();

    expect(fetch_count).toBe(2);
    expect(mount.textContent).toContain('Recovered array comment');
  });

  test('discards stale comment response after issue switch', async () => {
    const slow = deferred();

    const { mount, view, issueStores } = await setupDetail(
      'UI-6A',
      async (type, payload) => {
        if (type === 'get-comments') {
          const id = /** @type {{ id: string }} */ (payload).id;
          if (id === 'UI-6A') {
            return slow.promise;
          }
          return [comment(2, 'Active issue comment', '2026-06-15T00:01:00Z')];
        }
        return {};
      }
    );

    const store_a = issueStores.getStore('detail:UI-6A');
    expect(store_a).not.toBeNull();
    pushSnapshot(
      /** @type {NonNullable<typeof store_a>} */ (store_a),
      'UI-6A',
      {
        title: 'Slow issue'
      }
    );
    await tick();

    await view.load('UI-6B');
    issueStores.register('detail:UI-6B', {
      type: 'issue-detail',
      params: { id: 'UI-6B' }
    });
    const store_b = issueStores.getStore('detail:UI-6B');
    expect(store_b).not.toBeNull();
    pushSnapshot(
      /** @type {NonNullable<typeof store_b>} */ (store_b),
      'UI-6B',
      {
        title: 'Active issue'
      }
    );
    await tick();

    slow.resolve([comment(1, 'Stale issue comment')]);
    await tick();

    expect(mount.textContent).toContain('Active issue');
    expect(mount.textContent).toContain('Active issue comment');
    expect(mount.textContent).not.toContain('Stale issue comment');
  });
});
