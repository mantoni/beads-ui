import path from 'node:path';

/** @type {string} */
let root_dir = process.cwd();

/**
 * Get the current workspace root directory used for DB resolution and `bd` invocations.
 *
 * @returns {string}
 */
export function getRootDir() {
  return root_dir;
}

/**
 * Set the current workspace root directory.
 *
 * @param {string} next_root_dir
 * @returns {string}
 */
export function setRootDir(next_root_dir) {
  root_dir = path.resolve(String(next_root_dir || '').trim() || root_dir);
  return root_dir;
}
