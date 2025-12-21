/**
 * Migration utilities for upgrading from old global PID system to new project-local system.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { registerInstance } from './registry.js';
import { findBeadsProjects } from './discover.js';

/**
 * Get old global PID file location (pre-project-local architecture)
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
 * Check if old global PID file exists
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
 * Clean up old global PID file
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
 * Kill a process by PID
 * @param {number} pid
 * @returns {Promise<boolean>}
 */
async function killProcess(pid) {
  try {
    process.kill(pid, 'SIGTERM');
    // Wait a bit for graceful shutdown
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check if still running
    if (isProcessRunning(pid)) {
      // Force kill
      process.kill(pid, 'SIGKILL');
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return !isProcessRunning(pid);
  } catch {
    return false;
  }
}

/**
 * Start bdui for a project on a specific port
 * @param {string} project_path
 * @param {number} port
 * @returns {Promise<{ success: boolean, pid?: number, error?: string }>}
 */
async function startInstanceForProject(project_path, port) {
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
 * Handle migration from old global system
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

      // Auto-discover projects
      console.log('\nDiscovering beads projects...');
      const github_dir = path.join(os.homedir(), 'github');
      const projects = findBeadsProjects(github_dir);

      if (projects.length === 0) {
        console.log('  No projects found in ~/github');
        console.log('  Run "bdui discover <path>" to search other locations');
        console.log('\nMigration complete!');
        return 0;
      }

      console.log(`Found ${projects.length} beads project(s)`);
      console.log('\nStarting instances automatically...\n');

      let started = 0;
      let failed = 0;
      let base_port = 4000;

      for (const project of projects) {
        const project_name = path.basename(project);
        const port = base_port + started;

        console.log(`Starting ${project_name} on port ${port}...`);

        const result = await startInstanceForProject(project, port);

        if (result.success) {
          started++;
          console.log(`  ✓ Started (PID ${result.pid})`);
        } else {
          failed++;
          console.log(`  ✗ Failed: ${result.error || 'Unknown error'}`);
        }
      }

      console.log(`\n✓ Migration complete!`);
      console.log(`   Started: ${started} instances`);
      console.log(`   Failed: ${failed} instances`);
      console.log('\nView all instances: bdui list');
      return failed > 0 ? 1 : 0;
    } else {
      console.error('✗ Failed to stop process ' + old_pid);
      console.log('  Try manually: kill ' + old_pid);
      return 1;
    }
  }

  console.log('⚠ WARNING: Found running beads-ui instance from old global system.');
  console.log('');
  console.log('Migration options:');
  console.log('  a) Automatic: bdui migrate --force');
  console.log('     (Stops old instance and cleans up)');
  console.log('');
  console.log('  b) Manual:');
  console.log('     1. Stop the old instance: kill ' + old_pid);
  console.log('     2. Run "bdui discover ~/github" to find projects');
  console.log('     3. Restart instances: cd <project> && bdui start --port 400X');
  console.log('');
  console.log('After migration, each project gets its own instance.');
  console.log('Use "bdui list" to see all running instances.');

  return 1;
}

/**
 * Check if a process is running
 * @param {number} pid
 * @returns {boolean}
 */
function isProcessRunning(pid) {
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
