/**
 * @typedef {object} InstanceEntry
 * @property {string} workspace - Absolute path to the workspace directory
 * @property {number} port - Port number the instance is running on
 * @property {number} pid - Process ID of the running instance
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isProcessRunning } from './daemon.js';

/**
 * Get the path to the instance registry file.
 * Returns `~/.beads-ui/instances.json`
 *
 * @returns {string}
 */
export function getRegistryPath() {
  const home_dir = os.homedir();
  const beads_ui_dir = path.join(home_dir, '.beads-ui');

  // Ensure directory exists
  try {
    fs.mkdirSync(beads_ui_dir, { recursive: true, mode: 0o700 });
  } catch {
    // Best-effort; errors will surface on file operations
  }

  return path.join(beads_ui_dir, 'instances.json');
}

/**
 * Read the instance registry from disk.
 * Returns an empty array if the file doesn't exist or is corrupted.
 *
 * @returns {InstanceEntry[]}
 */
export function readInstanceRegistry() {
  const registry_path = getRegistryPath();

  try {
    const content = fs.readFileSync(registry_path, 'utf8');
    const parsed = JSON.parse(content);

    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // File doesn't exist or is corrupted
  }

  return [];
}

/**
 * Write the instance registry to disk atomically.
 * Uses a temporary file and rename to ensure atomicity.
 *
 * @param {InstanceEntry[]} instances
 */
export function writeInstanceRegistry(instances) {
  const registry_path = getRegistryPath();
  const temp_path = registry_path + '.tmp';

  try {
    const content = JSON.stringify(instances, null, 2);
    fs.writeFileSync(temp_path, content, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temp_path, registry_path);
  } catch {
    // Best-effort; ignore write errors
    try {
      fs.unlinkSync(temp_path);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Register a new instance or update an existing one.
 *
 * @param {{ workspace: string, port: number, pid: number }} entry
 */
export function registerInstance(entry) {
  const instances = readInstanceRegistry();

  // Remove any existing entry with the same port
  const filtered = instances.filter((inst) => inst.port !== entry.port);

  // Add the new entry
  filtered.push({
    workspace: entry.workspace,
    port: entry.port,
    pid: entry.pid
  });

  writeInstanceRegistry(filtered);
}

/**
 * Unregister an instance by port.
 *
 * @param {number} port
 */
export function unregisterInstance(port) {
  const instances = readInstanceRegistry();
  const filtered = instances.filter((inst) => inst.port !== port);
  writeInstanceRegistry(filtered);
}

/**
 * Find an instance by workspace path.
 * Returns the instance if found, null otherwise.
 *
 * @param {string} workspace
 * @returns {InstanceEntry | null}
 */
export function findInstanceByWorkspace(workspace) {
  const instances = readInstanceRegistry();
  const normalized = path.resolve(workspace);

  // First try exact match
  for (const inst of instances) {
    if (path.resolve(inst.workspace) === normalized) {
      return inst;
    }
  }

  // Then try parent workspace match
  for (const inst of instances) {
    const inst_path = path.resolve(inst.workspace);
    if (normalized.startsWith(inst_path + path.sep)) {
      return inst;
    }
  }

  return null;
}

/**
 * Find an instance by port number.
 * Returns the instance if found, null otherwise.
 *
 * @param {number} port
 * @returns {InstanceEntry | null}
 */
export function findInstanceByPort(port) {
  const instances = readInstanceRegistry();
  return instances.find((inst) => inst.port === port) || null;
}

/**
 * Clean up stale instances (where the process is no longer running).
 * Removes entries for dead processes from the registry.
 */
export function cleanStaleInstances() {
  const instances = readInstanceRegistry();
  const alive = instances.filter((inst) => isProcessRunning(inst.pid));

  if (alive.length !== instances.length) {
    writeInstanceRegistry(alive);
  }
}
