/**
 * Discovery utilities for finding beads projects in the filesystem.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Recursively find all directories containing .beads/ subdirectory
 * @param {string} search_path - Root path to search
 * @param {number} max_depth - Maximum recursion depth (default: 4)
 * @returns {string[]} - Array of project paths (directories containing .beads/)
 */
export function findBeadsProjects(search_path, max_depth = 4) {
  const projects = [];

  function walk(dir, depth) {
    if (depth > max_depth) return;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      // Check if this directory has .beads/
      const has_beads = entries.some(e => e.isDirectory() && e.name === '.beads');
      if (has_beads) {
        projects.push(dir);
        // Don't recurse into beads projects (avoid nested projects)
        return;
      }

      // Recurse into subdirectories
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        // Skip common large directories
        if (entry.name === 'node_modules' ||
            entry.name === '.git' ||
            entry.name === 'dist' ||
            entry.name === 'build' ||
            entry.name.startsWith('.')) {
          continue;
        }

        walk(path.join(dir, entry.name), depth + 1);
      }
    } catch (err) {
      // Permission denied or other errors - skip directory
    }
  }

  walk(search_path, 0);
  return projects;
}

/**
 * Check if a beads-ui server is running for a project by trying to connect
 * @param {number} port - Port to check
 * @returns {Promise<boolean>}
 */
async function isServerRunningOnPort(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/healthz`, {
      signal: AbortSignal.timeout(1000)
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Try common ports to find running instance for a project
 * @param {string} project_path
 * @returns {Promise<number | null>} - Port if found
 */
async function findRunningPort(project_path) {
  // Try common ports
  const common_ports = [4000, 4001, 4002, 4003, 4004, 4005, 3000, 3001, 3002];

  for (const port of common_ports) {
    if (await isServerRunningOnPort(port)) {
      // Found a server, but we can't be 100% sure it's for this project
      // Return it as a candidate
      return port;
    }
  }

  return null;
}

/**
 * Handle discover command
 * @param {string[]} search_paths - Paths to search (defaults to ~/github)
 * @param {{ register?: boolean }} options
 * @returns {Promise<number>}
 */
export async function handleDiscover(search_paths = [], options = {}) {
  // Default to ~/github if no paths provided
  if (search_paths.length === 0) {
    const github_dir = path.join(os.homedir(), 'github');
    if (fs.existsSync(github_dir)) {
      search_paths = [github_dir];
    } else {
      console.error('No search paths provided and ~/github not found.');
      console.log('Usage: bdui discover <path> [<path>...]');
      return 1;
    }
  }

  console.log('Searching for beads projects...\n');

  const all_projects = [];
  for (const search_path of search_paths) {
    console.log(`Searching ${search_path}...`);
    const projects = findBeadsProjects(search_path);
    all_projects.push(...projects);
    console.log(`  Found ${projects.length} project(s)`);
  }

  if (all_projects.length === 0) {
    console.log('\nNo beads projects found.');
    return 0;
  }

  console.log(`\nDiscovered beads projects (${all_projects.length}):\n`);

  for (const project of all_projects) {
    const project_name = path.basename(project);
    console.log(`  ${project_name}`);
    console.log(`    ${project}`);
  }

  console.log('\nTo start an instance for any project:');
  console.log('  cd <project-path> && bdui start --port 4000\n');

  if (options.register) {
    console.log('Note: Auto-registration not yet implemented.');
    console.log('Instances will self-register when you start them.');
  }

  return 0;
}
