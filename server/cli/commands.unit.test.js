import path from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { handleStart, handleStop } from './commands.js';
import * as daemon from './daemon.js';
import * as open from './open.js';

// Mock open.js to avoid external effects
vi.mock('./open.js', () => ({
  openUrl: async () => true,
  waitForServer: async () => {},
  registerWorkspaceWithServer: vi.fn(async () => true)
}));

// Mock db resolution
vi.mock('../db.js', () => ({
  resolveDbPath: () => ({
    path: path.join(process.cwd(), '.beads', 'workspace.db'),
    source: 'nearest',
    exists: true
  }),
  resolveWorkspaceDatabase: () => ({
    path: path.join(process.cwd(), '.beads'),
    source: 'metadata',
    exists: true
  })
}));

// Mock config
vi.mock('../config.js', () => ({
  getConfig: () => ({ url: 'http://127.0.0.1:3000' })
}));

describe('handleStart (unit)', () => {
  test('returns 1 when daemon start fails', async () => {
    vi.spyOn(daemon, 'readPidFile').mockReturnValue(null);
    vi.spyOn(daemon, 'isProcessRunning').mockReturnValue(false);
    vi.spyOn(daemon, 'startDaemon').mockReturnValue(null);

    const code = await handleStart({ open: false });

    expect(code).toBe(1);
  });

  test('returns 0 when already running', async () => {
    vi.spyOn(daemon, 'readPidFile').mockReturnValue(12345);
    vi.spyOn(daemon, 'isProcessRunning').mockReturnValue(true);
    const print_url = vi
      .spyOn(daemon, 'printServerUrl')
      .mockImplementation(() => {});

    const code = await handleStart({ open: false });

    expect(code).toBe(0);
    expect(print_url).not.toHaveBeenCalled();
  });

  test('registers workspace from metadata when already running', async () => {
    const register_workspace_with_server =
      /** @type {import('vitest').Mock} */ (open.registerWorkspaceWithServer);
    register_workspace_with_server.mockReset();
    vi.spyOn(daemon, 'readPidFile').mockReturnValue(12345);
    vi.spyOn(daemon, 'isProcessRunning').mockReturnValue(true);

    const code = await handleStart({ open: false });

    expect(code).toBe(0);
    expect(register_workspace_with_server).toHaveBeenCalledTimes(1);
    expect(register_workspace_with_server).toHaveBeenCalledWith(
      'http://127.0.0.1:3000',
      {
        path: process.cwd(),
        database: path.join(process.cwd(), '.beads')
      }
    );
  });
});

describe('handleStop (unit)', () => {
  test('returns 2 when not running and no PID file', async () => {
    vi.spyOn(daemon, 'readPidFile').mockReturnValue(null);

    const code = await handleStop();

    expect(code).toBe(2);
  });

  test('returns 2 on stale PID and removes file', async () => {
    vi.spyOn(daemon, 'readPidFile').mockReturnValue(1111);
    vi.spyOn(daemon, 'isProcessRunning').mockReturnValue(false);
    const remove_pid = vi
      .spyOn(daemon, 'removePidFile')
      .mockImplementation(() => {});

    const code = await handleStop();

    expect(code).toBe(2);
    expect(remove_pid).toHaveBeenCalledTimes(1);
  });

  test('returns 0 when process terminates and removes PID', async () => {
    vi.spyOn(daemon, 'readPidFile').mockReturnValue(2222);
    vi.spyOn(daemon, 'isProcessRunning').mockReturnValue(true);
    vi.spyOn(daemon, 'terminateProcess').mockResolvedValue(true);
    const remove_pid = vi
      .spyOn(daemon, 'removePidFile')
      .mockImplementation(() => {});

    const code = await handleStop();

    expect(code).toBe(0);
    expect(remove_pid).toHaveBeenCalledTimes(1);
  });
});
