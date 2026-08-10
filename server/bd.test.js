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

/** Create a child process that closes only when directed by the test. */
function makeControlledProc() {
  const cp = /** @type {any} */ (new EventEmitter());
  const out = new PassThrough();
  const err = new PassThrough();
  cp.stdout = out;
  cp.stderr = err;
  return {
    cp,
    close() {
      out.end();
      err.end();
      cp.emit('close', 0);
    }
  };
}

const mockedSpawn = /** @type {import('vitest').Mock} */ (spawnMock);
/** @type {string[]} */
const temp_dirs = [];

function make_temp_dir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bdui-bd-'));
  temp_dirs.push(dir);
  return dir;
}

/**
 * @param {unknown[]} values
 * @param {number} length
 */
async function waitForLength(values, length) {
  for (let index = 0; index < 20; index += 1) {
    if (values.length >= length) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`timed out waiting for length ${length}`);
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
  test('prepends --sandbox by default', async () => {
    mockedSpawn.mockReturnValueOnce(makeFakeProc('ok', '', 0));
    await runBd(['list', '--json']);

    const args = mockedSpawn.mock.calls[0][1];
    expect(args[0]).toBe('--sandbox');
    expect(args.slice(1)).toEqual(['list', '--json']);
  });

  test('does not duplicate --sandbox when caller already provides it', async () => {
    mockedSpawn.mockReturnValueOnce(makeFakeProc('ok', '', 0));
    await runBd(['--sandbox', 'list', '--json']);

    const args = mockedSpawn.mock.calls[0][1];
    expect(args).toEqual(['--sandbox', 'list', '--json']);
  });

  test('allows disabling default sandbox via BDUI_BD_SANDBOX', async () => {
    const prev = process.env.BDUI_BD_SANDBOX;
    process.env.BDUI_BD_SANDBOX = '0';
    mockedSpawn.mockReturnValueOnce(makeFakeProc('ok', '', 0));

    await runBd(['list', '--json']);

    const args = mockedSpawn.mock.calls[0][1];
    expect(args).toEqual(['list', '--json']);

    if (prev === undefined) {
      delete process.env.BDUI_BD_SANDBOX;
    } else {
      process.env.BDUI_BD_SANDBOX = prev;
    }
  });

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

  test('logs non-zero exit with args and stderr (parity with runBdJson)', async () => {
    // Enable the bd debug namespace and capture stderr writes so we can
    // assert the new exit log fires. Without this log, write failures from
    // mutation handlers (which use runBd, not runBdJson) leave no trace.
    const debug_mod = await import('debug');
    const prev_enabled = process.env.DEBUG;
    debug_mod.default.enable('beads-ui:bd');

    /** @type {string[]} */
    const captured = [];
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(
      /** @param {any} chunk */ (chunk) => {
        captured.push(String(chunk));
        return true;
      }
    );

    try {
      mockedSpawn.mockReturnValueOnce(makeFakeProc('', 'boom', 2));
      const res = await runBd(['update', 'UI-7', '--status', 'in_progress']);
      expect(res.code).toBe(2);

      const joined = captured.join('');
      expect(joined).toMatch(/beads-ui:bd/);
      expect(joined).toMatch(/code 2/);
      expect(joined).toMatch(/update/);
      expect(joined).toMatch(/boom/);
    } finally {
      spy.mockRestore();
      if (prev_enabled === undefined) {
        debug_mod.default.disable();
      } else {
        debug_mod.default.enable(prev_enabled);
      }
    }
  });

  test('runs interactive commands before queued background commands', async () => {
    /** @type {string[]} */
    const order = [];
    mockedSpawn.mockImplementation((_bin, args) => {
      const command = /** @type {string[]} */ (args)
        .filter((arg) => arg !== '--sandbox')
        .join(' ');
      order.push(command);
      return makeFakeProc('ok', '', 0);
    });

    const first = runBd(['list', 'background-1'], {
      priority: 'background'
    });
    const second = runBd(['list', 'background-2'], {
      priority: 'background'
    });
    const interactive = runBd(['show', 'interactive']);
    await Promise.all([first, second, interactive]);

    expect(order).toEqual([
      'list background-1',
      'show interactive',
      'list background-2'
    ]);
  });

  test('runs background commands after bounded interactive bursts', async () => {
    /** @type {string[]} */
    const order = [];
    mockedSpawn.mockImplementation((_bin, args) => {
      const command = /** @type {string[]} */ (args)
        .filter((arg) => arg !== '--sandbox')
        .join(' ');
      order.push(command);
      return makeFakeProc('ok', '', 0);
    });

    const first = runBd(['show', 'interactive-0']);
    const background = runBd(['list', 'background'], {
      priority: 'background'
    });
    const interactive = Array.from({ length: 5 }, (_value, index) =>
      runBd(['show', `interactive-${index + 1}`])
    );
    await Promise.all([first, background, ...interactive]);

    expect(order).toEqual([
      'show interactive-0',
      'show interactive-1',
      'show interactive-2',
      'show interactive-3',
      'show interactive-4',
      'list background',
      'show interactive-5'
    ]);
  });

  test('does not count bursts while no background work is waiting', async () => {
    /** @type {string[]} */
    const order = [];
    /** @type {Array<() => void>} */
    const close_spawned = [];
    mockedSpawn.mockImplementation((_bin, args) => {
      const command = /** @type {string[]} */ (args)
        .filter((arg) => arg !== '--sandbox')
        .join(' ');
      order.push(command);
      const proc = makeControlledProc();
      close_spawned.push(proc.close);
      return proc.cp;
    });

    const first = runBd(['show', 'interactive-0']);
    const initial = Array.from({ length: 4 }, (_value, index) =>
      runBd(['show', `interactive-${index + 1}`])
    );
    await waitForLength(order, 1);
    for (let index = 0; index < 4; index += 1) {
      close_spawned[index]();
      await waitForLength(order, index + 2);
    }

    const background = runBd(['list', 'background'], {
      priority: 'background'
    });
    const late_interactive = runBd(['show', 'interactive-5']);
    close_spawned[4]();
    await waitForLength(order, 6);
    close_spawned[5]();
    await waitForLength(order, 7);
    close_spawned[6]();
    await Promise.all([first, ...initial, background, late_interactive]);

    expect(order).toEqual([
      'show interactive-0',
      'show interactive-1',
      'show interactive-2',
      'show interactive-3',
      'show interactive-4',
      'show interactive-5',
      'list background'
    ]);
  });

  test('continues after a queued operation rejects', async () => {
    mockedSpawn
      .mockImplementationOnce(() => {
        throw new Error('spawn failed');
      })
      .mockReturnValueOnce(makeFakeProc('ok', '', 0));

    const failed = runBd(['list', 'first'], { priority: 'background' });
    const succeeded = runBd(['show', 'second']);

    await expect(failed).rejects.toThrow('spawn failed');
    await expect(succeeded).resolves.toMatchObject({ code: 0 });
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
