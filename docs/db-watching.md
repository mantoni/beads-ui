# DB Watching and Resolution

The server watches the active beads SQLite database file for changes and
schedules a refresh of active list subscriptions. Clients receive
`snapshot`/`upsert`/`delete` envelopes for their active subscriptions.

## Resolution Order

The DB path is resolved to match beads CLI precedence:

1. `--db <path>` flag (when forced by the server configuration)
2. `BEADS_DB` environment variable
3. Nearest `.beads/*.db` by walking up from the server `root_dir`
4. `~/.beads/default.db` fallback

The resolved path is injected into all `bd` CLI invocations via `--db` to ensure
the watcher and CLI operate on the same database.

## Behavior When Missing

If no database exists at the resolved path (e.g., before `bd init`), the server
will still attempt to bind a watcher on the containing directory and log a clear
warning. Initialize a database with one of:

- `bd --db /path/to/file.db init`
- `export BEADS_DB=/path/to/file.db && bd init`
- `bd init` in a workspace with a `.beads/` directory

After initialization, changes will be detected without restarting the server.
The watcher can rebind when the workspace or configuration changes at runtime.
