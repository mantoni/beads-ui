import fs from 'node:fs';
import path from 'node:path';
import { resolveWorkspaceDatabase } from './db.js';
import { debug } from './logging.js';

/**
 * Watch the resolved workspace database target and invoke a callback after a
 * debounce window.
 *
 * For SQLite workspaces this watches the DB file's parent directory and filters
 * by file name. For non-SQLite backends (for example Dolt), this watches the
 * workspace `.beads` directory.
 *
 * @param {string} root_dir - Project root directory (starting point for resolution).
 * @param {() => void} onChange - Called when changes are detected.
 * @param {{ debounce_ms?: number, cooldown_ms?: number, explicit_db?: string }} [options]
 * @returns {{ close: () => void, rebind: (opts?: { root_dir?: string, explicit_db?: string }) => void, path: string }}
 */
export function watchDb(root_dir, onChange, options = {}) {
  const debounce_ms = options.debounce_ms ?? 250;
  const cooldown_ms = options.cooldown_ms ?? 1000;
  const log = debug('watcher');

  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  /** @type {fs.FSWatcher | undefined} */
  let watcher;
  let cooldown_until = 0;
  let current_path = '';
  let current_dir = '';
  let current_file = '';

  /**
   * Schedule the debounced onChange callback.
   */
  const schedule = () => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      onChange();
      cooldown_until = Date.now() + cooldown_ms;
    }, debounce_ms);
    timer.unref();
  };

  /**
   * Attach a watcher to the directory containing the resolved DB path.
   *
   * @param {string} base_dir
   * @param {string | undefined} explicit_db
   */
  const bind = (base_dir, explicit_db) => {
    const resolved = resolveWorkspaceDatabase({ cwd: base_dir, explicit_db });
    current_path = resolved.path;
    if (pathIsDirectory(current_path)) {
      current_dir = current_path;
      current_file = '';
    } else {
      current_dir = path.dirname(current_path);
      current_file = path.basename(current_path);
    }
    if (!resolved.exists) {
      log(
        'resolved workspace database missing: %s – Hint: set --db, export BEADS_DB, or run `bd init` in your workspace.',
        current_path
      );
    }

    // (Re)create watcher
    try {
      watcher = fs.watch(
        current_dir,
        { persistent: true },
        (event_type, filename) => {
          if (current_file && filename && String(filename) !== current_file) {
            return;
          }
          if (event_type === 'change' || event_type === 'rename') {
            if (Date.now() < cooldown_until) {
              return;
            }
            log('fs %s %s', event_type, filename || '');
            schedule();
          }
        }
      );
    } catch (err) {
      log('unable to watch directory %s %o', current_dir, err);
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
     *
     * @param {{ root_dir?: string, explicit_db?: string }} [opts]
     */
    rebind(opts = {}) {
      const next_root = opts.root_dir ? String(opts.root_dir) : root_dir;
      const next_explicit = opts.explicit_db ?? options.explicit_db;
      const next_resolved = resolveWorkspaceDatabase({
        cwd: next_root,
        explicit_db: next_explicit
      });
      const next_path = next_resolved.path;
      if (next_path !== current_path) {
        // swap watcher
        watcher?.close();
        cooldown_until = 0;
        bind(next_root, next_explicit);
      }
    }
  };
}

/**
 * @param {string} file_path
 */
function pathIsDirectory(file_path) {
  try {
    return fs.statSync(file_path).isDirectory();
  } catch {
    return false;
  }
}
