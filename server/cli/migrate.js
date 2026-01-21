/**
 * Migration utilities for upgrading from old global PID system to new project-local system.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Get old global PID file location (pre-project-local architecture).
 *
 * @returns {string}
 */
function getOldGlobalPidPath() {
  const xdg_dir = process.env.XDG_RUNTIME_DIR;
  if (xdg_dir) {
    return path.join(xdg_dir, 'beads-ui', 'server.pid');
  }
  return path.join(os.tmpdir(), 'beads-ui', 'server.pid');
}

/**
 * Check if old global PID file exists.
 *
 * @returns {number | null} - PID if exists and valid
 */
export function checkOldGlobalPid() {
  const old_pid_path = getOldGlobalPidPath();
  try {
    const content = fs.readFileSync(old_pid_path, 'utf8');
    const pid = Number.parseInt(content.trim(), 10);
    if (Number.isFinite(pid) && pid > 0) {
      return pid;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Clean up old global PID file.
 */
export function removeOldGlobalPid() {
  const old_pid_path = getOldGlobalPidPath();
  try {
    fs.unlinkSync(old_pid_path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Kill a process by PID.
 * Exported for testing.
 *
 * @param {number} pid
 * @returns {Promise<boolean>}
 */
export async function killProcess(pid) {
  try {
    process.kill(pid, 'SIGTERM');
    // Wait a bit for graceful shutdown
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Check if still running
    if (isProcessRunning(pid)) {
      // Force kill
      process.kill(pid, 'SIGKILL');
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return !isProcessRunning(pid);
  } catch (err) {
    const code = /** @type {{ code?: string }} */ (err).code;
    // ESRCH = process doesn't exist, which means it's already "killed"
    if (code === 'ESRCH') {
      return true;
    }
    // Other errors (EPERM, etc.) mean we failed to kill it
    return false;
  }
}

/**
 * Start bdui for a project on a specific port.
 * Exported for testing.
 *
 * @param {string} project_path
 * @param {number} port
 * @returns {Promise<{ success: boolean, pid?: number, error?: string }>}
 */
export async function startInstanceForProject(project_path, port) {
  return new Promise((resolve) => {
    const bdui_bin = process.argv[1]; // Path to bdui executable

    const child = spawn(bdui_bin, ['start', '--port', String(port)], {
      cwd: project_path,
      detached: true,
      stdio: 'ignore'
    });

    child.unref();

    // Wait a bit for startup
    setTimeout(() => {
      if (child.pid) {
        resolve({ success: true, pid: child.pid });
      } else {
        resolve({ success: false, error: 'Failed to start' });
      }
    }, 500);
  });
}

/**
 * Handle migration from old global system.
 *
 * @param {{ force?: boolean }} options
 * @returns {Promise<number>} Exit code
 */
export async function handleMigrate(options = {}) {
  const old_pid = checkOldGlobalPid();

  if (!old_pid) {
    console.log('✓ No old global PID file found.');
    console.log('  Either already migrated or no instances were running.');
    return 0;
  }

  console.log('Found old global PID file');
  console.log(`  PID: ${old_pid}\n`);

  // Check if process is still running
  const is_running = isProcessRunning(old_pid);

  if (!is_running) {
    console.log('Process is not running (stale PID file).');
    const removed = removeOldGlobalPid();
    if (removed) {
      console.log('✓ Cleaned up old PID file.');
    }
    return 0;
  }

  if (options.force) {
    console.log('Stopping old global instance...');
    const killed = await killProcess(old_pid);

    if (killed) {
      console.log('✓ Stopped process ' + old_pid);
      const removed = removeOldGlobalPid();
      if (removed) {
        console.log('✓ Cleaned up old PID file');
      }

      console.log('\n✓ Migration complete!');
      console.log('Old global instance stopped and cleaned up.');
      console.log('');
      console.log('Next steps:');
      console.log('  1. Find your beads projects:');
      console.log('       bdui discover ~/code');
      console.log('       bdui discover ~/projects');
      console.log('');
      console.log('  2. Start instances per-project:');
      console.log('       cd <project> && bdui start --port 4000');
      console.log('');
      console.log('  3. View all instances:');
      console.log('       bdui list');
      return 0;
    } else {
      console.error('✗ Failed to stop process ' + old_pid);
      console.log('  Try manually: kill ' + old_pid);
      return 1;
    }
  }

  console.log(
    '⚠ WARNING: Found running beads-ui instance from old global system.'
  );
  console.log('');
  console.log('Migration options:');
  console.log('  a) Automatic: bdui migrate --force');
  console.log('     (Stops old instance, provides next steps)');
  console.log('');
  console.log('  b) Manual:');
  console.log('     1. Stop the old instance: kill ' + old_pid);
  console.log('     2. Configure discovery paths (choose one):');
  console.log('        - Create ~/.bduirc: {"discoveryPaths": ["~/code"]}');
  console.log('        - Or: export BDUI_DISCOVERY_PATHS="~/code:~/projects"');
  console.log('     3. Discover projects: bdui discover');
  console.log(
    '     4. Start instances: cd <project> && bdui start --port 4000'
  );
  console.log('');
  console.log('After migration, each project gets its own instance.');
  console.log('Use "bdui list" to see all running instances.');

  return 1;
}

/**
 * Check if a process is running.
 * Exported for testing.
 *
 * @param {number} pid
 * @returns {boolean}
 */
export function isProcessRunning(pid) {
  try {
    if (pid <= 0) return false;
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = /** @type {{ code?: string }} */ (err).code;
    if (code === 'ESRCH') return false;
    return true;
  }
}
