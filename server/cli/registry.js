/**
 * Central registry for tracking all running beads-ui instances.
 * Stored at ~/.bdui/instances.json for cross-project management.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Get path to central registry file.
 *
 * @returns {string}
 */
function getRegistryPath() {
  const registry_dir = path.join(os.homedir(), '.bdui');
  try {
    fs.mkdirSync(registry_dir, { recursive: true, mode: 0o700 });
  } catch {
    // ignore
  }
  return path.join(registry_dir, 'instances.json');
}

/**
 * @typedef {Object} InstanceData
 * @property {string} path
 * @property {number} port
 * @property {number} pid
 * @property {string} started_at
 * @property {string} [stopped_at]
 */

/**
 * Read the registry file.
 *
 * @returns {Record<string, InstanceData>}
 */
export function readRegistry() {
  const registry_path = getRegistryPath();
  try {
    const content = fs.readFileSync(registry_path, 'utf8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

/**
 * Write the registry file.
 *
 * @param {Record<string, any>} registry
 */
/**
 * Write the registry file.
 *
 * @param {Record<string, InstanceData>} registry
 */
function writeRegistry(registry) {
  const registry_path = getRegistryPath();
  try {
    fs.writeFileSync(registry_path, JSON.stringify(registry, null, 2), 'utf8');
  } catch (err) {
    console.warn(
      'Failed to write registry:',
      /** @type {Error} */ (err).message
    );
  }
}

/**
 * Get project name from path (last directory component).
 *
 * @param {string} project_path
 * @returns {string}
 */
function getProjectName(project_path) {
  return path.basename(project_path);
}

/**
 * Register a running instance.
 *
 * @param {{ project_path: string, port: number, pid: number }} params
 */
export function registerInstance({ project_path, port, pid }) {
  const registry = readRegistry();
  const project_name = getProjectName(project_path);

  registry[project_name] = {
    path: project_path,
    port: port,
    pid: pid,
    started_at: new Date().toISOString()
  };

  writeRegistry(registry);
}

/**
 * Unregister an instance by project name.
 *
 * @param {string} project_name
 */
export function unregisterInstance(project_name) {
  const registry = readRegistry();
  delete registry[project_name];
  writeRegistry(registry);
}

/**
 * Unregister by project path.
 *
 * @param {string} project_path
 */
export function unregisterInstanceByPath(project_path) {
  const project_name = getProjectName(project_path);
  unregisterInstance(project_name);
}

/**
 * Get all running instances (verified by PID check).
 *
 * @returns {Array<{ project: string, path: string, port: number, pid: number, started_at: string, running: boolean }>}
 */
export function getAllInstances() {
  const registry = readRegistry();
  const instances = [];

  for (const [project, data] of Object.entries(registry)) {
    const running = isProcessRunning(data.pid);
    instances.push({
      project: project,
      path: data.path,
      port: data.port,
      pid: data.pid,
      started_at: data.started_at,
      running: running
    });
  }

  return instances;
}

/**
 * Clean stale entries from registry (PIDs that are no longer running)
 * NOTE: This only removes entries, it doesn't update running status.
 * The registry is persistent and keeps stopped instances for restart-all.
 * Only call this when you want to purge truly stale entries.
 */
export function cleanRegistry() {
  const registry = readRegistry();
  /** @type {Record<string, InstanceData>} */
  const clean_registry = {};

  for (const [project, data] of Object.entries(registry)) {
    // Keep entry even if stopped - only remove if PID is invalid
    if (data.pid > 0) {
      clean_registry[project] = data;
    }
  }

  writeRegistry(clean_registry);
  return Object.keys(registry).length - Object.keys(clean_registry).length;
}

/**
 * Mark an instance as stopped in registry (without removing it).
 *
 * @param {string} project_path
 */
export function markInstanceStopped(project_path) {
  const registry = readRegistry();
  const project_name = getProjectName(project_path);

  if (registry[project_name]) {
    registry[project_name].stopped_at = new Date().toISOString();
    // Keep the port/path for restart-all to use
    writeRegistry(registry);
  }
}

/**
 * Check if a process is running.
 *
 * @param {number} pid
 * @returns {boolean}
 */
function isProcessRunning(pid) {
  try {
    if (pid <= 0) {
      return false;
    }
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = /** @type {{ code?: string }} */ (err).code;
    if (code === 'ESRCH') {
      return false;
    }
    return true;
  }
}
