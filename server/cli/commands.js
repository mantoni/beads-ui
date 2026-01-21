import { getConfig } from '../config.js';
import { resolveDbPath } from '../db.js';
import {
  isProcessRunning,
  printServerUrl,
  readPidFile,
  removePidFile,
  startDaemon,
  terminateProcess
} from './daemon.js';
import { openUrl, registerWorkspaceWithServer, waitForServer } from './open.js';
import {
  registerInstance,
  unregisterInstanceByPath,
  getAllInstances,
  cleanRegistry
} from './registry.js';

/**
 * Handle `start` command. Idempotent when already running.
 * - Spawns a detached server process, writes PID file, returns 0.
 * - If already running (PID file present and process alive), prints URL and returns 0.
 *
 * @param {{ open?: boolean, is_debug?: boolean, host?: string, port?: number }} [options]
 * @returns {Promise<number>} Exit code (0 on success)
 */
export async function handleStart(options) {
  // Default: do not open a browser unless explicitly requested via `open: true`.
  const should_open = options?.open === true;
  const existing_pid = readPidFile();
  if (existing_pid && isProcessRunning(existing_pid)) {
    // Server is already running - register this workspace dynamically
    const cwd = process.cwd();
    const db_info = resolveDbPath({ cwd });
    if (db_info.exists) {
      const { url } = getConfig();
      const registered = await registerWorkspaceWithServer(url, {
        path: cwd,
        database: db_info.path
      });
      if (registered) {
        console.log('Workspace registered: %s', cwd);
      }
    }
    console.warn('Server is already running.');
    if (should_open) {
      const { url } = getConfig();
      await openUrl(url);
    }
    return 0;
  }
  if (existing_pid && !isProcessRunning(existing_pid)) {
    // stale PID file
    removePidFile();
  }

  // Set env vars in current process so getConfig() reflects the overrides
  if (options?.host) {
    process.env.HOST = options.host;
  }
  if (options?.port) {
    process.env.PORT = String(options.port);
  }

  const started = startDaemon({
    is_debug: options?.is_debug,
    host: options?.host,
    port: options?.port
  });
  if (started && started.pid > 0) {
    // Register instance in central registry
    const { port } = getConfig();
    registerInstance({
      project_path: process.cwd(),
      port: port,
      pid: started.pid
    });

    printServerUrl();
    // Auto-open the browser once for a fresh daemon start
    if (should_open) {
      const { url } = getConfig();
      // Wait briefly for the server to accept connections (single retry window)
      await waitForServer(url, 600);
      // Best-effort open; ignore result
      await openUrl(url);
    }
    return 0;
  }

  return 1;
}

/**
 * Handle `stop` command.
 * - Sends SIGTERM and waits for exit (with SIGKILL fallback), removes PID file.
 * - Returns 2 if not running.
 *
 * @returns {Promise<number>} Exit code
 */
export async function handleStop() {
  const existing_pid = readPidFile();
  if (!existing_pid) {
    return 2;
  }

  if (!isProcessRunning(existing_pid)) {
    // stale PID file
    removePidFile();
    return 2;
  }

  const terminated = await terminateProcess(existing_pid, 5000);
  if (terminated) {
    removePidFile();
    // Unregister from central registry
    unregisterInstanceByPath(process.cwd());
    return 0;
  }

  // Not terminated within timeout
  return 1;
}

/**
 * Handle `restart` command: stop (ignore not-running) then start.
 *
 * @returns {Promise<number>} Exit code (0 on success)
 */
/**
 * Handle `restart` command: stop (ignore not-running) then start.
 * Accepts the same options as `handleStart` and passes them through,
 * so restart only opens a browser when `open` is explicitly true.
 *
 * @param {{ open?: boolean }} [options]
 * @returns {Promise<number>}
 */
export async function handleRestart(options) {
  const stop_code = await handleStop();
  // 0 = stopped, 2 = not running; both are acceptable to proceed
  if (stop_code !== 0 && stop_code !== 2) {
    return 1;
  }
  const start_code = await handleStart(options);
  return start_code === 0 ? 0 : 1;
}

/**
 * Handle `list` command - show all running beads-ui instances.
 * @returns {Promise<number>} Exit code
 */
export async function handleList() {
  // Clean stale entries first
  const cleaned = cleanRegistry();
  if (cleaned > 0) {
    console.log(`Cleaned ${cleaned} stale instance(s)`);
  }

  const instances = getAllInstances();

  if (instances.length === 0) {
    console.log('No beads-ui instances running.');
    return 0;
  }

  console.log(`\nRunning beads-ui instances (${instances.length}):\n`);

  for (const instance of instances) {
    const status = instance.running ? '✓' : '✗';
    const uptime = instance.running
      ? `(started ${new Date(instance.started_at).toLocaleString()})`
      : '(stopped)';

    console.log(`${status} ${instance.project}`);
    console.log(`   Port: ${instance.port}`);
    console.log(`   PID:  ${instance.pid}`);
    console.log(`   Path: ${instance.path}`);
    console.log(`   ${uptime}\n`);
  }

  return 0;
}

/**
 * Handle `stop-all` command - stop all running instances.
 * @returns {Promise<number>} Exit code
 */
export async function handleStopAll() {
  const instances = getAllInstances();
  const running = instances.filter(i => i.running);

  if (running.length === 0) {
    console.log('No running instances to stop.');
    return 0;
  }

  console.log(`Stopping ${running.length} instance(s)...\n`);

  let stopped = 0;
  let failed = 0;

  for (const instance of running) {
    console.log(`Stopping ${instance.project} (PID ${instance.pid})...`);

    const terminated = await terminateProcess(instance.pid, 5000);
    if (terminated) {
      stopped++;
      console.log(`  ✓ Stopped`);
    } else {
      failed++;
      console.log(`  ✗ Failed to stop`);
    }
  }

  // Clean the registry
  cleanRegistry();

  console.log(`\nStopped: ${stopped}, Failed: ${failed}`);
  return failed > 0 ? 1 : 0;
}

/**
 * Handle `restart-all` command - restart all registered instances.
 * @returns {Promise<number>} Exit code
 */
export async function handleRestartAll() {
  const instances = getAllInstances();

  if (instances.length === 0) {
    console.log('No instances in registry.');
    console.log('Run "bdui discover ~/github" to find projects.');
    return 0;
  }

  console.log(`Restarting ${instances.length} instance(s)...\n`);

  let restarted = 0;
  let failed = 0;

  for (const instance of instances) {
    console.log(`Restarting ${instance.project} on port ${instance.port}...`);

    // Stop if running
    if (instance.running) {
      const terminated = await terminateProcess(instance.pid, 5000);
      if (!terminated) {
        console.log(`  ⚠ Warning: Failed to stop old instance`);
      }
    }

    // Start in the project directory on registered port
    const { spawn } = await import('node:child_process');
    const child = spawn(process.argv[1], ['start', '--port', String(instance.port)], {
      cwd: instance.path,
      detached: true,
      stdio: 'ignore'
    });

    child.unref();

    // Wait briefly for startup
    await new Promise(resolve => setTimeout(resolve, 500));

    if (child.pid) {
      restarted++;
      console.log(`  ✓ Restarted (PID ${child.pid})`);
    } else {
      failed++;
      console.log(`  ✗ Failed to start`);
    }
  }

  console.log(`\nRestarted: ${restarted}, Failed: ${failed}`);
  console.log('View instances: bdui list');
  return failed > 0 ? 1 : 0;
}
