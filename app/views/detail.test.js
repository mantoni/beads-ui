import { describe, expect, test } from 'vitest';
import { createDetailView } from './detail.js';

describe('views/detail', () => {
  test('renders fields, markdown description, and dependency links', async () => {
    document.body.innerHTML =
      '<section class="panel"><div id="mount"></div></section>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));

    const issue = {
      id: 'UI-29',
      title: 'Issue detail view',
      description:
        '# Heading\n\nImplement detail view with a [link](https://example.com) and `code`.',
      status: 'open',
      priority: 2,
      dependencies: [{ id: 'UI-25' }, { id: 'UI-27' }],
      dependents: [{ id: 'UI-34' }]
    };

    /** @type {string[]} */
    const navigations = [];
    const stores = {
      /** @param {string} id */
      snapshotFor(id) {
        return id === 'detail:UI-29' ? [issue] : [];
      },
      subscribe() {
        return () => {};
      }
    };
    const view = createDetailView(
      mount,
      async () => ({}),
      (hash) => {
        navigations.push(hash);
      },
      stores
    );

    await view.load('UI-29');

    // ID is no longer rendered within detail view; the dialog title shows it
    const titleSpan = /** @type {HTMLSpanElement} */ (
      mount.querySelector('h2 .editable')
    );
    expect(titleSpan.textContent).toBe('Issue detail view');
    // status select + priority select exist
    const selects = mount.querySelectorAll('select');
    expect(selects.length).toBeGreaterThanOrEqual(2);
    // description rendered as markdown in read mode
    const md = /** @type {HTMLDivElement} */ (mount.querySelector('.md'));
    expect(md).toBeTruthy();
    const a = /** @type {HTMLAnchorElement|null} */ (md.querySelector('a'));
    expect(a && a.getAttribute('href')).toBe('https://example.com');
    const code = md.querySelector('code');
    expect(code && code.textContent).toBe('code');

    const links = mount.querySelectorAll('li');
    const hrefs = Array.from(links)
      .map((a) => a.dataset.href)
      .filter(Boolean);
    expect(hrefs).toEqual([
      '#/issues?issue=UI-25',
      '#/issues?issue=UI-27',
      '#/issues?issue=UI-34'
    ]);

    // No description textarea in read mode (only comment input textarea should exist)
    const descInput0 = /** @type {HTMLTextAreaElement|null} */ (
      mount.querySelector('.description textarea')
    );
    expect(descInput0).toBeNull();

    // Simulate clicking the first internal link, ensure navigate_fn is used
    links[0].click();
    expect(navigations[navigations.length - 1]).toBe('#/issues?issue=UI-25');
  });

  test('renders type in Properties sidebar', async () => {
    document.body.innerHTML =
      '<section class="panel"><div id="mount"></div></section>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
    const issue = {
      id: 'UI-50',
      title: 'With type',
      issue_type: 'feature',
      dependencies: [],
      dependents: []
    };
    const stores = {
      /** @param {string} id */
      snapshotFor(id) {
        return id === 'detail:UI-50' ? [issue] : [];
      },
      subscribe() {
        return () => {};
      }
    };
    const view = createDetailView(mount, async () => ({}), undefined, stores);
    await view.load('UI-50');
    const badge = mount.querySelector('.props-card .type-badge');
    expect(badge).toBeTruthy();
    expect(badge && badge.textContent).toBe('Feature');
  });

  test('inline editing toggles for title and description', async () => {
    document.body.innerHTML =
      '<section class="panel"><div id="mount"></div></section>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));

    const issue = {
      id: 'UI-29',
      title: 'Issue detail view',
      description: 'Some text',
      status: 'open',
      priority: 2,
      dependencies: [],
      dependents: []
    };

    const stores = {
      /** @param {string} id */
      snapshotFor(id) {
        return id === 'detail:UI-29' ? [issue] : [];
      },
      subscribe() {
        return () => {};
      }
    };
    const view = createDetailView(
      mount,
      async (type, payload) => {
        if (type === 'edit-text') {
          const f = /** @type {any} */ (payload).field;
          const v = /** @type {any} */ (payload).value;
          /** @type {any} */ (issue)[f] = v;
          return issue;
        }
        throw new Error('Unexpected type');
      },
      undefined,
      stores
    );

    await view.load('UI-29');

    // Title: click to edit -> input appears, Esc cancels
    const titleSpan = /** @type {HTMLSpanElement} */ (
      mount.querySelector('h2 .editable')
    );
    titleSpan.click();
    let titleInput = /** @type {HTMLInputElement} */ (
      mount.querySelector('h2 input')
    );
    expect(titleInput).toBeTruthy();
    const esc = new KeyboardEvent('keydown', { key: 'Escape' });
    titleInput.dispatchEvent(esc);
    expect(
      /** @type {HTMLInputElement|null} */ (mount.querySelector('h2 input'))
    ).toBeNull();

    // Description: click to edit -> textarea appears, Ctrl+Enter saves
    const md = /** @type {HTMLDivElement} */ (mount.querySelector('.md'));
    md.click();
    const area = /** @type {HTMLTextAreaElement} */ (
      mount.querySelector('textarea')
    );
    area.value = 'Changed';
    const key = new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true });
    area.dispatchEvent(key);
    // After save, returns to read mode (allow microtask flush)
    await Promise.resolve();
    // Only the comment input textarea should remain, no description textarea
    expect(
      /** @type {HTMLTextAreaElement|null} */ (
        mount.querySelector('.description textarea')
      )
    ).toBeNull();
  });

  test('shows placeholder when not found or bad payload', async () => {
    document.body.innerHTML =
      '<section class="panel"><div id="mount"></div></section>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
    const stores = {
      snapshotFor() {
        return [];
      },
      subscribe() {
        return () => {};
      }
    };
    const view = createDetailView(mount, async () => ({}), undefined, stores);

    await view.load('UI-404');
    expect((mount.textContent || '').toLowerCase()).toContain('loading');

    view.clear();
    expect((mount.textContent || '').toLowerCase()).toContain(
      'select an issue'
    );
  });

  test('renders comments section with author and timestamp', async () => {
    document.body.innerHTML =
      '<section class="panel"><div id="mount"></div></section>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));

    const issue = {
      id: 'UI-99',
      title: 'Test issue',
      dependencies: [],
      dependents: [],
      comments: [
        {
          id: 1,
          author: 'Alice',
          text: 'This is a comment',
          created_at: '2025-01-15T10:30:00Z'
        },
        {
          id: 2,
          author: 'Bob',
          text: 'Another comment',
          created_at: '2025-01-15T11:00:00Z'
        }
      ]
    };

    const stores = {
      snapshotFor(/** @type {string} */ id) {
        return id === 'detail:UI-99' ? [issue] : [];
      },
      subscribe() {
        return () => {};
      }
    };

    const view = createDetailView(mount, async () => ({}), undefined, stores);
    await view.load('UI-99');

    // Check comments section exists
    const commentsSection = mount.querySelector('.comments');
    expect(commentsSection).toBeTruthy();

    // Check comments are rendered
    const commentItems = mount.querySelectorAll('.comment-item');
    expect(commentItems.length).toBe(2);

    // Check first comment content
    const firstComment = commentItems[0];
    expect(firstComment.textContent).toContain('Alice');
    expect(firstComment.textContent).toContain('This is a comment');
  });

  test('shows placeholder when no comments', async () => {
    document.body.innerHTML =
      '<section class="panel"><div id="mount"></div></section>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));

    const issue = {
      id: 'UI-100',
      title: 'Test issue',
      dependencies: [],
      dependents: [],
      comments: []
    };

    const stores = {
      snapshotFor(/** @type {string} */ id) {
        return id === 'detail:UI-100' ? [issue] : [];
      },
      subscribe() {
        return () => {};
      }
    };

    const view = createDetailView(mount, async () => ({}), undefined, stores);
    await view.load('UI-100');

    const commentsSection = mount.querySelector('.comments');
    expect(commentsSection).toBeTruthy();
    expect(commentsSection && commentsSection.textContent).toContain(
      'No comments yet'
    );
  });

  test('submits new comment via sendFn', async () => {
    document.body.innerHTML =
      '<section class="panel"><div id="mount"></div></section>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));

    const issue = {
      id: 'UI-101',
      title: 'Test issue',
      dependencies: [],
      dependents: [],
      comments: []
    };

    /** @type {Array<{type: string, payload: unknown}>} */
    const calls = [];
    const sendFn = async (
      /** @type {string} */ type,
      /** @type {unknown} */ payload
    ) => {
      calls.push({ type, payload });
      // Return updated comments
      return [
        {
          id: 1,
          author: 'Me',
          text: 'New comment',
          created_at: '2025-01-15T12:00:00Z'
        }
      ];
    };

    const stores = {
      snapshotFor(/** @type {string} */ id) {
        return id === 'detail:UI-101' ? [issue] : [];
      },
      subscribe() {
        return () => {};
      }
    };

    const view = createDetailView(mount, sendFn, undefined, stores);
    await view.load('UI-101');

    // Find textarea and button
    const textarea = /** @type {HTMLTextAreaElement} */ (
      mount.querySelector('.comment-input textarea')
    );
    const button = /** @type {HTMLButtonElement} */ (
      mount.querySelector('.comment-input button')
    );

    expect(textarea).toBeTruthy();
    expect(button).toBeTruthy();

    // Type a comment
    textarea.value = 'Test comment';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    // Click submit
    button.click();

    // Wait for async
    await new Promise((r) => setTimeout(r, 10));

    // Verify sendFn was called correctly
    expect(calls.length).toBe(1);
    expect(calls[0].type).toBe('add-comment');
    expect(calls[0].payload).toEqual({ id: 'UI-101', text: 'Test comment' });
  });

  test('fetches comments on load when not in snapshot', async () => {
    document.body.innerHTML =
      '<section class="panel"><div id="mount"></div></section>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));

    // Issue without comments in snapshot
    const issue = {
      id: 'UI-102',
      title: 'Test issue',
      dependencies: [],
      dependents: []
      // No comments property
    };

    /** @type {Array<{type: string, payload: unknown}>} */
    const calls = [];
    const sendFn = async (
      /** @type {string} */ type,
      /** @type {unknown} */ payload
    ) => {
      calls.push({ type, payload });
      if (type === 'get-comments') {
        return [
          {
            id: 1,
            author: 'Fetched',
            text: 'Fetched comment',
            created_at: '2025-01-15T12:00:00Z'
          }
        ];
      }
      return {};
    };

    const stores = {
      snapshotFor(/** @type {string} */ id) {
        return id === 'detail:UI-102' ? [issue] : [];
      },
      subscribe() {
        return () => {};
      }
    };

    const view = createDetailView(mount, sendFn, undefined, stores);
    await view.load('UI-102');

    // Wait for async fetch
    await new Promise((r) => setTimeout(r, 50));

    // Verify get-comments was called
    const getCommentsCall = calls.find((c) => c.type === 'get-comments');
    expect(getCommentsCall).toBeTruthy();
    expect(getCommentsCall?.payload).toEqual({ id: 'UI-102' });

    // Verify fetched comment is displayed
    const commentItems = mount.querySelectorAll('.comment-item');
    expect(commentItems.length).toBe(1);
    expect(commentItems[0].textContent).toContain('Fetched');
  });
});
