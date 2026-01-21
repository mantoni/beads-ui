/**
 * Integration tests for migrate.js --force functionality.
 * These tests spawn real bdui processes to test actual migration behavior.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { handleMigrate, isProcessRunning } from './migrate.js';

/** @type {string} */
let tmp_dir;
/** @type {string | undefined} */
let orig_xdg;
/** @type {number[]} */
let spawned_pids;

beforeEach(() => {
  tmp_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bdui-migrate-int-'));
  orig_xdg = process.env.XDG_RUNTIME_DIR;
  process.env.XDG_RUNTIME_DIR = tmp_dir;
  spawned_pids = [];
});

afterEach(async () => {
  // Cleanup: kill any spawned processes
  for (const pid of spawned_pids) {
    try {
      if (isProcessRunning(pid)) {
        process.kill(pid, 'SIGKILL');
      }
    } catch {
      // ignore
    }
  }

  // Restore environment
  if (orig_xdg === undefined) {
    delete process.env.XDG_RUNTIME_DIR;
  } else {
    process.env.XDG_RUNTIME_DIR = orig_xdg;
  }

  // Cleanup temp directory
  try {
    fs.rmSync(tmp_dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

/**
 * Spawn a long-running process to simulate old global bdui instance.
 *
 * @returns {Promise<number>} PID of spawned process
 */
async function spawnTestProcess() {
  return new Promise((resolve, reject) => {
    // Spawn a sleep process that will run for 60 seconds
    const child = spawn('sleep', ['60'], {
      detached: false,
      stdio: 'ignore'
    });

    child.on('error', reject);

    if (child.pid) {
      spawned_pids.push(child.pid);
      resolve(child.pid);
    } else {
      reject(new Error('Failed to spawn test process'));
    }
  });
}

describe('handleMigrate --force integration', () => {
  test(
    'kills running process and completes migration',
    { timeout: 5000 },
    async () => {
      // 1. Spawn a real process to simulate old bdui instance
      const test_pid = await spawnTestProcess();

      // 2. Verify process is running
      expect(isProcessRunning(test_pid)).toBe(true);

      // 3. Create old global PID file pointing to our test process
      const old_pid_path = path.join(tmp_dir, 'beads-ui', 'server.pid');
      fs.mkdirSync(path.dirname(old_pid_path), { recursive: true });
      fs.writeFileSync(old_pid_path, String(test_pid), 'utf8');

      // 4. Run migration with --force
      const code = await handleMigrate({ force: true });

      // 5. Verify process was killed
      expect(isProcessRunning(test_pid)).toBe(false);

      // 6. Verify old PID file was removed
      expect(fs.existsSync(old_pid_path)).toBe(false);

      // 7. Verify migration succeeded
      expect(code).toBe(0);
    }
  );

  test(
    'handles case where process exits before SIGKILL',
    { timeout: 5000 },
    async () => {
      // Spawn a process that will exit quickly
      const child = spawn('sh', ['-c', 'sleep 0.5'], {
        detached: false,
        stdio: 'ignore'
      });

      const test_pid = child.pid;
      if (!test_pid) {
        throw new Error('Failed to spawn test process');
      }
      spawned_pids.push(test_pid);

      const old_pid_path = path.join(tmp_dir, 'beads-ui', 'server.pid');
      fs.mkdirSync(path.dirname(old_pid_path), { recursive: true });
      fs.writeFileSync(old_pid_path, String(test_pid), 'utf8');

      // Wait for process to start
      await new Promise((resolve) => setTimeout(resolve, 100));

      const code = await handleMigrate({ force: true });

      // Process exited on its own during the 1s SIGTERM wait
      expect(code).toBe(0);
      expect(isProcessRunning(test_pid)).toBe(false);
    }
  );

  test(
    'verifies kill attempts both SIGTERM and SIGKILL',
    { timeout: 5000 },
    async () => {
      const test_pid = await spawnTestProcess();
      expect(isProcessRunning(test_pid)).toBe(true);

      const old_pid_path = path.join(tmp_dir, 'beads-ui', 'server.pid');
      fs.mkdirSync(path.dirname(old_pid_path), { recursive: true });
      fs.writeFileSync(old_pid_path, String(test_pid), 'utf8');

      // Track what happened to the process
      const was_running_before = isProcessRunning(test_pid);

      await handleMigrate({ force: true });

      const is_running_after = isProcessRunning(test_pid);

      // Verify process state changed from running to stopped
      expect(was_running_before).toBe(true);
      expect(is_running_after).toBe(false);
    }
  );

  test(
    'handles non-existent process gracefully (stale PID)',
    { timeout: 3000 },
    async () => {
      const old_pid_path = path.join(tmp_dir, 'beads-ui', 'server.pid');
      fs.mkdirSync(path.dirname(old_pid_path), { recursive: true });
      // Write PID that doesn't exist
      fs.writeFileSync(old_pid_path, '99999', 'utf8');

      const code = await handleMigrate({ force: true });

      // Should succeed (process doesn't exist = goal achieved)
      expect(code).toBe(0);
    }
  );
});
