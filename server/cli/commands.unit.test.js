import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { handleRestart, handleStart, handleStop } from './commands.js';
import * as daemon from './daemon.js';
import * as open from './open.js';

// Mock open.js to avoid external effects
vi.mock('./open.js', () => ({
  openUrl: async () => true,
  waitForServer: async () => {},
  fetchWorkspacesFromServer: vi.fn(async () => []),
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

// Mock config - mirrors real getConfig() so env var overrides are testable
vi.mock('../config.js', () => ({
  getConfig: () => {
    const port = Number.parseInt(process.env.PORT || '', 10) || 3000;
    const host = process.env.HOST || '127.0.0.1';
    return { host, port, url: `http://${host}:${port}` };
  }
}));

afterEach(() => {
  delete process.env.PORT;
  delete process.env.HOST;
});

describe('handleStart (unit)', () => {
  test('returns 1 when daemon start fails', async () => {
    vi.spyOn(daemon, 'readPidFile').mockReturnValue(null);
    vi.spyOn(daemon, 'isProcessRunning').mockReturnValue(false);
    vi.spyOn(daemon, 'findAvailablePort').mockResolvedValue(3000);
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

  test('registers workspace at custom port when already running', async () => {
    const register_workspace_with_server =
      /** @type {import('vitest').Mock} */ (open.registerWorkspaceWithServer);
    register_workspace_with_server.mockReset();
    vi.spyOn(daemon, 'readPidFile').mockReturnValue(12345);
    vi.spyOn(daemon, 'isProcessRunning').mockReturnValue(true);

    const code = await handleStart({ open: false, port: 3030 });

    expect(code).toBe(0);
    expect(register_workspace_with_server).toHaveBeenCalledTimes(1);
    expect(register_workspace_with_server).toHaveBeenCalledWith(
      'http://127.0.0.1:3030',
      {
        path: process.cwd(),
        database: path.join(process.cwd(), '.beads')
      }
    );
  });

  test('registers workspace with existing server when spawned daemon exits early', async () => {
    const register_workspace_with_server =
      /** @type {import('vitest').Mock} */ (open.registerWorkspaceWithServer);
    register_workspace_with_server.mockReset();

    const remove_pid = vi
      .spyOn(daemon, 'removePidFile')
      .mockImplementation(() => {});

    vi.spyOn(daemon, 'readPidFile').mockReturnValue(null);
    vi.spyOn(daemon, 'findAvailablePort').mockResolvedValue(3000);
    vi.spyOn(daemon, 'startDaemon').mockReturnValue({ pid: 7777 });
    vi.spyOn(daemon, 'isProcessRunning').mockImplementation((pid) => pid === 1);

    const code = await handleStart({ open: false });

    expect(code).toBe(0);
    expect(remove_pid).toHaveBeenCalledTimes(1);
    expect(register_workspace_with_server).toHaveBeenCalledTimes(1);
    expect(register_workspace_with_server).toHaveBeenCalledWith(
      'http://127.0.0.1:3000',
      {
        path: process.cwd(),
        database: path.join(process.cwd(), '.beads')
      }
    );
  });

  test('attempts workspace registration after successful daemon start', async () => {
    const register_workspace_with_server =
      /** @type {import('vitest').Mock} */ (open.registerWorkspaceWithServer);
    register_workspace_with_server.mockReset();

    const print_url = vi
      .spyOn(daemon, 'printServerUrl')
      .mockImplementation(() => {});

    vi.spyOn(daemon, 'readPidFile').mockReturnValue(null);
    vi.spyOn(daemon, 'findAvailablePort').mockResolvedValue(3000);
    vi.spyOn(daemon, 'startDaemon').mockReturnValue({ pid: 4321 });
    vi.spyOn(daemon, 'isProcessRunning').mockImplementation(
      (pid) => pid === 4321
    );

    const code = await handleStart({ open: false });

    expect(code).toBe(0);
    expect(print_url).toHaveBeenCalledTimes(1);
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

describe('handleRestart (unit)', () => {
  test('reuses detected port when no explicit port given', async () => {
    // First call: restart reads PID (running daemon)
    // Second call: handleStop reads PID (to terminate)
    // Third call: handleStart reads PID (no existing daemon after stop)
    vi.spyOn(daemon, 'readPidFile')
      .mockReturnValueOnce(3333) // restart: detect port
      .mockReturnValueOnce(3333) // handleStop: find process
      .mockReturnValueOnce(null); // handleStart: no existing
    vi.spyOn(daemon, 'detectListeningPort').mockReturnValue(4000);
    vi.spyOn(daemon, 'findAvailablePort').mockResolvedValue(4000);
    vi.spyOn(daemon, 'isProcessRunning').mockImplementation(
      (pid) => pid === 3333 || pid === 5555
    );
    vi.spyOn(daemon, 'terminateProcess').mockResolvedValue(true);
    vi.spyOn(daemon, 'removePidFile').mockImplementation(() => {});
    vi.spyOn(daemon, 'printServerUrl').mockImplementation(() => {});

    const start_daemon = vi
      .spyOn(daemon, 'startDaemon')
      .mockReturnValue({ pid: 5555 });

    const code = await handleRestart();

    expect(code).toBe(0);
    expect(start_daemon).toHaveBeenCalledWith(
      expect.objectContaining({ port: 4000 })
    );
  });

  test('explicit port overrides detected port', async () => {
    vi.spyOn(daemon, 'readPidFile')
      .mockReturnValueOnce(3333)
      .mockReturnValueOnce(3333)
      .mockReturnValueOnce(null);
    vi.spyOn(daemon, 'detectListeningPort').mockReturnValue(4000);
    vi.spyOn(daemon, 'isProcessRunning').mockImplementation(
      (pid) => pid === 3333 || pid === 6666
    );
    vi.spyOn(daemon, 'terminateProcess').mockResolvedValue(true);
    vi.spyOn(daemon, 'removePidFile').mockImplementation(() => {});

    const start_daemon = vi
      .spyOn(daemon, 'startDaemon')
      .mockReturnValue({ pid: 6666 });

    const code = await handleRestart({ port: 9999 });

    expect(code).toBe(0);
    expect(start_daemon).toHaveBeenCalledWith(
      expect.objectContaining({ port: 9999 })
    );
  });

  test('falls back to default when port detection fails', async () => {
    vi.spyOn(daemon, 'readPidFile')
      .mockReturnValueOnce(3333)
      .mockReturnValueOnce(3333)
      .mockReturnValueOnce(null);
    vi.spyOn(daemon, 'detectListeningPort').mockReturnValue(null);
    vi.spyOn(daemon, 'findAvailablePort').mockResolvedValue(3000);
    vi.spyOn(daemon, 'isProcessRunning').mockImplementation(
      (pid) => pid === 3333 || pid === 7777
    );
    vi.spyOn(daemon, 'terminateProcess').mockResolvedValue(true);
    vi.spyOn(daemon, 'removePidFile').mockImplementation(() => {});
    vi.spyOn(daemon, 'printServerUrl').mockImplementation(() => {});

    const start_daemon = vi
      .spyOn(daemon, 'startDaemon')
      .mockReturnValue({ pid: 7777 });

    const code = await handleRestart();

    expect(code).toBe(0);
    // port should not be set — falls through to default
    expect(start_daemon.mock.calls[0]?.[0]).toEqual(
      expect.not.objectContaining({ port: expect.any(Number) })
    );
  });

  test('re-registers workspaces from previous server after restart', async () => {
    const fetch_workspaces = /** @type {import('vitest').Mock} */ (
      open.fetchWorkspacesFromServer
    );
    fetch_workspaces.mockResolvedValueOnce([
      { path: '/project/a', database: '/project/a/.beads' },
      { path: '/project/b', database: '/project/b/.beads' }
    ]);

    const register_workspace = /** @type {import('vitest').Mock} */ (
      open.registerWorkspaceWithServer
    );
    register_workspace.mockReset();

    vi.spyOn(daemon, 'readPidFile')
      .mockReturnValueOnce(3333) // restart: detect port
      .mockReturnValueOnce(3333) // handleStop: find process
      .mockReturnValueOnce(null); // handleStart: no existing
    vi.spyOn(daemon, 'detectListeningPort').mockReturnValue(null);
    vi.spyOn(daemon, 'isProcessRunning').mockImplementation(
      (pid) => pid === 3333 || pid === 9999
    );
    vi.spyOn(daemon, 'terminateProcess').mockResolvedValue(true);
    vi.spyOn(daemon, 'removePidFile').mockImplementation(() => {});
    vi.spyOn(daemon, 'printServerUrl').mockImplementation(() => {});
    vi.spyOn(daemon, 'startDaemon').mockReturnValue({ pid: 9999 });

    const code = await handleRestart();

    expect(code).toBe(0);
    // The cwd workspace is registered by handleStart, plus the two saved ones
    expect(register_workspace).toHaveBeenCalledWith('http://127.0.0.1:3000', {
      path: '/project/a',
      database: '/project/a/.beads'
    });
    expect(register_workspace).toHaveBeenCalledWith('http://127.0.0.1:3000', {
      path: '/project/b',
      database: '/project/b/.beads'
    });
  });
});

describe('port auto-increment (unit)', () => {
  test('auto-increments port when default is in use by non-bdui', async () => {
    const register_workspace = /** @type {import('vitest').Mock} */ (
      open.registerWorkspaceWithServer
    );
    // Registration fails — not a bdui instance on that port
    register_workspace.mockResolvedValueOnce(false);

    vi.spyOn(daemon, 'readPidFile').mockReturnValue(null);
    vi.spyOn(daemon, 'findAvailablePort').mockResolvedValue(3001);
    vi.spyOn(daemon, 'isProcessRunning').mockImplementation(
      (pid) => pid === 8888
    );
    vi.spyOn(daemon, 'printServerUrl').mockImplementation(() => {});

    const start_daemon = vi
      .spyOn(daemon, 'startDaemon')
      .mockReturnValue({ pid: 8888 });

    const code = await handleStart({ open: false });

    expect(code).toBe(0);
    expect(start_daemon).toHaveBeenCalledWith(
      expect.objectContaining({ port: 3001 })
    );
  });

  test('reuses existing bdui when default port is occupied', async () => {
    const register_workspace = /** @type {import('vitest').Mock} */ (
      open.registerWorkspaceWithServer
    );
    // Registration succeeds — existing bdui on that port
    register_workspace.mockResolvedValueOnce(true);

    vi.spyOn(daemon, 'readPidFile').mockReturnValue(null);
    vi.spyOn(daemon, 'findAvailablePort').mockResolvedValue(3001);

    const start_daemon = vi
      .spyOn(daemon, 'startDaemon')
      .mockReturnValue({ pid: 8888 });

    const code = await handleStart({ open: false });

    expect(code).toBe(0);
    // Should NOT have started a new daemon — reused existing
    expect(start_daemon).not.toHaveBeenCalled();
  });

  test('does not auto-increment when explicit port is given', async () => {
    vi.spyOn(daemon, 'readPidFile').mockReturnValue(null);
    vi.spyOn(daemon, 'isProcessRunning').mockImplementation(
      (pid) => pid === 8888
    );
    vi.spyOn(daemon, 'printServerUrl').mockImplementation(() => {});

    const find_port = vi
      .spyOn(daemon, 'findAvailablePort')
      .mockResolvedValue(5000);

    const start_daemon = vi
      .spyOn(daemon, 'startDaemon')
      .mockReturnValue({ pid: 8888 });

    const code = await handleStart({ open: false, port: 5000 });

    expect(code).toBe(0);
    // findAvailablePort should not be called when port is explicit
    expect(find_port).not.toHaveBeenCalled();
    expect(start_daemon).toHaveBeenCalledWith(
      expect.objectContaining({ port: 5000 })
    );
  });

  test('returns 1 when no port is available', async () => {
    vi.spyOn(daemon, 'readPidFile').mockReturnValue(null);
    vi.spyOn(daemon, 'findAvailablePort').mockResolvedValue(null);

    const code = await handleStart({ open: false });

    expect(code).toBe(1);
  });
});
