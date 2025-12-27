import { createServer } from 'node:http';
import { createApp } from './app.js';
import { printServerUrl } from './cli/daemon.js';
import { getConfig } from './config.js';
import { debug, enableAllDebug } from './logging.js';
import { watchDb } from './watcher.js';
import { getRootDir, setRootDir } from './workspace.js';
import { attachWsServer } from './ws.js';

if (process.argv.includes('--debug') || process.argv.includes('-d')) {
  enableAllDebug();
}

// Parse --host and --port from argv and set env vars before getConfig()
for (let i = 0; i < process.argv.length; i++) {
  if (process.argv[i] === '--host' && process.argv[i + 1]) {
    process.env.HOST = process.argv[++i];
  }
  if (process.argv[i] === '--port' && process.argv[i + 1]) {
    process.env.PORT = process.argv[++i];
  }
}

const config = getConfig();
setRootDir(config.root_dir);

/** @type {() => void} */
let schedule_list_refresh = () => {};

/** @type {ReturnType<typeof watchDb> | null} */
let watcher_handle = null;

const app = createApp(config, {
  getRootDir,
  setRootDir: (next_root_dir) => {
    setRootDir(next_root_dir);
    watcher_handle?.rebind({ root_dir: getRootDir() });
    try {
      schedule_list_refresh();
    } catch {
      // ignore
    }
  }
});
const server = createServer(app);
const log = debug('server');
const { scheduleListRefresh } = attachWsServer(server, {
  path: '/ws',
  heartbeat_ms: 30000,
  // Coalesce DB change bursts into one refresh run
  refresh_debounce_ms: 75
});

schedule_list_refresh = scheduleListRefresh;

// Watch the active beads DB and schedule subscription refresh for active lists
watcher_handle = watchDb(getRootDir(), () => {
  // Schedule subscription list refresh run for active subscriptions
  log('db change detected → schedule refresh');
  schedule_list_refresh();
  // v2: all updates flow via subscription push envelopes only
});

server.listen(config.port, config.host, () => {
  printServerUrl();
});

server.on('error', (err) => {
  log('server error %o', err);
  process.exitCode = 1;
});
