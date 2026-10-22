#!/usr/bin/env node
/**
 * Exercise the real UI WebSocket backend against disposable Beads 1.3.1 data.
 * Never accepts a workspace argument: all writes target newly created fixtures.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';
import { createSubscriptionIssueStore } from '../app/data/subscription-issue-store.js';
import { resolveWorkspaceDatabase } from '../server/db.js';
import { registerWorkspace } from '../server/registry-watcher.js';
import { watchDb } from '../server/watcher.js';
import { attachWsServer } from '../server/ws.js';

const bd_bin = process.env.BD_BIN || 'bd';
const version = execFileSync(bd_bin, ['--version'], { encoding: 'utf8' });
assert.match(
  version,
  /^bd version 1\.3\.1\b/,
  'Use the pinned bd 1.3.1 binary'
);
const fixture = mkdtempSync(path.join(os.tmpdir(), 'beads-ui-compat-'));
const home_dir = path.join(fixture, 'home');
mkdirSync(home_dir);
// Isolate registry/config lookup as well as the database and git identity.
process.env.HOME = home_dir;
delete process.env.BEADS_DB;
delete process.env.BEADS_DIR;
const workspace = path.join(fixture, 'project');
const other_workspace = path.join(fixture, 'other');
const old_cwd = process.cwd();
const server = createServer();
/** @type {WebSocket | undefined} */
let socket;
/** @type {ReturnType<typeof watchDb> | undefined} */
let watcher;
/** @type {ReturnType<typeof attachWsServer> | undefined} */
let backend;
const timeout = setTimeout(() => {
  console.error('Beads compatibility integration timed out');
  process.exit(1);
}, 300000);

/**
 * Execute the actual pinned CLI, never a mock or shell string.
 *
 * @param {string[]} args
 * @param {string} [cwd]
 */
function bd(args, cwd = workspace) {
  return execFileSync(bd_bin, ['--sandbox', ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 30000,
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

/**
 * @param {string} cwd
 * @param {string} prefix
 */
function initWorkspace(cwd, prefix) {
  mkdirSync(cwd);
  for (const args of [
    ['init', '-q'],
    ['config', 'user.name', 'Compatibility Test'],
    ['config', 'user.email', 'compat@example.invalid'],
    ['config', 'beads.role', 'maintainer']
  ]) {
    execFileSync('git', args, { cwd, stdio: 'pipe' });
  }
  bd(['init', '--prefix', prefix, '--non-interactive'], cwd);
  const database = resolveWorkspaceDatabase({ cwd });
  assert.equal(database.source, 'metadata');
  registerWorkspace({ path: cwd, database: database.path });
}

/** @type {Map<string, {resolve: (value:any)=>void, reject:(error:Error)=>void}>} */
const pending = new Map();
/** @type {Map<string, readonly any[]>} */
const snapshots = new Map();
/** @type {Map<string, ReturnType<typeof createSubscriptionIssueStore>>} */
const issue_stores = new Map();
let next_id = 0;

/**
 * @param {string} type
 * @param {Record<string, unknown>} payload
 * @param {boolean} [ok]
 */
async function request(type, payload, ok = true) {
  const id = String(++next_id);
  const result = new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
  assert.ok(socket);
  socket.send(JSON.stringify({ id, type, payload }));
  const reply = await result;
  assert.equal(reply.ok, ok, `${type}: ${JSON.stringify(reply.error)}`);
  console.log(`verified ${type}`);
  return reply.payload;
}

/**
 * @param {string} type
 * @param {Record<string, string>} [params]
 */
async function readList(type, params = {}) {
  const id = `list-${++next_id}`;
  await request('subscribe-list', { id, type, params });
  const issues = snapshots.get(id);
  assert.ok(Array.isArray(issues), `Missing ${type} snapshot`);
  await request('unsubscribe-list', { id });
  return issues;
}

try {
  initWorkspace(workspace, 'compat');
  initWorkspace(other_workspace, 'other');
  process.chdir(workspace);
  watcher = watchDb(workspace, () => backend?.scheduleListRefresh());
  backend = attachWsServer(server, {
    root_dir: workspace,
    watcher,
    refresh_debounce_ms: 20
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
  socket.on('message', (data) => {
    const message = JSON.parse(String(data));
    if (['snapshot', 'upsert', 'delete'].includes(message.type)) {
      const id = message.payload.id;
      let store = issue_stores.get(id);
      if (!store) {
        store = createSubscriptionIssueStore(id);
        issue_stores.set(id, store);
      }
      store.applyPush({ ...message.payload, type: message.type });
      snapshots.set(id, store.snapshot());
    }
    const handler = pending.get(message.id);
    if (handler) {
      pending.delete(message.id);
      handler.resolve(message);
    }
  });
  await once(socket, 'open');
  const registry = await request('list-workspaces', {});
  assert.deepEqual(
    registry.workspaces.map((/** @type {any} */ w) => w.path).sort(),
    [other_workspace, workspace]
  );
  await request('set-workspace', { path: workspace });

  const types = [
    'bug',
    'feature',
    'task',
    'epic',
    'chore',
    'decision',
    'spike',
    'story',
    'milestone'
  ];
  for (const type of types) {
    await request('create-issue', {
      title: `Fixture ${type}`,
      type,
      priority: 2,
      description: 'Compatibility fixture'
    });
  }
  const created = JSON.parse(bd(['list', '--all', '--limit', '0', '--json']));
  for (const type of types) {
    assert.equal(
      created.filter((/** @type {any} */ i) => i.issue_type === type).length,
      1,
      type
    );
  }
  const id = created.find(
    (/** @type {any} */ i) => i.issue_type === 'story'
  ).id;
  const dependency = created.find(
    (/** @type {any} */ i) => i.issue_type === 'task'
  ).id;
  for (const type of types) {
    await request('update-type', { id, type });
    assert.equal(JSON.parse(bd(['show', id, '--json']))[0].issue_type, type);
  }
  await request('update-type', { id, type: 'story' });
  await request(
    'create-issue',
    { title: 'Must not exist', type: 'typo' },
    false
  );
  await request('update-type', { id, type: 'typo' }, false);
  for (const [field, value] of Object.entries({
    title: 'Edited story',
    description: 'Edited description',
    acceptance: 'Acceptance',
    design: 'Design',
    notes: 'Notes'
  })) {
    await request('edit-text', { id, field, value });
    const issue = JSON.parse(bd(['show', id, '--json']))[0];
    assert.equal(
      issue[field === 'acceptance' ? 'acceptance_criteria' : field],
      value
    );
  }
  await request('update-priority', { id, priority: 1 });
  await request('update-assignee', { id, assignee: 'compat-reader' });
  await request('label-add', { id, label: 'compat-label' });
  assert.ok(
    JSON.parse(bd(['show', id, '--json']))[0].labels.includes('compat-label')
  );
  await request('label-remove', { id, label: 'compat-label' });
  await request('add-comment', { id, text: 'Compatibility comment' });
  const comments = await request('get-comments', { id });
  assert.ok(
    comments.some((/** @type {any} */ c) => c.text === 'Compatibility comment')
  );
  await request('dep-add', { a: id, b: dependency });
  assert.ok((await readList('blocked-issues')).some((i) => i.id === id));
  await request('dep-remove', { a: id, b: dependency });
  assert.ok(!(await readList('blocked-issues')).some((i) => i.id === id));
  for (const status of [
    'in_progress',
    'blocked',
    'deferred',
    'closed',
    'open'
  ]) {
    await request('update-status', { id, status });
    assert.equal(JSON.parse(bd(['show', id, '--json']))[0].status, status);
  }
  for (const type of [
    'all-issues',
    'ready-issues',
    'epics',
    'status-blocked-issues',
    'in-progress-issues',
    'closed-issues'
  ]) {
    await readList(type);
  }
  assert.equal((await readList('issue-detail', { id }))[0].id, id);
  const issue = JSON.parse(bd(['show', id, '--json']))[0];
  assert.equal(issue.priority, 1);
  assert.equal(issue.assignee, 'compat-reader');

  await request('set-workspace', { path: other_workspace });
  assert.equal((await readList('all-issues')).length, 0);
  await request('create-issue', {
    title: 'Other project story',
    type: 'story'
  });
  assert.equal((await readList('all-issues')).length, 1);
  await request('set-workspace', { path: workspace });
  assert.equal((await readList('all-issues')).length, 9);

  await request('subscribe-list', {
    id: 'external-writer',
    type: 'all-issues'
  });
  bd(['update', id, '--title', 'Externally updated story']);
  const until = Date.now() + 10000;
  while (
    !snapshots
      .get('external-writer')
      ?.some((i) => i.id === id && i.title === 'Externally updated story') &&
    Date.now() < until
  ) {
    await delay(50);
  }
  assert.ok(
    snapshots
      .get('external-writer')
      ?.some((i) => i.id === id && i.title === 'Externally updated story'),
    'Dolt external-writer changes must refresh the UI'
  );
  await request('unsubscribe-list', { id: 'external-writer' });
  await request('delete-issue', { id });
  assert.ok(
    !JSON.parse(bd(['list', '--all', '--limit', '0', '--json'])).some(
      (/** @type {any} */ i) => i.id === id
    )
  );
  console.log(
    'Beads 1.3.1 real CLI/Dolt compatibility passed (disposable workspaces only).'
  );
} finally {
  clearTimeout(timeout);
  watcher?.close();
  socket?.terminate();
  for (const client of backend?.wss.clients || []) client.terminate();
  backend?.wss.close();
  server.close();
  process.chdir(old_cwd);
  rmSync(fixture, { recursive: true, force: true });
}
