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

## Environment variables

- `BD_BIN`: path to the `bd` binary.
- `BDUI_RUNTIME_DIR`: override runtime directory for PID/logs.
- `HOST`: overrides the bind address (default `127.0.0.1`).
- `PORT`: overrides the listen port (default `3000`).

These can also be set via CLI options: `bdui start --host 0.0.0.0 --port 8080`

### Runtime Directory Resolution (NEW)

beads-ui now uses **project-local** runtime directories, enabling multiple instances:

1. `BDUI_RUNTIME_DIR` if set (explicit override)
2. `.beads/.bdui/` in nearest beads project (**NEW** - one instance per project)
3. `$XDG_RUNTIME_DIR/beads-ui` (global fallback)
4. `os.tmpdir()/beads-ui` (global fallback)

**Before:** Only one beads-ui instance could run (global PID file).
**Now:** Run one instance per project on different ports.

Example multi-project workflow:
```bash
cd ~/project1 && bdui start --port 4000 &
cd ~/project2 && bdui start --port 4001 &
cd ~/project3 && bdui start --port 4002 &
```

Each instance uses `.beads/.bdui/server.pid` and `.beads/.bdui/daemon.log` in its project.

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
