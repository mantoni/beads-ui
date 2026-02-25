import { spawn as spawnMock } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { getBdBin, getGitUserName, runBd, runBdJson } from './bd.js';

// Mock child_process.spawn before importing the module under test
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
  // Simulate async emission
  setTimeout(() => {
    if (stdoutText) {
      out.write(stdoutText);
    }
    out.end();
    if (stderrText) {
      err.write(stderrText);
    }
    err.end();
    cp.emit('close', code);
  }, 0);
  return cp;
}

const mockedSpawn = /** @type {import('vitest').Mock} */ (spawnMock);
/** @type {string[]} */
const temp_dirs = [];

function make_temp_dir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bdui-bd-'));
  temp_dirs.push(dir);
  return dir;
}

beforeEach(() => {
  mockedSpawn.mockReset();
});

afterEach(() => {
  for (const dir of temp_dirs.splice(0)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
});

describe('getBdBin', () => {
  test('returns env BD_BIN when set', () => {
    const prev = process.env.BD_BIN;
    process.env.BD_BIN = '/custom/bd';
    expect(getBdBin()).toBe('/custom/bd');
    if (prev) {
      process.env.BD_BIN = prev;
    } else {
      delete process.env.BD_BIN;
    }
  });
});

describe('runBd', () => {
  test('returns stdout/stderr and exit code', async () => {
    mockedSpawn.mockReturnValueOnce(makeFakeProc('ok', '', 0));
    const res = await runBd(['--version']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('ok');
  });

  test('non-zero exit propagates code and stderr', async () => {
    mockedSpawn.mockReturnValueOnce(makeFakeProc('', 'boom', 1));
    const res = await runBd(['list']);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('boom');
  });

  test('sets BEADS_DB for workspace-local SQLite db', async () => {
    const root = make_temp_dir();
    const beads_dir = path.join(root, '.beads');
    fs.mkdirSync(beads_dir, { recursive: true });
    const workspace_db = path.join(beads_dir, 'ui.db');
    fs.writeFileSync(workspace_db, '');

    mockedSpawn.mockReturnValueOnce(makeFakeProc('ok', '', 0));
    await runBd(['list'], { cwd: root, env: {} });

    const options = mockedSpawn.mock.calls[0][2];
    expect(options.env.BEADS_DB).toBe(workspace_db);
  });

  test('does not force BEADS_DB when workspace has no local SQLite db', async () => {
    const root = make_temp_dir();

    mockedSpawn.mockReturnValueOnce(makeFakeProc('ok', '', 0));
    await runBd(['list'], { cwd: root, env: {} });

    const options = mockedSpawn.mock.calls[0][2];
    expect(options.env.BEADS_DB).toBeUndefined();
  });

  test('preserves explicit BEADS_DB from caller env', async () => {
    mockedSpawn.mockReturnValueOnce(makeFakeProc('ok', '', 0));
    await runBd(['list'], { env: { BEADS_DB: '/custom/workspace.db' } });

    const options = mockedSpawn.mock.calls[0][2];
    expect(options.env.BEADS_DB).toBe('/custom/workspace.db');
  });
});

describe('runBdJson', () => {
  test('parses valid JSON output', async () => {
    const json = JSON.stringify([{ id: 'UI-1' }]);
    mockedSpawn.mockReturnValueOnce(makeFakeProc(json, '', 0));
    const res = await runBdJson(['list', '--json']);
    expect(res.code).toBe(0);
    expect(Array.isArray(res.stdoutJson)).toBe(true);
  });

  test('invalid JSON yields stderr message with code 0', async () => {
    mockedSpawn.mockReturnValueOnce(makeFakeProc('not-json', '', 0));
    const res = await runBdJson(['list', '--json']);
    expect(res.code).toBe(0);
    expect(res.stderr).toContain('Invalid JSON');
  });

  test('non-zero exit returns code and stderr', async () => {
    mockedSpawn.mockReturnValueOnce(makeFakeProc('', 'oops', 2));
    const res = await runBdJson(['list', '--json']);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain('oops');
  });
});

describe('getGitUserName', () => {
  test('returns git user name on success', async () => {
    mockedSpawn.mockReturnValueOnce(makeFakeProc('Alice Smith\n', '', 0));
    const name = await getGitUserName();
    expect(name).toBe('Alice Smith');
  });

  test('returns empty string on failure', async () => {
    mockedSpawn.mockReturnValueOnce(makeFakeProc('', 'error', 1));
    const name = await getGitUserName();
    expect(name).toBe('');
  });
});
