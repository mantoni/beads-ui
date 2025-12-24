# Issue Comments Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Display and add comments in the issue detail modal, with author attribution from git config.

**Architecture:** Add `get-comments` and `add-comment` WebSocket handlers on the server that call `bd comments` and `bd comment` CLI commands. Frontend fetches comments when loading an issue and displays them in a new Comments section. Users can add comments with their git user name auto-filled as author.

**Tech Stack:** Node.js/Express server, lit-html frontend, vitest for testing, WebSocket RPC protocol.

**Note:** Do NOT commit this plan file. Only commit code changes.

---

## Task 1: Add `get-comments` Server Handler

**Files:**
- Modify: `server/ws.js` (add handler after `label-remove` handler ~line 1082)
- Modify: `app/protocol.js` (add message type)
- Test: `server/ws.comments.test.js` (new file)

**Step 1: Write the failing test**

Create `server/ws.comments.test.js`:

```javascript
import { spawn as spawnMock } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

/**
 * @param {string} stdoutText
 * @param {string} stderrText
 * @param {number} code
 */
function makeFakeProc(stdoutText, stderrText, code) {
  const cp = /** @type {any} */ (new EventEmitter());
  const out = new PassThrough();
  const err = new PassThrough();
  cp.stdout = out;
  cp.stderr = err;
  queueMicrotask(() => {
    if (stdoutText) out.write(stdoutText);
    out.end();
    if (stderrText) err.write(stderrText);
    err.end();
    cp.emit('close', code);
  });
  return cp;
}

const mockedSpawn = /** @type {import('vitest').Mock} */ (spawnMock);

describe('get-comments handler', () => {
  beforeEach(() => {
    mockedSpawn.mockReset();
  });

  test('returns comments array on success', async () => {
    const { handleMessage } = await import('./ws.js');

    const comments = [
      { id: 1, issue_id: 'UI-1', author: 'alice', text: 'First comment', created_at: '2025-01-01T00:00:00Z' },
      { id: 2, issue_id: 'UI-1', author: 'bob', text: 'Second comment', created_at: '2025-01-02T00:00:00Z' }
    ];
    mockedSpawn.mockReturnValueOnce(makeFakeProc(JSON.stringify(comments), '', 0));

    /** @type {string[]} */
    const sent = [];
    const fakeWs = /** @type {any} */ ({
      send: (/** @type {string} */ msg) => sent.push(msg),
      readyState: 1,
      OPEN: 1
    });

    const reqData = JSON.stringify({
      id: 'req-1',
      type: 'get-comments',
      payload: { id: 'UI-1' }
    });

    await handleMessage(fakeWs, Buffer.from(reqData));

    expect(sent.length).toBe(1);
    const reply = JSON.parse(sent[0]);
    expect(reply.ok).toBe(true);
    expect(reply.payload).toEqual(comments);
  });

  test('returns error when issue id missing', async () => {
    const { handleMessage } = await import('./ws.js');

    /** @type {string[]} */
    const sent = [];
    const fakeWs = /** @type {any} */ ({
      send: (/** @type {string} */ msg) => sent.push(msg),
      readyState: 1,
      OPEN: 1
    });

    const reqData = JSON.stringify({
      id: 'req-2',
      type: 'get-comments',
      payload: {}
    });

    await handleMessage(fakeWs, Buffer.from(reqData));

    expect(sent.length).toBe(1);
    const reply = JSON.parse(sent[0]);
    expect(reply.ok).toBe(false);
    expect(reply.error.code).toBe('bad_request');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- server/ws.comments.test.js`
Expected: FAIL with "unknown_type" error (handler doesn't exist yet)

**Step 3: Add message type to protocol**

In `app/protocol.js`, update the `MessageType` typedef (line 12) and `MESSAGE_TYPES` array (line 38):

```javascript
// Line 12 - add 'get-comments'|'add-comment' to typedef:
/** @typedef {'list-issues'|'update-status'|'edit-text'|'update-priority'|'create-issue'|'list-ready'|'dep-add'|'dep-remove'|'epic-status'|'update-assignee'|'label-add'|'label-remove'|'subscribe-list'|'unsubscribe-list'|'snapshot'|'upsert'|'delete'|'get-comments'|'add-comment'} MessageType */

// Line 38-57 - add to MESSAGE_TYPES array before closing bracket:
export const MESSAGE_TYPES = /** @type {const} */ ([
  'list-issues',
  'update-status',
  'edit-text',
  'update-priority',
  'create-issue',
  'list-ready',
  'dep-add',
  'dep-remove',
  'epic-status',
  'update-assignee',
  'label-add',
  'label-remove',
  'subscribe-list',
  'unsubscribe-list',
  // vNext per-subscription full-issue push events
  'snapshot',
  'upsert',
  'delete',
  // Comments
  'get-comments',
  'add-comment'
]);
```

**Step 4: Implement get-comments handler**

In `server/ws.js`, add after the `label-remove` handler (after line 1081):

```javascript
  // get-comments: payload { id: string }
  if (req.type === 'get-comments') {
    const { id } = /** @type {any} */ (req.payload || {});
    if (typeof id !== 'string' || id.length === 0) {
      ws.send(
        JSON.stringify(
          makeError(req, 'bad_request', 'payload requires { id: string }')
        )
      );
      return;
    }
    const res = await runBdJson(['comments', id, '--json']);
    if (res.code !== 0) {
      ws.send(
        JSON.stringify(makeError(req, 'bd_error', res.stderr || 'bd failed'))
      );
      return;
    }
    ws.send(JSON.stringify(makeOk(req, res.stdoutJson || [])));
    return;
  }
```

**Step 5: Run test to verify it passes**

Run: `npm test -- server/ws.comments.test.js`
Expected: PASS

**Step 6: Run full test suite**

Run: `npm test`
Expected: All tests pass

---

## Task 2: Add `add-comment` Server Handler with Git Author

**Files:**
- Modify: `server/ws.js` (add handler after `get-comments`)
- Modify: `server/bd.js` (add `getGitUserName` helper)
- Test: `server/ws.comments.test.js` (add test)
- Test: `server/bd.test.js` (add test for getGitUserName)

**Step 1: Write the failing test for getGitUserName**

Add to `server/bd.test.js`:

```javascript
describe('getGitUserName', () => {
  test('returns git user name on success', async () => {
    const { getGitUserName } = await import('./bd.js');
    mockedSpawn.mockReturnValueOnce(makeFakeProc('Alice Smith\n', '', 0));
    const name = await getGitUserName();
    expect(name).toBe('Alice Smith');
  });

  test('returns empty string on failure', async () => {
    const { getGitUserName } = await import('./bd.js');
    mockedSpawn.mockReturnValueOnce(makeFakeProc('', 'error', 1));
    const name = await getGitUserName();
    expect(name).toBe('');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- server/bd.test.js`
Expected: FAIL with "getGitUserName is not a function"

**Step 3: Implement getGitUserName in bd.js**

Add to `server/bd.js` after the imports (around line 6):

```javascript
/**
 * Get the git user name from git config.
 *
 * @param {{ cwd?: string }} [options]
 * @returns {Promise<string>}
 */
export async function getGitUserName(options = {}) {
  return new Promise((resolve) => {
    const child = spawn('git', ['config', 'user.name'], {
      cwd: options.cwd || process.cwd(),
      shell: false
    });

    /** @type {string[]} */
    const chunks = [];

    if (child.stdout) {
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => chunks.push(String(chunk)));
    }

    child.on('error', () => resolve(''));
    child.on('close', (code) => {
      if (code !== 0) {
        resolve('');
        return;
      }
      resolve(chunks.join('').trim());
    });
  });
}
```

Also add `spawn` to the import at top of file if not already destructured:
```javascript
import { spawn } from 'node:child_process';
```

**Step 4: Run test to verify it passes**

Run: `npm test -- server/bd.test.js`
Expected: PASS

**Step 5: Write the failing test for add-comment handler**

Add to `server/ws.comments.test.js`:

```javascript
describe('add-comment handler', () => {
  beforeEach(() => {
    mockedSpawn.mockReset();
  });

  test('adds comment with git author and returns updated comments', async () => {
    const { handleMessage } = await import('./ws.js');

    // First call: git config user.name
    mockedSpawn.mockReturnValueOnce(makeFakeProc('Test User\n', '', 0));
    // Second call: bd comment
    mockedSpawn.mockReturnValueOnce(makeFakeProc('', '', 0));
    // Third call: bd comments --json (returns updated list)
    const updatedComments = [
      { id: 1, issue_id: 'UI-1', author: 'Test User', text: 'New comment', created_at: '2025-01-01T00:00:00Z' }
    ];
    mockedSpawn.mockReturnValueOnce(makeFakeProc(JSON.stringify(updatedComments), '', 0));

    /** @type {string[]} */
    const sent = [];
    const fakeWs = /** @type {any} */ ({
      send: (/** @type {string} */ msg) => sent.push(msg),
      readyState: 1,
      OPEN: 1
    });

    const reqData = JSON.stringify({
      id: 'req-3',
      type: 'add-comment',
      payload: { id: 'UI-1', text: 'New comment' }
    });

    await handleMessage(fakeWs, Buffer.from(reqData));

    expect(sent.length).toBe(1);
    const reply = JSON.parse(sent[0]);
    expect(reply.ok).toBe(true);
    expect(reply.payload).toEqual(updatedComments);
  });

  test('returns error when text is empty', async () => {
    const { handleMessage } = await import('./ws.js');

    /** @type {string[]} */
    const sent = [];
    const fakeWs = /** @type {any} */ ({
      send: (/** @type {string} */ msg) => sent.push(msg),
      readyState: 1,
      OPEN: 1
    });

    const reqData = JSON.stringify({
      id: 'req-4',
      type: 'add-comment',
      payload: { id: 'UI-1', text: '' }
    });

    await handleMessage(fakeWs, Buffer.from(reqData));

    expect(sent.length).toBe(1);
    const reply = JSON.parse(sent[0]);
    expect(reply.ok).toBe(false);
    expect(reply.error.code).toBe('bad_request');
  });
});
```

**Step 6: Run test to verify it fails**

Run: `npm test -- server/ws.comments.test.js`
Expected: FAIL with "unknown_type" error

**Step 7: Implement add-comment handler**

In `server/ws.js`, add the import for `getGitUserName` at the top:

```javascript
import { runBd, runBdJson, getGitUserName } from './bd.js';
```

Then add the handler after `get-comments`:

```javascript
  // add-comment: payload { id: string, text: string }
  if (req.type === 'add-comment') {
    const { id, text } = /** @type {any} */ (req.payload || {});
    if (
      typeof id !== 'string' ||
      id.length === 0 ||
      typeof text !== 'string' ||
      text.trim().length === 0
    ) {
      ws.send(
        JSON.stringify(
          makeError(
            req,
            'bad_request',
            'payload requires { id: string, text: non-empty string }'
          )
        )
      );
      return;
    }

    // Get git user name for author attribution
    const author = await getGitUserName();
    const args = ['comment', id, text.trim()];
    if (author) {
      args.push('--author', author);
    }

    const res = await runBd(args);
    if (res.code !== 0) {
      ws.send(
        JSON.stringify(makeError(req, 'bd_error', res.stderr || 'bd failed'))
      );
      return;
    }

    // Return updated comments list
    const comments = await runBdJson(['comments', id, '--json']);
    if (comments.code !== 0) {
      ws.send(
        JSON.stringify(makeError(req, 'bd_error', comments.stderr || 'bd failed'))
      );
      return;
    }
    ws.send(JSON.stringify(makeOk(req, comments.stdoutJson || [])));
    return;
  }
```

**Step 8: Run test to verify it passes**

Run: `npm test -- server/ws.comments.test.js`
Expected: PASS

**Step 9: Run full test suite**

Run: `npm test`
Expected: All tests pass

---

## Task 3: Add Comments Section to Detail View (Display Only)

**Files:**
- Modify: `app/views/detail.js` (add comments section after notes)
- Test: `app/views/detail.comments.test.js` (new file)

**Step 1: Write the failing test**

Create `app/views/detail.comments.test.js`:

```javascript
import { describe, expect, test } from 'vitest';
import { createDetailView } from './detail.js';

describe('views/detail comments', () => {
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
      snapshotFor(id) {
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
      snapshotFor(id) {
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
    expect(commentsSection.textContent).toContain('No comments yet');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- app/views/detail.comments.test.js`
Expected: FAIL (no .comments section exists)

**Step 3: Add comments type to IssueDetail typedef**

In `app/views/detail.js`, update the `IssueDetail` typedef (around line 22):

```javascript
/**
 * @typedef {Object} Comment
 * @property {number} id
 * @property {string} [author]
 * @property {string} text
 * @property {string} [created_at]
 */

/**
 * @typedef {Object} IssueDetail
 * @property {string} id
 * @property {string} [title]
 * @property {string} [description]
 * @property {string} [design]
 * @property {string} [acceptance]
 * @property {string} [notes]
 * @property {string} [status]
 * @property {string} [assignee]
 * @property {number} [priority]
 * @property {string[]} [labels]
 * @property {Dependency[]} [dependencies]
 * @property {Dependency[]} [dependents]
 * @property {Comment[]} [comments]
 */
```

**Step 4: Add helper function for formatting dates**

In `app/views/detail.js`, add after the imports (around line 12):

```javascript
/**
 * Format a date string for display.
 * @param {string} [dateStr]
 * @returns {string}
 */
function formatCommentDate(dateStr) {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return dateStr;
  }
}
```

**Step 5: Add comments section to detailTemplate**

In `app/views/detail.js`, add the comments block after `notes_block` in `detailTemplate` function (around line 908):

```javascript
    // Comments section
    const comments = Array.isArray(/** @type {any} */ (issue).comments)
      ? /** @type {Comment[]} */ (/** @type {any} */ (issue).comments)
      : [];
    const comments_block = html`<div class="comments">
      <div class="props-card__title">Comments</div>
      ${comments.length === 0
        ? html`<div class="muted">No comments yet</div>`
        : comments.map(
            (c) => html`
              <div class="comment-item">
                <div class="comment-header">
                  <span class="comment-author">${c.author || 'Unknown'}</span>
                  <span class="comment-date">${formatCommentDate(c.created_at)}</span>
                </div>
                <div class="comment-text">${c.text}</div>
              </div>
            `
          )}
    </div>`;
```

**Step 6: Update the template return to include comments**

In `detailTemplate`, update the detail-main section to include `${comments_block}` after `${accept_block}`:

```javascript
            <div class="detail-main">
              ${title_zone} ${desc_block} ${design_block} ${notes_block}
              ${accept_block} ${comments_block}
            </div>
```

**Step 7: Run test to verify it passes**

Run: `npm test -- app/views/detail.comments.test.js`
Expected: PASS

**Step 8: Run full test suite**

Run: `npm test`
Expected: All tests pass

---

## Task 4: Add Comment Input Form

**Files:**
- Modify: `app/views/detail.js` (add input form and submit handler)
- Test: `app/views/detail.comments.test.js` (add test)

**Step 1: Write the failing test**

Add to `app/views/detail.comments.test.js`:

```javascript
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
    const sendFn = async (/** @type {string} */ type, /** @type {unknown} */ payload) => {
      calls.push({ type, payload });
      // Return updated comments
      return [{ id: 1, author: 'Me', text: 'New comment', created_at: '2025-01-15T12:00:00Z' }];
    };

    const stores = {
      snapshotFor(id) {
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

    // Click submit
    button.click();

    // Wait for async
    await new Promise((r) => setTimeout(r, 10));

    // Verify sendFn was called correctly
    expect(calls.length).toBe(1);
    expect(calls[0].type).toBe('add-comment');
    expect(calls[0].payload).toEqual({ id: 'UI-101', text: 'Test comment' });
  });
```

**Step 2: Run test to verify it fails**

Run: `npm test -- app/views/detail.comments.test.js`
Expected: FAIL (no .comment-input exists)

**Step 3: Add comment input state and handlers**

In `app/views/detail.js`, add state variable after other state variables (around line 80):

```javascript
  /** @type {string} */
  let comment_text = '';
  /** @type {boolean} */
  let comment_pending = false;
```

Add input handler after other handlers (around line 330):

```javascript
  // Comment input handlers
  /**
   * @param {Event} ev
   */
  const onCommentInput = (ev) => {
    const el = /** @type {HTMLTextAreaElement} */ (ev.currentTarget);
    comment_text = el.value || '';
  };

  const onCommentSubmit = async () => {
    if (!current || comment_pending || !comment_text.trim()) {
      return;
    }
    comment_pending = true;
    doRender();
    try {
      log('add comment to %s', String(current.id));
      const result = await sendFn('add-comment', {
        id: current.id,
        text: comment_text.trim()
      });
      if (Array.isArray(result)) {
        // Update comments in current issue
        /** @type {any} */ (current).comments = result;
        comment_text = '';
        doRender();
      }
    } catch (err) {
      log('add comment failed %s %o', String(current.id), err);
      showToast('Failed to add comment', 'error');
    } finally {
      comment_pending = false;
      doRender();
    }
  };

  /**
   * @param {KeyboardEvent} ev
   */
  const onCommentKeydown = (ev) => {
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault();
      onCommentSubmit();
    }
  };
```

**Step 4: Update comments block to include input form**

Update the `comments_block` in `detailTemplate`:

```javascript
    // Comments section
    const comments = Array.isArray(/** @type {any} */ (issue).comments)
      ? /** @type {Comment[]} */ (/** @type {any} */ (issue).comments)
      : [];
    const comments_block = html`<div class="comments">
      <div class="props-card__title">Comments</div>
      ${comments.length === 0
        ? html`<div class="muted">No comments yet</div>`
        : comments.map(
            (c) => html`
              <div class="comment-item">
                <div class="comment-header">
                  <span class="comment-author">${c.author || 'Unknown'}</span>
                  <span class="comment-date">${formatCommentDate(c.created_at)}</span>
                </div>
                <div class="comment-text">${c.text}</div>
              </div>
            `
          )}
      <div class="comment-input">
        <textarea
          placeholder="Add a comment... (Ctrl+Enter to submit)"
          rows="3"
          .value=${comment_text}
          @input=${onCommentInput}
          @keydown=${onCommentKeydown}
          ?disabled=${comment_pending}
        ></textarea>
        <button
          @click=${onCommentSubmit}
          ?disabled=${comment_pending || !comment_text.trim()}
        >
          ${comment_pending ? 'Adding...' : 'Add Comment'}
        </button>
      </div>
    </div>`;
```

**Step 5: Run test to verify it passes**

Run: `npm test -- app/views/detail.comments.test.js`
Expected: PASS

**Step 6: Run full test suite**

Run: `npm test`
Expected: All tests pass

---

## Task 5: Fetch Comments When Loading Issue

**Files:**
- Modify: `app/views/detail.js` (fetch comments in load function)
- Test: `app/views/detail.comments.test.js` (add test)

**Step 1: Write the failing test**

Add to `app/views/detail.comments.test.js`:

```javascript
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
    const sendFn = async (/** @type {string} */ type, /** @type {unknown} */ payload) => {
      calls.push({ type, payload });
      if (type === 'get-comments') {
        return [{ id: 1, author: 'Fetched', text: 'Fetched comment', created_at: '2025-01-15T12:00:00Z' }];
      }
      return {};
    };

    const stores = {
      snapshotFor(id) {
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
```

**Step 2: Run test to verify it fails**

Run: `npm test -- app/views/detail.comments.test.js`
Expected: FAIL (get-comments not called)

**Step 3: Add comment fetching to load function**

In `app/views/detail.js`, update the `load` function (around line 1245):

```javascript
    async load(id) {
      if (!id) {
        renderPlaceholder('No issue selected');
        return;
      }
      current_id = String(id);
      // Try from store first; show placeholder while waiting for snapshot
      current = null;
      refreshFromStore();
      if (!current) {
        renderPlaceholder('Loading...');
      }
      // Render from current (if available) or keep placeholder until push arrives
      pending = false;
      comment_text = '';
      comment_pending = false;
      doRender();

      // Fetch comments if not already present
      if (current && !/** @type {any} */ (current).comments) {
        try {
          const comments = await sendFn('get-comments', { id: current_id });
          if (Array.isArray(comments) && current && current_id === id) {
            /** @type {any} */ (current).comments = comments;
            doRender();
          }
        } catch (err) {
          log('fetch comments failed %s %o', id, err);
        }
      }
    },
```

**Step 4: Run test to verify it passes**

Run: `npm test -- app/views/detail.comments.test.js`
Expected: PASS

**Step 5: Run full test suite**

Run: `npm test`
Expected: All tests pass

---

## Task 6: Add CSS Styles for Comments

**Files:**
- Modify: `app/styles.css` (add comment styles)

**Step 1: Add comment styles**

Add to `app/styles.css` at the end (or in the detail section):

```css
/* Comments section */
.comments {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.comment-item {
  padding: 12px;
  margin-bottom: 8px;
  background: color-mix(in srgb, var(--panel-bg) 95%, transparent);
  border: 1px solid var(--border);
  border-radius: 4px;
}

.comment-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  font-size: 12px;
}

.comment-author {
  font-weight: 600;
  color: var(--fg);
}

.comment-date {
  color: var(--muted);
}

.comment-text {
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
}

.comment-input {
  margin-top: 12px;
}

.comment-input textarea {
  width: 100%;
  min-height: 60px;
  padding: 8px;
  border: 1px solid var(--control-border);
  border-radius: 4px;
  background: var(--input-bg);
  color: var(--fg);
  font-family: inherit;
  font-size: 14px;
  resize: vertical;
}

.comment-input textarea:focus {
  outline: none;
  border-color: var(--link);
}

.comment-input button {
  margin-top: 8px;
}
```

**Step 2: Verify styles work**

Run: `npm start` (or `bdui start --open`)
Navigate to an issue and verify the comments section displays correctly.

---

## Task 7: Run All Checks and Commit

**Step 1: Run typecheck**

Run: `npm run typecheck`
Expected: No errors

**Step 2: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 3: Run lint**

Run: `npm run lint`
Expected: No errors

**Step 4: Run formatter**

Run: `npm run format`
Expected: Files formatted

**Step 5: Commit changes**

```bash
git add app/protocol.js app/views/detail.js app/styles.css server/ws.js server/bd.js
git add app/views/detail.comments.test.js server/ws.comments.test.js server/bd.test.js
git commit -m "feat: add comments to issue detail view

- Add get-comments and add-comment WebSocket handlers
- Display comments with author and timestamp in detail view
- Add comment input form with Ctrl+Enter submit
- Auto-fill author from git config user.name
- Fetch comments when loading issue details

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Summary

| Task | Files Modified | Tests Added |
|------|---------------|-------------|
| 1 | `server/ws.js`, `app/protocol.js` | `server/ws.comments.test.js` |
| 2 | `server/ws.js`, `server/bd.js` | `server/bd.test.js`, `server/ws.comments.test.js` |
| 3 | `app/views/detail.js` | `app/views/detail.comments.test.js` |
| 4 | `app/views/detail.js` | `app/views/detail.comments.test.js` |
| 5 | `app/views/detail.js` | `app/views/detail.comments.test.js` |
| 6 | `app/styles.css` | (manual verification) |
| 7 | (all above) | Full test suite |

**Total estimated implementation: 7 tasks**
