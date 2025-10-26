import fs from 'node:fs';
import path from 'node:path';
import { resolveDbPath } from './db.js';

/**
 * Watch the resolved beads SQLite DB file and invoke a callback after a debounce window.
 * The DB path is resolved following beads precedence and can be overridden via options.
 * @param {string} root_dir - Project root directory (starting point for resolution).
 * @param {() => void} onChange - Called when changes are detected.
 * @param {{ debounce_ms?: number, explicit_db?: string }} [options]
 * @returns {{ close: () => void, rebind: (opts?: { root_dir?: string, explicit_db?: string }) => void, path: string }}
 */
export function watchDb(root_dir, onChange, options = {}) {
  const debounce_ms = options.debounce_ms ?? 250;

  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  /** @type {fs.FSWatcher | undefined} */
  let watcher;
  let current_path = '';
  let current_dir = '';
  let current_file = '';

  const schedule = () => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      onChange();
    }, debounce_ms);
    timer.unref();
  };

  /**
   * Attach a watcher to the directory containing the resolved DB path.
   * @param {string} base_dir
   * @param {string | undefined} explicit_db
   */
  const bind = (base_dir, explicit_db) => {
    const resolved = resolveDbPath({ cwd: base_dir, explicit_db });
    current_path = resolved.path;
    current_dir = path.dirname(current_path);
    current_file = path.basename(current_path);
    if (!resolved.exists) {
      console.warn(
        'watchDb: resolved DB does not exist yet:',
        current_path,
        '\nHint: set --db, export BEADS_DB, or run `bd init` in your workspace.'
      );
    }

    // (Re)create watcher
    try {
      watcher = fs.watch(
        current_dir,
        { persistent: true },
        (event_type, filename) => {
          if (filename && String(filename) !== current_file) {
            return;
          }
          if (event_type === 'change' || event_type === 'rename') {
            schedule();
          }
        }
      );
    } catch (err) {
      console.warn('watchDb: unable to watch directory', current_dir, err);
    }
  };

  // initial bind
  bind(root_dir, options.explicit_db);

  return {
    get path() {
      return current_path;
    },
    close() {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      watcher?.close();
    },
    /**
     * Re-resolve and reattach watcher when root_dir or explicit_db changes.
     * @param {{ root_dir?: string, explicit_db?: string }} [opts]
     */
    rebind(opts = {}) {
      const next_root = opts.root_dir ? String(opts.root_dir) : root_dir;
      const next_explicit = opts.explicit_db ?? options.explicit_db;
      const next_resolved = resolveDbPath({
        cwd: next_root,
        explicit_db: next_explicit
      });
      const next_path = next_resolved.path;
      if (next_path !== current_path) {
        // swap watcher
        watcher?.close();
        bind(next_root, next_explicit);
      }
    }
  };
}
