import { createServer } from 'node:http';
import { createApp } from './app.js';
import { getConfig } from './config.js';
import { watchDb } from './watcher.js';
import { attachWsServer } from './ws.js';

const config = getConfig();
const app = createApp(config);
const server = createServer(app);
const { notifyIssuesChanged, scheduleListRefresh, pushIssuesRefreshAll } =
  attachWsServer(server, {
    path: '/ws',
    heartbeat_ms: 30000,
    // Coalesce DB change bursts into one refresh run
    refresh_debounce_ms: 75
  });

// Watch the active beads DB and push invalidation (targeted when possible)
watchDb(config.root_dir, (payload) => {
  // Push targeted invalidation for legacy flows
  notifyIssuesChanged(payload);
  // Schedule subscription list refresh run for active subscriptions
  scheduleListRefresh();
  // Also push a non-snapshot issues envelope for v2 push-only clients
  void pushIssuesRefreshAll();
});

server.listen(config.port, config.host, () => {
  console.log(
    `beads-ui server listening on http://${config.host}:${config.port} (${config.env})`
  );
});

server.on('error', (err) => {
  console.error('Server error:', err);
  process.exitCode = 1;
});
