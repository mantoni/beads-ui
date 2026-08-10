import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { getGitUserName, runBd, runBdJson } from './bd.js';
import { fetchListForSubscription } from './list-adapters.js';
import { registry } from './subscriptions.js';
import { handleMessage } from './ws.js';

vi.mock('./bd.js', () => ({
  runBd: vi.fn(),
  runBdJson: vi.fn(),
  getGitUserName: vi.fn()
}));

vi.mock('./list-adapters.js', () => ({
  fetchListForSubscription: vi.fn()
}));

const mockedFetch = /** @type {import('vitest').Mock} */ (
  fetchListForSubscription
);
const mockedRunBd = /** @type {import('vitest').Mock} */ (runBd);
const mockedRunBdJson = /** @type {import('vitest').Mock} */ (runBdJson);
const mockedGitUserName = /** @type {import('vitest').Mock} */ (getGitUserName);
/** @type {string[]} */
const temp_dirs = [];

function createSocket() {
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

function makeTempWorkspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bdui-ws-'));
  temp_dirs.push(dir);
  return dir;
}

function deferred() {
  /** @type {(value: any) => void} */
  let resolve = () => {};
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/**
 * @param {ReturnType<typeof createSocket>} sock
 * @param {string} issue_id
 */
async function subscribeDetail(sock, issue_id) {
  await handleMessage(
    /** @type {any} */ (sock),
    Buffer.from(
      JSON.stringify({
        id: `sub-${issue_id}`,
        type: /** @type {any} */ ('subscribe-list'),
        payload: {
          id: `detail:${issue_id}`,
          type: 'issue-detail',
          params: { id: issue_id }
        }
      })
    )
  );
}

/**
 * @param {ReturnType<typeof createSocket>} sock
 * @param {string} issue_id
 * @param {string} req_id
 */
async function requestComments(sock, issue_id, req_id) {
  await handleMessage(
    /** @type {any} */ (sock),
    Buffer.from(
      JSON.stringify({
        id: req_id,
        type: /** @type {any} */ ('get-comments'),
        payload: { id: issue_id }
      })
    )
  );
}

/**
 * @param {ReturnType<typeof createSocket>} sock
 * @param {string} root_dir
 */
async function setWorkspace(sock, root_dir) {
  await handleMessage(
    /** @type {any} */ (sock),
    Buffer.from(
      JSON.stringify({
        id: `workspace-${path.basename(root_dir)}`,
        type: /** @type {any} */ ('set-workspace'),
        payload: { path: root_dir }
      })
    )
  );
}

/**
 * @param {ReturnType<typeof createSocket>} sock
 * @param {string} issue_id
 */
async function sendStatusMutation(sock, issue_id) {
  await handleMessage(
    /** @type {any} */ (sock),
    Buffer.from(
      JSON.stringify({
        id: `mut-${issue_id}`,
        type: /** @type {any} */ ('update-status'),
        payload: { id: issue_id, status: 'closed' }
      })
    )
  );
}

/**
 * @param {string} issue_id
 */
function detailItems(issue_id) {
  return [{ id: issue_id, updated_at: 1, closed_at: null }];
}

beforeEach(() => {
  registry.clear();
  mockedFetch.mockReset();
  mockedRunBd.mockReset();
  mockedRunBdJson.mockReset();
  mockedGitUserName.mockReset();
});

afterEach(() => {
  for (const dir of temp_dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('issue-detail snapshot cache', () => {
  test('serves a second subscription from cache', async () => {
    const issue_id = 'CACHE-1';
    mockedFetch.mockResolvedValue({ ok: true, items: detailItems(issue_id) });

    const first_sock = createSocket();
    await subscribeDetail(first_sock, issue_id);
    expect(mockedFetch).toHaveBeenCalledTimes(1);

    const second_sock = createSocket();
    await subscribeDetail(second_sock, issue_id);
    expect(mockedFetch).toHaveBeenCalledTimes(1);

    const snapshot = second_sock.sent
      .map((msg) => JSON.parse(msg))
      .find((msg) => msg.type === 'snapshot');
    expect(snapshot.payload.issues).toEqual(detailItems(issue_id));
  });

  test('invalidates cached details after mutations', async () => {
    const issue_id = 'CACHE-2';
    mockedFetch.mockResolvedValue({ ok: true, items: detailItems(issue_id) });
    mockedRunBd.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
    mockedRunBdJson.mockResolvedValue({
      code: 0,
      stdoutJson: { id: issue_id, status: 'closed' }
    });

    const sock = createSocket();
    await subscribeDetail(sock, issue_id);
    expect(mockedFetch).toHaveBeenCalledTimes(1);

    await sendStatusMutation(sock, issue_id);

    const second_sock = createSocket();
    await subscribeDetail(second_sock, issue_id);
    expect(mockedFetch).toHaveBeenCalledTimes(2);
  });

  test('rejects stale in-flight detail cache writes', async () => {
    const issue_id = 'CACHE-RACE-1';
    const stale = deferred();
    mockedFetch
      .mockImplementationOnce(() => stale.promise)
      .mockResolvedValue({ ok: true, items: detailItems(issue_id) });
    mockedRunBd.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
    mockedRunBdJson.mockResolvedValue({
      code: 0,
      stdoutJson: { id: issue_id, status: 'closed' }
    });

    const first_sock = createSocket();
    const first_subscribe = subscribeDetail(first_sock, issue_id);
    await Promise.resolve();
    expect(mockedFetch).toHaveBeenCalledTimes(1);

    await sendStatusMutation(first_sock, issue_id);
    stale.resolve({ ok: true, items: detailItems(issue_id) });
    await first_subscribe;

    const second_sock = createSocket();
    await subscribeDetail(second_sock, issue_id);
    expect(mockedFetch).toHaveBeenCalledTimes(2);
  });

  test('isolates the same issue id across workspaces', async () => {
    const first_root = makeTempWorkspace();
    const second_root = makeTempWorkspace();
    const issue_id = 'CACHE-WORKSPACE-1';
    mockedFetch
      .mockResolvedValueOnce({
        ok: true,
        items: [{ ...detailItems(issue_id)[0], title: 'First workspace' }]
      })
      .mockResolvedValueOnce({
        ok: true,
        items: [{ ...detailItems(issue_id)[0], title: 'Second workspace' }]
      });

    const first_sock = createSocket();
    await setWorkspace(first_sock, first_root);
    await subscribeDetail(first_sock, issue_id);

    const second_sock = createSocket();
    await setWorkspace(second_sock, second_root);
    await subscribeDetail(second_sock, issue_id);

    expect(mockedFetch).toHaveBeenCalledTimes(2);
    const snapshot = second_sock.sent
      .map((msg) => JSON.parse(msg))
      .find((msg) => msg.type === 'snapshot');
    expect(snapshot.payload.issues[0].title).toBe('Second workspace');
  });
});

describe('comments cache', () => {
  test('serves repeat comment requests from cache', async () => {
    const issue_id = 'CACHE-3';
    const comments = [{ id: 1, issue_id, author: 'alice', text: 'hi' }];
    mockedRunBdJson.mockResolvedValue({ code: 0, stdoutJson: comments });

    const sock = createSocket();
    await requestComments(sock, issue_id, 'req-1');
    await requestComments(sock, issue_id, 'req-2');

    expect(mockedRunBdJson).toHaveBeenCalledTimes(1);
    const replies = sock.sent.map((msg) => JSON.parse(msg));
    expect(replies[0].payload).toEqual(comments);
    expect(replies[1].payload).toEqual(comments);
  });

  test('invalidates cached comments after mutations', async () => {
    const issue_id = 'CACHE-4';
    mockedRunBd.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
    mockedRunBdJson.mockResolvedValue({ code: 0, stdoutJson: [] });

    const sock = createSocket();
    await requestComments(sock, issue_id, 'req-1');
    expect(mockedRunBdJson).toHaveBeenCalledTimes(1);

    await sendStatusMutation(sock, issue_id);
    mockedRunBdJson.mockClear();

    await requestComments(sock, issue_id, 'req-2');
    expect(mockedRunBdJson).toHaveBeenCalledTimes(1);
  });

  test('does not cache failed comment requests', async () => {
    const issue_id = 'CACHE-5';
    mockedRunBdJson
      .mockResolvedValueOnce({ code: 1, stderr: 'nope' })
      .mockResolvedValueOnce({ code: 0, stdoutJson: [] });

    const sock = createSocket();
    await requestComments(sock, issue_id, 'req-1');
    await requestComments(sock, issue_id, 'req-2');

    expect(mockedRunBdJson).toHaveBeenCalledTimes(2);
    const replies = sock.sent.map((msg) => JSON.parse(msg));
    expect(replies[0].ok).toBe(false);
    expect(replies[1].ok).toBe(true);
  });

  test('rejects stale in-flight comment cache writes', async () => {
    const issue_id = 'CACHE-RACE-2';
    const stale = deferred();
    const stale_comments = [{ id: 1, issue_id, text: 'stale' }];
    const fresh_comments = [{ id: 2, issue_id, text: 'fresh' }];
    mockedRunBd.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
    mockedRunBdJson
      .mockImplementationOnce(() => stale.promise)
      .mockResolvedValueOnce({
        code: 0,
        stdoutJson: { id: issue_id, status: 'closed' }
      })
      .mockResolvedValueOnce({ code: 0, stdoutJson: fresh_comments });

    const sock = createSocket();
    const first_comments = requestComments(sock, issue_id, 'req-1');
    await Promise.resolve();
    expect(mockedRunBdJson).toHaveBeenCalledTimes(1);

    await sendStatusMutation(sock, issue_id);
    stale.resolve({ code: 0, stdoutJson: stale_comments });
    await first_comments;

    await requestComments(sock, issue_id, 'req-2');

    expect(mockedRunBdJson).toHaveBeenCalledTimes(3);
    const replies = sock.sent.map((msg) => JSON.parse(msg));
    expect(replies[replies.length - 1].payload).toEqual(fresh_comments);
  });

  test('uses the selected workspace for comment requests', async () => {
    const root_dir = makeTempWorkspace();
    const issue_id = 'CACHE-CWD-1';
    mockedRunBdJson.mockResolvedValue({ code: 0, stdoutJson: [] });

    const sock = createSocket();
    await setWorkspace(sock, root_dir);
    await requestComments(sock, issue_id, 'req-cwd');

    expect(mockedRunBdJson).toHaveBeenLastCalledWith(
      ['comments', issue_id, '--json'],
      { cwd: root_dir }
    );
  });

  test('uses the selected workspace when adding comments', async () => {
    const root_dir = makeTempWorkspace();
    const issue_id = 'CACHE-CWD-2';
    mockedGitUserName.mockResolvedValue('Alice');
    mockedRunBd.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
    mockedRunBdJson.mockResolvedValue({ code: 0, stdoutJson: [] });

    const sock = createSocket();
    await setWorkspace(sock, root_dir);
    await handleMessage(
      /** @type {any} */ (sock),
      Buffer.from(
        JSON.stringify({
          id: 'add-comment-cwd',
          type: /** @type {any} */ ('add-comment'),
          payload: { id: issue_id, text: 'hello' }
        })
      )
    );

    expect(mockedGitUserName).toHaveBeenCalledWith({ cwd: root_dir });
    expect(mockedRunBd).toHaveBeenCalledWith(
      ['comments', 'add', issue_id, 'hello', '--author', 'Alice'],
      { cwd: root_dir }
    );
    expect(mockedRunBdJson).toHaveBeenLastCalledWith(
      ['comments', issue_id, '--json'],
      { cwd: root_dir }
    );
  });
});
