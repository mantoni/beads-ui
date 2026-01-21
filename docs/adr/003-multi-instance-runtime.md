# ADR 003 — Multi-Instance Runtime Architecture

```
Date: 2026-01-21
Status: Accepted
Owner: community
```

## Context

Prior to this change, beads-ui used a single global runtime directory for all instances, preventing users from running multiple instances simultaneously. This created friction for users working on multiple projects who wanted isolated UI instances.

**Limitations of single-instance model:**
- Only one `bdui` process could run system-wide (global PID file)
- No way to view multiple boards simultaneously
- Switching projects required stopping and restarting the server
- No process isolation (crash affected all projects)

**User requests:**
- Run multiple boards side-by-side for cross-project work
- Dedicated ports per project (firewall rules, proxies, remote access)
- Process isolation for experimental/unstable projects
- CLI-based instance management for automation

## Decision

Implement project-local runtime directories with CLI management tools, while preserving backward compatibility with single-instance mode.

### Runtime Directory Resolution

Changed from single global directory to hierarchical resolution:

1. `BDUI_RUNTIME_DIR` if set (explicit override, preserves existing behavior)
2. `.beads/.bdui/` in nearest beads project directory (**NEW**)
3. `$XDG_RUNTIME_DIR/beads-ui` (global fallback)
4. `os.tmpdir()/beads-ui` (global fallback)

Each instance stores:
- `server.pid` — Process ID
- `daemon.log` — Server logs

### Central Registry

Maintain a central registry at `~/.bdui/instances.json` tracking all running instances:

```json
[
  {
    "project": "project-name",
    "path": "/absolute/path/to/project",
    "port": 4000,
    "pid": 12345,
    "started_at": "2026-01-21T10:00:00Z"
  }
]
```

### CLI Commands

Added four new commands for multi-instance management:

- `bdui list` — Show all running instances with status
- `bdui discover <paths>` — Find all beads projects in directory tree
- `bdui stop-all` — Stop all registered instances
- `bdui restart-all` — Restart all registered instances

### Lifecycle Hooks

- **Start:** Register instance in central registry
- **Stop:** Unregister from central registry
- **Crash:** Stale entries detected and cleaned on next operation

### Compatibility

- **Single-instance users:** No changes required, works exactly as before
- **Multi-instance users:** Opt-in by specifying `--port` per project
- **Environment override:** `BDUI_RUNTIME_DIR` forces global mode if needed

## API Shape

### Registry Module (`server/cli/registry.js`)

```js
// Register new instance
registerInstance({ project_path, port, pid })

// Remove instance
unregisterInstanceByPath(project_path)

// List all instances with runtime status
getAllInstances() -> [{ project, path, port, pid, running, started_at }]

// Clean stale entries
cleanRegistry()
```

### Discovery Module (`server/cli/discover.js`)

```js
// Find all beads projects
discoverProjects(search_paths) -> [{ name, path, has_issues }]
```

### Migration Module (`server/cli/migrate.js`)

```js
// Check for old global instance, offer migration
handleMigrate({ force, port_start })
```

## Consequences

### Pros

- ✅ Multiple boards open simultaneously
- ✅ Process isolation (crash one, others unaffected)
- ✅ Flexible network configuration (per-project ports)
- ✅ CLI-first automation workflows
- ✅ Resource monitoring per project
- ✅ Backward compatible (single-instance still works)

### Cons / Trade-offs

- ⚠️ Higher memory usage (N processes vs 1)
- ⚠️ Port management required for multi-instance mode
- ⚠️ Additional CLI surface area to maintain

### Risks

- Users may forget which ports they assigned
  - *Mitigation:* `bdui list` shows all instances
- Registry can get stale if processes killed externally
  - *Mitigation:* Registry shows runtime status, detects stale PIDs
- Migration from old global instance
  - *Mitigation:* `bdui migrate` automates detection and migration

## Implementation Checklist

CLI Commands
- [x] `bdui list` — Show running instances with status
- [x] `bdui discover` — Find beads projects
- [x] `bdui stop-all` — Stop all instances
- [x] `bdui restart-all` — Restart all instances

Runtime
- [x] Project-local runtime directory resolution
- [x] Central registry at `~/.bdui/instances.json`
- [x] Instance registration on start
- [x] Instance cleanup on stop
- [x] Stale PID detection

Migration
- [x] `bdui migrate` command for old global instances
- [x] Auto-discovery of projects
- [x] Port assignment strategy

Documentation
- [x] This ADR committed
- [x] README updated with multi-instance usage
- [x] CHANGES.md updated

Testing
- [x] Integration tests for registry operations
- [x] Discovery tests with nested projects
- [x] Migration tests with legacy setups

## Compatibility with Workspace Switching (v0.8.0+)

This feature is **complementary** to the workspace switching feature added in v0.8.0:

- **Workspace switching:** Single server, UI-based project selection
- **Multi-instance:** Multiple servers, CLI-based management

Users can choose their preferred workflow or use both:
- Run one global instance with workspace switching for quick access
- Run dedicated instances on specific ports for important projects
- Hybrid: Global instance for experiments, dedicated instances for production

## Notes

The registry is intentionally simple (JSON file) rather than using a database or daemon. This keeps the implementation lightweight and debuggable.

Port assignment is manual (via `--port` flag) rather than automatic. This gives users explicit control and prevents port conflicts with other services.

The "project name" in listings is derived from the directory name, not from beads metadata. This keeps discovery fast and doesn't require parsing beads databases.

## Related Work

- Protocol: See `docs/protocol/` for server-client communication
- Workspace switching: See upstream v0.8.0 release notes
- Server architecture: See `docs/architecture.md`
