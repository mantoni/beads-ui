import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi
} from 'vitest';
import { handleRestart, handleStart, handleStop } from './commands.js';
import * as daemon from './daemon.js';

// Mock browser open + readiness wait to avoid external effects and flakiness
vi.mock('./open.js', () => ({
  openUrl: async () => true,
  waitForServer: async () => {},
  registerWorkspaceWithServer: async () => true
}));

// Mock db resolution to avoid file system dependencies
vi.mock('../db.js', () => ({
  resolveDbPath: () => ({
    path: '/mock/test.db',
    source: 'nearest',
    exists: false
  })
}));

/** @type {string} */
let tmp_runtime_dir;
/** @type {Record<string, string | undefined>} */
let prev_env;

beforeAll(() => {
  // Snapshot selected env vars to restore later
  prev_env = {
    BDUI_RUNTIME_DIR: process.env.BDUI_RUNTIME_DIR,
    PORT: process.env.PORT
  };

  tmp_runtime_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bdui-it-'));
  process.env.BDUI_RUNTIME_DIR = tmp_runtime_dir;
  // Use port 0 so OS assigns an ephemeral port; URL printing still occurs
  process.env.PORT = '0';
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(async () => {
  // Ensure no stray daemon is left between tests
  const pid = daemon.readPidFile();
  if (pid && daemon.isProcessRunning(pid)) {
    await daemon.terminateProcess(pid, 2000);
  }
  daemon.removePidFile();
});

afterAll(() => {
  // Restore env
  if (prev_env.BDUI_RUNTIME_DIR === undefined) {
    delete process.env.BDUI_RUNTIME_DIR;
  } else {
    process.env.BDUI_RUNTIME_DIR = prev_env.BDUI_RUNTIME_DIR;
  }

  if (prev_env.PORT === undefined) {
    delete process.env.PORT;
  } else {
    process.env.PORT = prev_env.PORT;
  }

  try {
    fs.rmSync(tmp_runtime_dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe('commands integration', () => {
  test('start then stop returns 0 and manages PID file', async () => {
    // setup
    vi.spyOn(daemon, 'printServerUrl').mockImplementation(() => {});

    // execution
    const start_code = await handleStart({ open: false });

    // assertion
    expect(start_code).toBe(0);
    const pid_after_start = daemon.readPidFile();
    expect(typeof pid_after_start).toBe('number');
    expect(Number(pid_after_start)).toBeGreaterThan(0);

    // execution
    const stop_code = await handleStop();

    // assertion
    expect(stop_code).toBe(0);
    const pid_after_stop = daemon.readPidFile();
    expect(pid_after_stop).toBeNull();
  });

  test('stop returns 2 when not running', async () => {
    // execution
    const code = await handleStop();

    // assertion
    expect(code).toBe(2);
  });

  test('start is idempotent when already running', async () => {
    // setup
    await handleStart({ open: false });
    const start_spy = vi.spyOn(daemon, 'startDaemon');

    // execution
    const code = await handleStart({ open: false });

    // assertion
    expect(code).toBe(0);
    expect(start_spy).not.toHaveBeenCalled();

    // cleanup
    await handleStop();
  });

  test('restart stops (when needed) and starts', async () => {
    // setup
    vi.spyOn(daemon, 'printServerUrl').mockImplementation(() => {});

    // execution
    const code = await handleRestart();

    // assertion
    expect(code).toBe(0);
    const pid = daemon.readPidFile();
    expect(typeof pid).toBe('number');

    // cleanup
    await handleStop();
  });

  test('start with --host option sets environment variable', async () => {
    vi.spyOn(daemon, 'printServerUrl').mockImplementation(() => {});
    const prev_host = process.env.HOST;

    const code = await handleStart({ host: '0.0.0.0' });

    expect(code).toBe(0);
    // Env var should be set for the started daemon
    expect(process.env.HOST).toBe('0.0.0.0');

    await handleStop();
    // Restore original env var
    if (prev_host === undefined) {
      delete process.env.HOST;
    } else {
      process.env.HOST = prev_host;
    }
  });
});
