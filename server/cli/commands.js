import os from 'node:os';
import { getConfig } from '../config.js';
import { resolveDbPath } from '../db.js';
import {
  findAvailablePort,
  isProcessRunning,
  printServerUrl,
  readPidFile,
  removePidFile,
  startDaemon,
  terminateProcess
} from './daemon.js';
import {
  cleanStaleInstances,
  findInstanceByWorkspace,
  readInstanceRegistry,
  registerInstance,
  unregisterInstance
} from './instance-registry.js';
import { openUrl, registerWorkspaceWithServer, waitForServer } from './open.js';

/**
 * Handle `start` command. Idempotent when already running.
 * - Spawns a detached server process, writes PID file, returns 0.
 * - If already running (PID file present and process alive), prints URL and returns 0.
 *
 * @param {{ open?: boolean, is_debug?: boolean, host?: string, port?: number, new_instance?: boolean }} [options]
 * @returns {Promise<number>} Exit code (0 on success)
 */
export async function handleStart(options) {
  // Default: do not open a browser unless explicitly requested via `open: true`.
  const should_open = options?.open === true;
  const new_instance = options?.new_instance === true;
  let port = options?.port;

  // Check for existing instance for current workspace BEFORE cleaning stale instances
  if (new_instance) {
    const cwd = process.cwd();
    const existing = findInstanceByWorkspace(cwd);

    if (existing) {
      if (!isProcessRunning(existing.pid)) {
        // Orphaned instance - clean up and reuse its port if no port specified
        removePidFile(existing.port);
        unregisterInstance(existing.port);
        if (!port) {
          port = existing.port;
          console.log('Reusing port %d from orphaned instance', port);
        }
      } else {
        // Instance is still running - stop it first, then start new one
        console.log('Stopping existing instance on port %d', existing.port);
        const stopped = await terminateProcess(existing.pid, 5000);
        if (stopped) {
          removePidFile(existing.port);
          unregisterInstance(existing.port);
          // Reuse the port if no port was specified
          if (!port) {
            port = existing.port;
          }
        } else {
          console.error(
            'Failed to stop existing instance on port %d',
            existing.port
          );
          return 1;
        }
      }
    }
  }

  // Clean up stale instances after checking for orphans
  cleanStaleInstances();

  // Auto port selection if no port specified
  if (!port) {
    let found_port;
    if (new_instance) {
      // For new instance, start from 3001 if global instance is on 3000
      const global_pid = readPidFile();
      const start_port =
        global_pid && isProcessRunning(global_pid) ? 3001 : 3000;
      found_port = await findAvailablePort(start_port);

      if (!found_port) {
        console.error(
          'Could not find an available port (tried %d-%d)',
          start_port,
          start_port + 9
        );
        return 1;
      }

      port = found_port;
      console.log('Using port %d', port);
    } else {
      // For global instance, use default port from config (no auto-selection)
      // Port will remain undefined, using default behavior
    }
  }

  const existing_pid = readPidFile(new_instance ? port : undefined);
  if (existing_pid && isProcessRunning(existing_pid)) {
    if (!new_instance) {
      // Default behavior: register workspace with running server
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
    } else {
      // New instance mode: error if already running on this port
      console.error('Server is already running on port %d', port);
      return 1;
    }
  }
  if (existing_pid && !isProcessRunning(existing_pid)) {
    // stale PID file
    removePidFile(new_instance ? port : undefined);
  }

  // Set env vars in current process so getConfig() reflects the overrides
  if (options?.host) {
    process.env.HOST = options.host;
  }
  // Set PORT to the auto-selected or specified port
  if (port) {
    process.env.PORT = String(port);
  }

  const started = startDaemon({
    is_debug: options?.is_debug,
    host: options?.host,
    port: port
  });
  if (started && started.pid > 0) {
    // Register instance in registry if new_instance mode
    if (new_instance && port) {
      const cwd = process.cwd();
      registerInstance({
        workspace: cwd,
        port: port,
        pid: started.pid
      });
    }

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
 * @param {{ port?: number }} [options]
 * @returns {Promise<number>} Exit code
 */
export async function handleStop(options) {
  const port = options?.port;
  const existing_pid = readPidFile(port);

  // Always unregister from registry (self-healing)
  if (port) {
    unregisterInstance(port);
  }

  if (!existing_pid) {
    // No PID file found - this is OK (self-healing)
    return 0;
  }

  if (!isProcessRunning(existing_pid)) {
    // stale PID file - clean it up
    removePidFile(port);
    return 0;
  }

  const terminated = await terminateProcess(existing_pid, 5000);
  if (terminated) {
    removePidFile(port);
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
 * Smart restart logic:
 * - If --port specified, restart that specific port
 * - Otherwise, check if workspace instance exists and restart that
 * - Otherwise, restart global instance (default behavior)
 * Accepts the same options as `handleStart` and passes them through,
 * so restart only opens a browser when `open` is explicitly true.
 *
 * @param {{ open?: boolean, port?: number, new_instance?: boolean }} [options]
 * @returns {Promise<number>}
 */
export async function handleRestart(options = {}) {
  let port_to_restart = options.port;

  // If no port specified, check if there's a workspace instance
  if (!port_to_restart) {
    cleanStaleInstances();
    const workspace_instance = findInstanceByWorkspace(process.cwd());
    if (workspace_instance) {
      port_to_restart = workspace_instance.port;
      console.log(`Restarting workspace instance on port ${port_to_restart}`);
    }
  }

  // Stop the instance (either specific port or default)
  const stop_code = await handleStop({ port: port_to_restart });
  // 0 = stopped, 2 = not running; both are acceptable to proceed
  if (stop_code !== 0 && stop_code !== 2) {
    return 1;
  }

  // Start the instance
  // If we found a workspace instance, start with --new-instance to re-register
  const start_options = { ...options };
  if (port_to_restart && !options.port) {
    // We're restarting a workspace instance (auto-detected)
    start_options.new_instance = true;
    start_options.port = port_to_restart;
  }

  const start_code = await handleStart(start_options);
  return start_code === 0 ? 0 : 1;
}

/**
 * Handle `list` command: show all running instances.
 * Displays both the global instance (if running) and all workspace instances.
 * This is a read-only operation - does not modify the registry.
 *
 * @returns {Promise<number>} Exit code (always 0)
 */
export async function handleList() {
  const instances = readInstanceRegistry();
  const config = getConfig();
  const default_port = config.port;
  const global_pid = readPidFile(undefined); // Default instance (no port)

  // Print header
  console.log('TYPE       PORT   PID      WORKSPACE');
  console.log('─'.repeat(75));

  let has_running = false;

  // Show global instance if running
  if (global_pid && isProcessRunning(global_pid)) {
    console.log(
      `global     ${String(default_port).padEnd(6)} ${String(global_pid).padEnd(8)} -`
    );
    has_running = true;
  }

  // Show workspace instances (including stale ones with status)
  for (const inst of instances) {
    const is_running = isProcessRunning(inst.pid);
    const workspace = inst.workspace.replace(os.homedir(), '~');
    const status = is_running ? '' : ' (stale)';
    console.log(
      `workspace  ${String(inst.port).padEnd(6)} ${String(inst.pid).padEnd(8)} ${workspace}${status}`
    );
    if (is_running) {
      has_running = true;
    }
  }

  // Show message if no instances running
  if (!has_running) {
    console.log('No instances running');
  }

  return 0;
}
