import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { debug } from './logging.js';

const log = debug('registry-watcher');

/**
 * In-memory registry of workspaces registered dynamically via the API.
 * These supplement the file-based registry at ~/.beads/registry.json.
 *
 * @type {Map<string, { path: string, database: string, pid: number, version: string }>}
 */
const inMemoryWorkspaces = new Map();

/**
 * Register a workspace dynamically (in-memory).
 * This allows `bdui start` to register workspaces when the server is already running.
 *
 * @param {{ path: string, database: string }} workspace
 */
export function registerWorkspace(workspace) {
  const normalized = path.resolve(workspace.path);
  log('registering workspace: %s (db: %s)', normalized, workspace.database);
  inMemoryWorkspaces.set(normalized, {
    path: normalized,
    database: workspace.database,
    pid: process.pid,
    version: 'dynamic'
  });
}

/**
 * Get all dynamically registered workspaces (in-memory only).
 *
 * @returns {Array<{ path: string, database: string, pid: number, version: string }>}
 */
export function getInMemoryWorkspaces() {
  return Array.from(inMemoryWorkspaces.values());
}

/**
 * @typedef {Object} RegistryEntry
 * @property {string} workspace_path
 * @property {string} socket_path
 * @property {string} database_path
 * @property {number} pid
 * @property {string} version
 * @property {string} started_at
 */

/**
 * Get the path to the global beads registry file.
 *
 * @returns {string}
 */
export function getRegistryPath() {
  return path.join(os.homedir(), '.beads', 'registry.json');
}

/**
 * Read and parse the registry file.
 *
 * @returns {RegistryEntry[]}
 */
export function readRegistry() {
  const registry_path = getRegistryPath();
  try {
    const content = fs.readFileSync(registry_path, 'utf8');
    const data = JSON.parse(content);
    if (Array.isArray(data)) {
      return data;
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Find the registry entry that matches the given root directory.
 * Matches if the root_dir is the same as or a subdirectory of the workspace_path.
 *
 * @param {string} root_dir
 * @returns {RegistryEntry | null}
 */
export function findWorkspaceEntry(root_dir) {
  const entries = readRegistry();
  const normalized = path.resolve(root_dir);

  // First, try exact match
  for (const entry of entries) {
    if (path.resolve(entry.workspace_path) === normalized) {
      return entry;
    }
  }

  // Then try to find if root_dir is inside a workspace
  for (const entry of entries) {
    const workspace = path.resolve(entry.workspace_path);
    if (normalized.startsWith(workspace + path.sep)) {
      return entry;
    }
  }

  return null;
}

/**
 * Get all available workspaces from both the file-based registry and
 * dynamically registered in-memory workspaces.
 *
 * @returns {Array<{ path: string, database: string, pid: number, version: string }>}
 */
export function getAvailableWorkspaces() {
  const entries = readRegistry();
  const fileWorkspaces = entries.map((entry) => ({
    path: entry.workspace_path,
    database: entry.database_path,
    pid: entry.pid,
    version: entry.version
  }));

  // Merge in-memory workspaces, avoiding duplicates by path
  const seen = new Set(fileWorkspaces.map((w) => path.resolve(w.path)));
  const inMemory = getInMemoryWorkspaces().filter(
    (w) => !seen.has(path.resolve(w.path))
  );

  return [...fileWorkspaces, ...inMemory];
}

/**
 * Watch the global beads registry file and invoke callback when it changes.
 *
 * @param {(entries: RegistryEntry[]) => void} onChange
 * @param {{ debounce_ms?: number }} [options]
 * @returns {{ close: () => void }}
 */
export function watchRegistry(onChange, options = {}) {
  const debounce_ms = options.debounce_ms ?? 500;
  const registry_path = getRegistryPath();
  const registry_dir = path.dirname(registry_path);
  const registry_file = path.basename(registry_path);

  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  /** @type {fs.FSWatcher | undefined} */
  let watcher;

  const schedule = () => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      try {
        const entries = readRegistry();
        onChange(entries);
      } catch (err) {
        log('error reading registry on change: %o', err);
      }
    }, debounce_ms);
    timer.unref?.();
  };

  try {
    // Ensure the directory exists before watching
    if (!fs.existsSync(registry_dir)) {
      log('registry directory does not exist: %s', registry_dir);
      return { close: () => {} };
    }

    watcher = fs.watch(
      registry_dir,
      { persistent: true },
      (event_type, filename) => {
        if (filename && String(filename) !== registry_file) {
          return;
        }
        if (event_type === 'change' || event_type === 'rename') {
          log('registry %s %s', event_type, filename || '');
          schedule();
        }
      }
    );
  } catch (err) {
    log('unable to watch registry directory: %o', err);
    return { close: () => {} };
  }

  return {
    close() {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      watcher?.close();
    }
  };
}
