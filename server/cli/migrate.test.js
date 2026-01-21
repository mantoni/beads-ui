import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  checkOldGlobalPid,
  handleMigrate,
  isProcessRunning,
  killProcess,
  removeOldGlobalPid,
  startInstanceForProject
} from './migrate.js';

// Mock child_process at the top level
vi.mock('node:child_process', () => ({
  spawn: vi.fn()
}));

/** @type {string} */
let tmp_dir;
/** @type {string | undefined} */
let orig_xdg;

beforeEach(() => {
  tmp_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bdui-migrate-'));
  orig_xdg = process.env.XDG_RUNTIME_DIR;
  process.env.XDG_RUNTIME_DIR = tmp_dir;

  // Mock console methods
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  if (orig_xdg === undefined) {
    delete process.env.XDG_RUNTIME_DIR;
  } else {
    process.env.XDG_RUNTIME_DIR = orig_xdg;
  }

  try {
    fs.rmSync(tmp_dir, { recursive: true, force: true });
  } catch {
    // ignore
  }

  vi.restoreAllMocks();
});

describe('checkOldGlobalPid', () => {
  test('returns null when old PID file does not exist', () => {
    const pid = checkOldGlobalPid();
    expect(pid).toBeNull();
  });

  test('returns PID when old file exists with valid number', () => {
    const old_pid_path = path.join(tmp_dir, 'beads-ui', 'server.pid');
    fs.mkdirSync(path.dirname(old_pid_path), { recursive: true });
    fs.writeFileSync(old_pid_path, '12345', 'utf8');

    const pid = checkOldGlobalPid();
    expect(pid).toBe(12345);
  });

  test('handles PID with whitespace', () => {
    const old_pid_path = path.join(tmp_dir, 'beads-ui', 'server.pid');
    fs.mkdirSync(path.dirname(old_pid_path), { recursive: true });
    fs.writeFileSync(old_pid_path, '  54321  \n', 'utf8');

    const pid = checkOldGlobalPid();
    expect(pid).toBe(54321);
  });

  test('returns null for invalid PID content', () => {
    const old_pid_path = path.join(tmp_dir, 'beads-ui', 'server.pid');
    fs.mkdirSync(path.dirname(old_pid_path), { recursive: true });
    fs.writeFileSync(old_pid_path, 'not-a-number', 'utf8');

    const pid = checkOldGlobalPid();
    expect(pid).toBeNull();
  });

  test('returns null for zero PID', () => {
    const old_pid_path = path.join(tmp_dir, 'beads-ui', 'server.pid');
    fs.mkdirSync(path.dirname(old_pid_path), { recursive: true });
    fs.writeFileSync(old_pid_path, '0', 'utf8');

    const pid = checkOldGlobalPid();
    expect(pid).toBeNull();
  });

  test('returns null for negative PID', () => {
    const old_pid_path = path.join(tmp_dir, 'beads-ui', 'server.pid');
    fs.mkdirSync(path.dirname(old_pid_path), { recursive: true });
    fs.writeFileSync(old_pid_path, '-1', 'utf8');

    const pid = checkOldGlobalPid();
    expect(pid).toBeNull();
  });

  test('uses XDG_RUNTIME_DIR when set', () => {
    process.env.XDG_RUNTIME_DIR = tmp_dir;
    const old_pid_path = path.join(tmp_dir, 'beads-ui', 'server.pid');
    fs.mkdirSync(path.dirname(old_pid_path), { recursive: true });
    fs.writeFileSync(old_pid_path, '77777', 'utf8');

    const pid = checkOldGlobalPid();
    expect(pid).toBe(77777);
  });

  test('falls back to tmpdir when XDG_RUNTIME_DIR not set', () => {
    delete process.env.XDG_RUNTIME_DIR;
    const old_pid_path = path.join(os.tmpdir(), 'beads-ui', 'server.pid');
    fs.mkdirSync(path.dirname(old_pid_path), { recursive: true });
    fs.writeFileSync(old_pid_path, '88888', 'utf8');

    const pid = checkOldGlobalPid();
    expect(pid).toBe(88888);

    // Cleanup
    fs.rmSync(path.dirname(old_pid_path), { recursive: true, force: true });
  });
});

describe('removeOldGlobalPid', () => {
  test('returns false when old PID file does not exist', () => {
    const removed = removeOldGlobalPid();
    expect(removed).toBe(false);
  });

  test('returns true and removes old PID file', () => {
    const old_pid_path = path.join(tmp_dir, 'beads-ui', 'server.pid');
    fs.mkdirSync(path.dirname(old_pid_path), { recursive: true });
    fs.writeFileSync(old_pid_path, '12345', 'utf8');

    const removed = removeOldGlobalPid();

    expect(removed).toBe(true);
    expect(fs.existsSync(old_pid_path)).toBe(false);
  });
});

describe('handleMigrate', () => {
  test('returns 0 when no old PID file exists', async () => {
    const code = await handleMigrate();

    expect(code).toBe(0);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('No old global PID file found')
    );
  });

  test('cleans up stale PID file', async () => {
    const old_pid_path = path.join(tmp_dir, 'beads-ui', 'server.pid');
    fs.mkdirSync(path.dirname(old_pid_path), { recursive: true });
    fs.writeFileSync(old_pid_path, '99999', 'utf8'); // unlikely to be running

    const code = await handleMigrate();

    expect(code).toBe(0);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Process is not running')
    );
    expect(fs.existsSync(old_pid_path)).toBe(false);
  });

  test('prompts user when old process is running without --force', async () => {
    // Use current process PID (guaranteed running)
    const old_pid_path = path.join(tmp_dir, 'beads-ui', 'server.pid');
    fs.mkdirSync(path.dirname(old_pid_path), { recursive: true });
    fs.writeFileSync(old_pid_path, String(process.pid), 'utf8');

    const code = await handleMigrate();

    expect(code).toBe(1);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Found running beads-ui instance')
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('bdui migrate --force')
    );
  });

  test('shows manual migration instructions', async () => {
    const old_pid_path = path.join(tmp_dir, 'beads-ui', 'server.pid');
    fs.mkdirSync(path.dirname(old_pid_path), { recursive: true });
    fs.writeFileSync(old_pid_path, String(process.pid), 'utf8');

    await handleMigrate();

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Manual:')
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('kill ' + process.pid)
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('bdui discover')
    );
  });

  test('shows environment variable configuration option', async () => {
    const old_pid_path = path.join(tmp_dir, 'beads-ui', 'server.pid');
    fs.mkdirSync(path.dirname(old_pid_path), { recursive: true });
    fs.writeFileSync(old_pid_path, String(process.pid), 'utf8');

    await handleMigrate();

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('export BDUI_DISCOVERY_PATHS')
    );
  });

  test('shows config file option in manual instructions', async () => {
    const old_pid_path = path.join(tmp_dir, 'beads-ui', 'server.pid');
    fs.mkdirSync(path.dirname(old_pid_path), { recursive: true });
    fs.writeFileSync(old_pid_path, String(process.pid), 'utf8');

    await handleMigrate();

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Create ~/.bduirc')
    );
  });
});

describe('isProcessRunning', () => {
  test('returns true for running process', () => {
    const running = isProcessRunning(process.pid);
    expect(running).toBe(true);
  });

  test('returns false for non-existent process', () => {
    const running = isProcessRunning(99999);
    expect(running).toBe(false);
  });

  test('returns false for PID 0', () => {
    const running = isProcessRunning(0);
    expect(running).toBe(false);
  });

  test('returns false for negative PID', () => {
    const running = isProcessRunning(-1);
    expect(running).toBe(false);
  });

  test('handles EPERM error as running (permission denied)', () => {
    // Mock process.kill to throw EPERM
    const orig_kill = process.kill;
    process.kill = vi.fn(() => {
      const err = new Error('EPERM');
      err.code = 'EPERM';
      throw err;
    });

    const running = isProcessRunning(1);

    // EPERM means process exists but we don't have permission to signal it
    expect(running).toBe(true);

    process.kill = orig_kill;
  });
});

describe('killProcess', () => {
  test('returns true for non-existent process', async () => {
    const killed = await killProcess(99999);
    // Trying to kill non-existent process "succeeds" (it's not running)
    expect(killed).toBe(true);
  });

  test('handles process that exits on SIGTERM', async () => {
    // This is hard to test without spawning a real process
    // For now, test the logic flow by mocking
    const orig_kill = process.kill;
    let kill_count = 0;

    process.kill = vi.fn((pid, sig) => {
      kill_count++;
      if (sig === 0) {
        // isProcessRunning check after SIGTERM
        if (kill_count > 1) {
          // Process exited after SIGTERM, report as dead
          const err = new Error('ESRCH');
          err.code = 'ESRCH';
          throw err;
        }
      }
      // SIGTERM sent successfully
    });

    const killed = await killProcess(12345);

    expect(killed).toBe(true);
    expect(kill_count).toBeGreaterThan(0);

    process.kill = orig_kill;
  });

  test(
    'tries SIGKILL if SIGTERM fails',
    { timeout: 3000 },
    async () => {
      const orig_kill = process.kill;
      const signals_sent = [];

      process.kill = vi.fn((pid, sig) => {
        signals_sent.push(sig);
        // Process stays alive until SIGKILL
        if (sig === 0 && signals_sent.filter(s => s === 'SIGKILL').length > 0) {
          const err = new Error('ESRCH');
          err.code = 'ESRCH';
          throw err;
        }
      });

      const killed = await killProcess(12345);

      expect(signals_sent).toContain('SIGTERM');
      expect(signals_sent).toContain('SIGKILL');
      expect(killed).toBe(true);

      process.kill = orig_kill;
    }
  );

  test('returns false when kill throws non-ESRCH error', async () => {
    const orig_kill = process.kill;
    process.kill = vi.fn(() => {
      throw new Error('Unexpected error');
    });

    const killed = await killProcess(12345);

    expect(killed).toBe(false);

    process.kill = orig_kill;
  });
});

describe('startInstanceForProject', () => {
  let spawn_mock;

  beforeEach(async () => {
    const cp = await import('node:child_process');
    spawn_mock = vi.mocked(cp.spawn);
  });

  test('spawns child process with correct arguments', async () => {
    const mock_child = {
      pid: 55555,
      unref: vi.fn(),
      on: vi.fn()
    };
    spawn_mock.mockReturnValue(mock_child);

    const result = await startInstanceForProject('/test/my-project', 4000);

    expect(spawn_mock).toHaveBeenCalledWith(
      expect.any(String), // bdui binary path
      ['start', '--port', '4000'],
      expect.objectContaining({
        cwd: '/test/my-project',
        detached: true,
        stdio: 'ignore'
      })
    );
    expect(mock_child.unref).toHaveBeenCalled();
    expect(result).toEqual({ success: true, pid: 55555 });
  });

  test('returns success false when spawn fails', async () => {
    const mock_child = {
      pid: undefined, // spawn failed
      unref: vi.fn(),
      on: vi.fn()
    };
    spawn_mock.mockReturnValue(mock_child);

    const result = await startInstanceForProject('/test/project', 4001);

    expect(result).toEqual({ success: false, error: 'Failed to start' });
  });

  test('uses current executable path for bdui binary', async () => {
    const mock_child = { pid: 12345, unref: vi.fn(), on: vi.fn() };
    spawn_mock.mockReturnValue(mock_child);

    await startInstanceForProject('/test/project', 4000);

    // process.argv[1] is the script being run
    expect(spawn_mock).toHaveBeenCalledWith(
      process.argv[1],
      expect.any(Array),
      expect.any(Object)
    );
  });

  test('waits for startup before resolving', async () => {
    const mock_child = { pid: 77777, unref: vi.fn(), on: vi.fn() };
    spawn_mock.mockReturnValue(mock_child);

    const start_time = Date.now();
    await startInstanceForProject('/test/project', 4000);
    const duration = Date.now() - start_time;

    // Should wait ~500ms
    expect(duration).toBeGreaterThanOrEqual(450);
  });
});

// NOTE: --force flag integration tests are in migrate.integration.test.js
// Those tests spawn real processes and validate actual migration behavior.
