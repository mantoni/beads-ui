import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getGitUserName, runBd, runBdJson } from './bd.js';
import { handleMessage } from './ws.js';

vi.mock('./bd.js', () => ({
  runBd: vi.fn(),
  runBdJson: vi.fn(),
  getGitUserName: vi.fn()
}));

function makeStubSocket() {
  return {
    sent: /** @type {string[]} */ ([]),
    readyState: 1,
    OPEN: 1,
    /** @param {string} msg */
    send(msg) {
      this.sent.push(String(msg));
    }
  };
}

describe('get-comments handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('returns comments array on success', async () => {
    const rj = /** @type {import('vitest').Mock} */ (runBdJson);
    const comments = [
      {
        id: 1,
        issue_id: 'UI-1',
        author: 'alice',
        text: 'First comment',
        created_at: '2025-01-01T00:00:00Z'
      },
      {
        id: 2,
        issue_id: 'UI-1',
        author: 'bob',
        text: 'Second comment',
        created_at: '2025-01-02T00:00:00Z'
      }
    ];
    rj.mockResolvedValueOnce({ code: 0, stdoutJson: comments });

    const ws = makeStubSocket();
    await handleMessage(
      /** @type {any} */ (ws),
      Buffer.from(
        JSON.stringify({
          id: 'req-1',
          type: /** @type {any} */ ('get-comments'),
          payload: { id: 'UI-1' }
        })
      )
    );

    expect(ws.sent.length).toBe(1);
    const reply = JSON.parse(ws.sent[0]);
    expect(reply.ok).toBe(true);
    expect(reply.payload).toEqual(comments);

    // Verify bd was called with correct args
    expect(rj).toHaveBeenCalledWith(['comments', 'UI-1', '--json']);
  });

  test('returns error when issue id missing', async () => {
    const ws = makeStubSocket();
    await handleMessage(
      /** @type {any} */ (ws),
      Buffer.from(
        JSON.stringify({
          id: 'req-2',
          type: /** @type {any} */ ('get-comments'),
          payload: {}
        })
      )
    );

    expect(ws.sent.length).toBe(1);
    const reply = JSON.parse(ws.sent[0]);
    expect(reply.ok).toBe(false);
    expect(reply.error.code).toBe('bad_request');
  });

  test('returns error when bd command fails', async () => {
    const rj = /** @type {import('vitest').Mock} */ (runBdJson);
    rj.mockResolvedValueOnce({ code: 1, stderr: 'Issue not found' });

    const ws = makeStubSocket();
    await handleMessage(
      /** @type {any} */ (ws),
      Buffer.from(
        JSON.stringify({
          id: 'req-3',
          type: /** @type {any} */ ('get-comments'),
          payload: { id: 'UI-999' }
        })
      )
    );

    expect(ws.sent.length).toBe(1);
    const reply = JSON.parse(ws.sent[0]);
    expect(reply.ok).toBe(false);
    expect(reply.error.code).toBe('bd_error');
  });
});

describe('add-comment handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('adds comment with git author and returns updated comments', async () => {
    const gitUser = /** @type {import('vitest').Mock} */ (getGitUserName);
    const rb = /** @type {import('vitest').Mock} */ (runBd);
    const rj = /** @type {import('vitest').Mock} */ (runBdJson);

    // Mock git config user.name
    gitUser.mockResolvedValueOnce('Test User');
    // Mock bd comment command
    rb.mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });
    // Mock bd comments --json (returns updated list)
    const updatedComments = [
      {
        id: 1,
        issue_id: 'UI-1',
        author: 'Test User',
        text: 'New comment',
        created_at: '2025-01-01T00:00:00Z'
      }
    ];
    rj.mockResolvedValueOnce({ code: 0, stdoutJson: updatedComments });

    const ws = makeStubSocket();
    await handleMessage(
      /** @type {any} */ (ws),
      Buffer.from(
        JSON.stringify({
          id: 'req-4',
          type: /** @type {any} */ ('add-comment'),
          payload: { id: 'UI-1', text: 'New comment' }
        })
      )
    );

    expect(ws.sent.length).toBe(1);
    const reply = JSON.parse(ws.sent[0]);
    expect(reply.ok).toBe(true);
    expect(reply.payload).toEqual(updatedComments);

    // Verify bd was called with correct args including --author
    expect(rb).toHaveBeenCalledWith([
      'comment',
      'UI-1',
      'New comment',
      '--author',
      'Test User'
    ]);
  });

  test('adds comment without author when git user name is empty', async () => {
    const gitUser = /** @type {import('vitest').Mock} */ (getGitUserName);
    const rb = /** @type {import('vitest').Mock} */ (runBd);
    const rj = /** @type {import('vitest').Mock} */ (runBdJson);

    // Mock empty git user name
    gitUser.mockResolvedValueOnce('');
    // Mock bd comment command
    rb.mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });
    // Mock bd comments --json
    rj.mockResolvedValueOnce({ code: 0, stdoutJson: [] });

    const ws = makeStubSocket();
    await handleMessage(
      /** @type {any} */ (ws),
      Buffer.from(
        JSON.stringify({
          id: 'req-5',
          type: /** @type {any} */ ('add-comment'),
          payload: { id: 'UI-1', text: 'Anonymous comment' }
        })
      )
    );

    expect(ws.sent.length).toBe(1);
    const reply = JSON.parse(ws.sent[0]);
    expect(reply.ok).toBe(true);

    // Verify bd was called without --author
    expect(rb).toHaveBeenCalledWith(['comment', 'UI-1', 'Anonymous comment']);
  });

  test('returns error when text is empty', async () => {
    const ws = makeStubSocket();
    await handleMessage(
      /** @type {any} */ (ws),
      Buffer.from(
        JSON.stringify({
          id: 'req-6',
          type: /** @type {any} */ ('add-comment'),
          payload: { id: 'UI-1', text: '' }
        })
      )
    );

    expect(ws.sent.length).toBe(1);
    const reply = JSON.parse(ws.sent[0]);
    expect(reply.ok).toBe(false);
    expect(reply.error.code).toBe('bad_request');
  });

  test('returns error when id is missing', async () => {
    const ws = makeStubSocket();
    await handleMessage(
      /** @type {any} */ (ws),
      Buffer.from(
        JSON.stringify({
          id: 'req-7',
          type: /** @type {any} */ ('add-comment'),
          payload: { text: 'Some text' }
        })
      )
    );

    expect(ws.sent.length).toBe(1);
    const reply = JSON.parse(ws.sent[0]);
    expect(reply.ok).toBe(false);
    expect(reply.error.code).toBe('bad_request');
  });

  test('returns error when bd comment command fails', async () => {
    const gitUser = /** @type {import('vitest').Mock} */ (getGitUserName);
    const rb = /** @type {import('vitest').Mock} */ (runBd);

    gitUser.mockResolvedValueOnce('Test User');
    rb.mockResolvedValueOnce({
      code: 1,
      stdout: '',
      stderr: 'Issue not found'
    });

    const ws = makeStubSocket();
    await handleMessage(
      /** @type {any} */ (ws),
      Buffer.from(
        JSON.stringify({
          id: 'req-8',
          type: /** @type {any} */ ('add-comment'),
          payload: { id: 'UI-999', text: 'Comment' }
        })
      )
    );

    expect(ws.sent.length).toBe(1);
    const reply = JSON.parse(ws.sent[0]);
    expect(reply.ok).toBe(false);
    expect(reply.error.code).toBe('bd_error');
  });
});
