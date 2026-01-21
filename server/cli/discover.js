/**
 * Discovery utilities for finding beads projects in the filesystem.
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * Recursively find all directories containing .beads/ subdirectory.
 *
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
    } catch {
      // Permission denied or other errors - skip directory
    }
  }

  walk(search_path, 0);
  return projects;
}

/**
 * Handle discover command.
 *
 * @param {string[]} search_paths - Paths to search
 * @returns {Promise<number>}
 */
export async function handleDiscover(search_paths = []) {
  const { getDiscoveryPaths } = await import('./config.js');

  // If no paths provided, try to use configured paths
  if (search_paths.length === 0) {
    const configured_paths = await getDiscoveryPaths();

    if (configured_paths && configured_paths.length > 0) {
      search_paths = configured_paths;
      const source = process.env.BDUI_DISCOVERY_PATHS ? 'BDUI_DISCOVERY_PATHS' : 'config file';
      console.log(`Using discovery paths from ${source}\n`);
    } else {
      console.error('No search paths provided and none configured.');
      console.log('');
      console.log('Usage:');
      console.log('  bdui discover <path> [<path>...]');
      console.log('');
      console.log('Configuration options:');
      console.log('  1. Environment variable (recommended for scripts):');
      console.log('       export BDUI_DISCOVERY_PATHS="~/code:~/projects"');
      console.log('');
      console.log('  2. Config file (recommended for interactive use):');
      console.log('       Create ~/.bduirc:');
      console.log('       {');
      console.log('         "discoveryPaths": ["~/code", "~/projects"]');
      console.log('       }');
      console.log('');
      console.log('  3. One-time search (no config):');
      console.log('       bdui discover ~/code ~/projects');
      console.log('');
      console.log('See: https://github.com/cosmiconfig/cosmiconfig for config formats');
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

  return 0;
}
