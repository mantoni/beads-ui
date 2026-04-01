import { getConfig } from '../config.js';
import { resolveWorkspaceDatabase } from '../db.js';
import {
  detectListeningPort,
  findAvailablePort,
  isProcessRunning,
  printServerUrl,
  readPidFile,
  removePidFile,
  startDaemon,
  terminateProcess
} from './daemon.js';
import {
  fetchWorkspacesFromServer,
  openUrl,
  registerWorkspaceWithServer,
  waitForServer
} from './open.js';

const RESTART_SERVER_READY_MS = 400;

const STARTUP_SETTLE_MS = 200;
const REGISTER_RETRY_ATTEMPTS = 5;
const REGISTER_RETRY_DELAY_MS = 150;

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
  const cwd = process.cwd();

  // Set env vars early so getConfig() reflects CLI overrides in ALL branches,
  // including the "already running" path that registers workspaces via HTTP.
  if (options?.host) {
    process.env.HOST = options.host;
  }
  if (options?.port) {
    process.env.PORT = String(options.port);
  }

  const existing_pid = readPidFile();
  if (existing_pid && isProcessRunning(existing_pid)) {
    // Server is already running - register this workspace dynamically
    const { url } = getConfig();
    const registered = await registerCurrentWorkspace(url, cwd);
    if (registered) {
      console.log('Workspace registered: %s', cwd);
    }
    console.warn('Server is already running.');
    if (should_open) {
      await openUrl(url);
    }
    return 0;
  }
  if (existing_pid && !isProcessRunning(existing_pid)) {
    // stale PID file
    removePidFile();
  }

  const { port: config_port, host: config_host } = getConfig();

  // When the user did not pass an explicit --port, check whether the default
  // port is already in use. If something is already listening, try to register
  // with it first — it may be an existing bdui instance we can reuse.
  // Only auto-increment to the next port if registration fails.
  let effective_port = options?.port;
  if (!effective_port) {
    const available = await findAvailablePort(config_port, config_host);
    if (available === null) {
      console.error(
        'No available port found (tried %d–%d).',
        config_port,
        config_port + 9
      );
      return 1;
    }
    if (available !== config_port) {
      // Default port is busy — try to register with whatever is there.
      const existing_url = `http://${config_host}:${config_port}`;
      const registered = await registerCurrentWorkspace(existing_url, cwd);
      if (registered) {
        console.log('Workspace registered with existing server: %s', cwd);
        if (should_open) {
          await openUrl(existing_url);
        }
        return 0;
      }
      // Not a bdui instance — auto-increment to the next available port.
      console.log('Port %d in use, using %d instead.', config_port, available);
      effective_port = available;
    }
  }

  // Set PORT env so getConfig() returns the correct URL for registration
  if (effective_port) {
    process.env.PORT = String(effective_port);
  }
  const { url } = getConfig();

  const started = startDaemon({
    is_debug: options?.is_debug,
    host: options?.host,
    port: effective_port
  });
  if (started && started.pid > 0) {
    // Give the spawned daemon a brief moment to fail fast (for example EADDRINUSE).
    await sleep(STARTUP_SETTLE_MS);

    if (!isProcessRunning(started.pid)) {
      removePidFile();

      // If another server is already running at the configured URL, register this
      // workspace there so it appears in the picker instead of silently missing.
      const registered = await registerCurrentWorkspaceWithRetry(url, cwd);
      if (registered) {
        console.warn(
          'Daemon exited early; registered workspace with existing server: %s',
          cwd
        );
        return 0;
      }
      return 1;
    }

    // Register against the currently reachable server to ensure this workspace
    // appears in the picker even when startup races with other daemons.
    void registerCurrentWorkspaceWithRetry(url, cwd);

    printServerUrl();
    // Auto-open the browser once for a fresh daemon start
    if (should_open) {
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
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}

/**
 * @param {string} url
 * @param {string} cwd
 * @returns {Promise<boolean>}
 */
async function registerCurrentWorkspace(url, cwd) {
  const workspace_database = resolveWorkspaceDatabase({ cwd });
  if (
    workspace_database.source === 'home-default' ||
    !workspace_database.exists
  ) {
    return false;
  }

  return registerWorkspaceWithServer(url, {
    path: cwd,
    database: workspace_database.path
  });
}

/**
 * @param {string} url
 * @param {string} cwd
 * @returns {Promise<boolean>}
 */
async function registerCurrentWorkspaceWithRetry(url, cwd) {
  for (let i = 0; i < REGISTER_RETRY_ATTEMPTS; i++) {
    const registered = await registerCurrentWorkspace(url, cwd);
    if (registered) {
      return true;
    }
    if (i < REGISTER_RETRY_ATTEMPTS - 1) {
      await sleep(REGISTER_RETRY_DELAY_MS);
    }
  }
  return false;
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
    return 0;
  }

  // Not terminated within timeout
  return 1;
}

/**
 * Handle `restart` command: stop (ignore not-running) then start.
 * Accepts the same options as `handleStart` and passes them through,
 * so restart only opens a browser when `open` is explicitly true.
 *
 * When the user does not pass explicit `--port`, the restart detects the
 * port the running daemon is listening on and reuses it.
 *
 * @param {{ open?: boolean, host?: string, port?: number }} [options]
 * @returns {Promise<number>}
 */
export async function handleRestart(options) {
  // Capture state from the running server before stopping it.
  let detected_port = null;
  /** @type {Array<{ path: string, database: string }>} */
  let saved_workspaces = [];
  const existing_pid = readPidFile();
  if (existing_pid && isProcessRunning(existing_pid)) {
    detected_port = detectListeningPort(existing_pid);

    const { url } = getConfig();
    saved_workspaces = await fetchWorkspacesFromServer(url);
  }

  const stop_code = await handleStop();
  // 0 = stopped, 2 = not running; both are acceptable to proceed
  if (stop_code !== 0 && stop_code !== 2) {
    return 1;
  }

  // Reuse detected port unless the user explicitly passed one.
  const merged_options = { ...options };
  if (!merged_options.port && detected_port) {
    merged_options.port = detected_port;
  }

  const start_code = await handleStart(merged_options);
  if (start_code !== 0) {
    return 1;
  }

  // Re-register workspaces from the previous server.
  if (saved_workspaces.length > 0) {
    const { url } = getConfig();
    await waitForServer(url, RESTART_SERVER_READY_MS);
    for (const ws of saved_workspaces) {
      if (ws.path && ws.database) {
        await registerWorkspaceWithServer(url, {
          path: ws.path,
          database: ws.database
        });
      }
    }
  }

  return 0;
}
