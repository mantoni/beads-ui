import { beforeEach, describe, expect, test, vi } from 'vitest';
import { runBd } from './bd.js';
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

describe('delete-issue handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('sends delete-issue and receives success', async () => {
    const rb = /** @type {import('vitest').Mock} */ (runBd);
    rb.mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });

    const ws = makeStubSocket();
    await handleMessage(
      /** @type {any} */ (ws),
      Buffer.from(
        JSON.stringify({
          id: 'req-1',
          type: /** @type {any} */ ('delete-issue'),
          payload: { id: 'beads-abc123' }
        })
      )
    );

    // Check bd delete was called
    expect(rb).toHaveBeenCalledWith(['delete', 'beads-abc123']);

    // Check response
    expect(ws.sent.length).toBe(1);
    const reply = JSON.parse(ws.sent[0]);
    expect(reply.ok).toBe(true);
    expect(reply.payload.deleted).toBe(true);
    expect(reply.payload.id).toBe('beads-abc123');
  });

  test('returns error when bd delete fails', async () => {
    const rb = /** @type {import('vitest').Mock} */ (runBd);
    rb.mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'Issue not found' });

    const ws = makeStubSocket();
    await handleMessage(
      /** @type {any} */ (ws),
      Buffer.from(
        JSON.stringify({
          id: 'req-2',
          type: /** @type {any} */ ('delete-issue'),
          payload: { id: 'beads-notfound' }
        })
      )
    );

    expect(ws.sent.length).toBe(1);
    const reply = JSON.parse(ws.sent[0]);
    expect(reply.ok).toBe(false);
    expect(reply.error.code).toBe('bd_error');
    expect(reply.error.message).toBe('Issue not found');
  });

  test('returns error when id is missing', async () => {
    const ws = makeStubSocket();
    await handleMessage(
      /** @type {any} */ (ws),
      Buffer.from(
        JSON.stringify({
          id: 'req-3',
          type: /** @type {any} */ ('delete-issue'),
          payload: {}
        })
      )
    );

    expect(ws.sent.length).toBe(1);
    const reply = JSON.parse(ws.sent[0]);
    expect(reply.ok).toBe(false);
    expect(reply.error.code).toBe('bad_request');
  });

  test('returns error when id is empty string', async () => {
    const ws = makeStubSocket();
    await handleMessage(
      /** @type {any} */ (ws),
      Buffer.from(
        JSON.stringify({
          id: 'req-4',
          type: /** @type {any} */ ('delete-issue'),
          payload: { id: '' }
        })
      )
    );

    expect(ws.sent.length).toBe(1);
    const reply = JSON.parse(ws.sent[0]);
    expect(reply.ok).toBe(false);
    expect(reply.error.code).toBe('bad_request');
  });
});
