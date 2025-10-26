import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Resolve the SQLite DB path used by beads according to precedence:
 * 1) explicit --db flag (provided via options.explicit_db)
 * 2) BEADS_DB environment variable
 * 3) nearest ".beads/*.db" by walking up from cwd
 * 4) "~/.beads/default.db" fallback
 *
 * Returns a normalized absolute path and a `source` indicator. Existence is
 * returned via the `exists` boolean.
 * @param {{ cwd?: string, env?: Record<string, string | undefined>, explicit_db?: string }} [options]
 * @returns {{ path: string, source: 'flag'|'env'|'nearest'|'home-default', exists: boolean }}
 */
export function resolveDbPath(options = {}) {
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
  const env = options.env || process.env;

  // 1) explicit flag
  if (options.explicit_db && options.explicit_db.length > 0) {
    const p = absFrom(options.explicit_db, cwd);
    return { path: p, source: 'flag', exists: fileExists(p) };
  }

  // 2) BEADS_DB env
  if (env.BEADS_DB && String(env.BEADS_DB).length > 0) {
    const p = absFrom(String(env.BEADS_DB), cwd);
    return { path: p, source: 'env', exists: fileExists(p) };
  }

  // 3) nearest .beads/*.db walking up
  const nearest = findNearestBeadsDb(cwd);
  if (nearest) {
    return { path: nearest, source: 'nearest', exists: fileExists(nearest) };
  }

  // 4) ~/.beads/default.db
  const homeDefault = path.join(os.homedir(), '.beads', 'default.db');
  return {
    path: homeDefault,
    source: 'home-default',
    exists: fileExists(homeDefault)
  };
}

/**
 * Find nearest .beads/*.db by walking up from start.
 * First alphabetical .db.
 * @param {string} start
 * @returns {string | null}
 */
export function findNearestBeadsDb(start) {
  let dir = path.resolve(start);
  // Cap iterations to avoid infinite loop in degenerate cases
  for (let i = 0; i < 100; i++) {
    const beadsDir = path.join(dir, '.beads');
    try {
      const entries = fs.readdirSync(beadsDir, { withFileTypes: true });
      const dbs = entries
        .filter((e) => e.isFile() && e.name.endsWith('.db'))
        .map((e) => e.name)
        .sort();
      if (dbs.length > 0) {
        return path.join(beadsDir, dbs[0]);
      }
    } catch {
      // ignore and walk up
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return null;
}

/**
 * Resolve possibly relative `p` against `cwd` to an absolute filesystem path.
 * @param {string} p
 * @param {string} cwd
 */
function absFrom(p, cwd) {
  return path.isAbsolute(p) ? path.normalize(p) : path.join(cwd, p);
}

/**
 * @param {string} p
 */
function fileExists(p) {
  try {
    fs.accessSync(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
