<h1 align="center">
  Beads UI
</h1>
<p align="center">
  <b>Local UI for the <code>bd</code> CLI – <a href="https://github.com/steveyegge/beads">Beads</a></b><br>
  Collaborate on issues with your coding agent.
</p>
<div align="center">
  <a href="https://www.npmjs.com/package/beads-ui"><img src="https://img.shields.io/npm/v/beads-ui.svg" alt="npm Version"></a>
  <a href="https://semver.org"><img src="https://img.shields.io/:semver-%E2%9C%93-blue.svg" alt="SemVer"></a>
  <a href="https://github.com/mantoni/beads-ui/actions/worflows/ci.yml"><img src="https://github.com/mantoni/eslint_d.js/actions/workflows/ci.yml/badge.svg" alt="Build Status"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/npm/l/eslint_d.svg" alt="MIT License"></a>
  <br>
  <br>
</div>

## Features

- ✨ **Zero setup** – just run `bdui start`
- 📺 **Live updates** – Monitors the beads database for changes
- 🔎 **Issues view** – Filter and search issues, edit inline
- ⛰️ **Epics view** – Show progress per epic, expand rows, edit inline
- 🏂 **Board view** – Blocked / Ready / In progress / Closed columns
- ⌨️ **Keyboard navigation** – Navigate and edit without touching the mouse
- 🚀 **Multi-instance management** – Run multiple projects simultaneously with CLI tools

## Setup

```sh
npm i beads-ui -g
# In your project directory:
bdui start --open
```

See `bdui --help` for options.

### Upgrading from older versions

If upgrading from a version before project-local support:

```bash
# 1. Check for old global instance
bdui migrate

# 2. Find all your beads projects
bdui discover ~/github

# 3. Restart instances per-project
cd ~/your-project && bdui start --port 4000

# 4. Verify all instances
bdui list
```

## Screenshots

**Issues**

![Issues view](https://github.com/mantoni/beads-ui/raw/main/media/bdui-issues.png)

**Epics**

![Epics view](https://github.com/mantoni/beads-ui/raw/main/media/bdui-epics.png)

**Board**

![Board view](https://github.com/mantoni/beads-ui/raw/main/media/bdui-board.png)

## Multi-Instance Management

Run multiple beads-ui instances simultaneously for different projects.

### CLI Commands

```bash
# List all running instances
bdui list

# Find all beads projects in a directory
bdui discover ~/code

# Stop all running instances
bdui stop-all

# Restart all registered instances
bdui restart-all
```

### When to Use Multi-Instance Mode

**Use multiple instances when you:**
- Work on several projects simultaneously and want boards open side-by-side
- Need process isolation (one crash doesn't affect other projects)
- Want different ports per project (firewall rules, proxies, remote access)
- Prefer CLI-based automation workflows

**Use single instance when you:**
- Work on 1-2 projects casually
- Prefer UI-based workspace switching (see v0.8.0+ workspace picker)
- Want minimal resource usage
- Don't need port-level isolation

### Example Workflows

**Side-by-side boards:**
```bash
# Terminal 1
cd ~/work-project && bdui start --port 4000 --open

# Terminal 2
cd ~/personal-project && bdui start --port 4001 --open

# See both instances
bdui list
```

**Batch management:**
```bash
# Find all your beads projects
bdui discover ~/code ~/projects

# Stop everything before system shutdown
bdui stop-all

# Restart everything after reboot
bdui restart-all
```

**Hybrid approach:**
```bash
# Critical project on dedicated port
cd ~/production-app && bdui start --port 4000

# Quick experiments share default port (workspace switching)
cd ~/experiment1 && bdui start  # Registers with :3000
cd ~/experiment2 && bdui start  # Also uses :3000, switch in UI
```

Each instance stores runtime data in `.beads/.bdui/` within the project directory
(PID file, logs). A central registry at `~/.bdui/instances.json` tracks all
running instances for CLI tools.

See [ADR 003](docs/adr/003-multi-instance-runtime.md) for architecture details.

## Environment variables

- `BD_BIN`: path to the `bd` binary.
- `BDUI_RUNTIME_DIR`: override runtime directory for PID/logs.
- `HOST`: overrides the bind address (default `127.0.0.1`).
- `PORT`: overrides the listen port (default `3000`).

These can also be set via CLI options: `bdui start --host 0.0.0.0 --port 8080`

### Runtime Directory Resolution

Beads-ui automatically finds the best location for runtime files (PID, logs):

1. `BDUI_RUNTIME_DIR` if set (explicit override)
2. `.beads/.bdui/` in nearest beads project (enables multi-instance)
3. `$XDG_RUNTIME_DIR/beads-ui` (single-instance fallback)
4. `os.tmpdir()/beads-ui` (single-instance fallback)

Project-local directories enable multiple instances with isolated state.

## Platform notes

- macOS/Linux are fully supported. On Windows, the CLI uses `cmd /c start` to
  open URLs and relies on Node’s `process.kill` semantics for stopping the
  daemon.

## Developer Workflow

- 🔨 Clone the repo and run `npm install`.
- 🚀 Start the dev server with `npm start`.
- 🔗 Alternatively, use `npm link` to link the package globally and run
  `bdui start` from any project.

## Debug Logging

- The codebase uses the `debug` package with namespaces like `beads-ui:*`.
- Enable logs in the browser by running in DevTools:
  - `localStorage.debug = 'beads-ui:*'` then reload the page
- Enable logs for Node/CLI (server, build scripts) by setting `DEBUG`:
  - `DEBUG=beads-ui:* bdui start`
  - `DEBUG=beads-ui:* node scripts/build-frontend.js`

## License

MIT
