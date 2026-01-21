# Environment Variables Reference

beads-ui uses environment variables for runtime configuration. This document
provides a comprehensive reference of all supported variables.

## Precedence

Configuration values are resolved in this order (highest to lowest):

1. **CLI arguments** (e.g., `--port 8080`)
2. **Environment variables** (e.g., `PORT=8080`)
3. **Config files** (e.g., `~/.bduirc`)
4. **Defaults**

## Server Configuration

| Variable           | Type   | Default     | Description                                                                                                    |
| ------------------ | ------ | ----------- | -------------------------------------------------------------------------------------------------------------- |
| `HOST`             | string | `127.0.0.1` | Server bind address. Set to `0.0.0.0` to allow external connections.                                           |
| `PORT`             | number | `3000`      | Server listen port. Can be overridden per-instance with `--port` flag.                                         |
| `BDUI_RUNTIME_DIR` | string | (auto)      | Override runtime directory for PID file and logs. Default uses project-local `.beads/.bdui/` or XDG directory. |

**Examples:**

```bash
# Allow external connections
HOST=0.0.0.0 bdui start

# Use different port
PORT=8080 bdui start

# Or use CLI flags
bdui start --host 0.0.0.0 --port 8080
```

## Multi-Instance Configuration

| Variable                  | Type   | Default | Description                                                                                                       |
| ------------------------- | ------ | ------- | ----------------------------------------------------------------------------------------------------------------- |
| `BDUI_DISCOVERY_PATHS`    | string | (none)  | Colon-separated list of directories to search for beads projects. Used by `bdui discover` when no paths provided. |
| `BDUI_DEFAULT_PORT_START` | number | `4000`  | Starting port number for automated multi-instance setup. Used by `bdui migrate --force` and similar commands.     |

**Examples:**

```bash
# Configure discovery paths
export BDUI_DISCOVERY_PATHS="$HOME/code:$HOME/projects:$HOME/workspace"

# Then discover without specifying paths
bdui discover

# Set custom starting port
export BDUI_DEFAULT_PORT_START=5000
```

**Alternative:** Use config file instead (recommended for interactive use):

```json
// ~/.bduirc
{
  "discoveryPaths": ["~/code", "~/projects"],
  "defaultPortStart": 4000
}
```

## External Tool Integration

| Variable | Type   | Default | Description                                                                                                                |
| -------- | ------ | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| `BD_BIN` | string | `bd`    | Path to the `bd` (beads) CLI binary. Override if `bd` is not in your PATH or you need a specific version.                  |
| `DEBUG`  | string | (none)  | Enable debug logging. Set to `beads-ui:*` for all logs, or specific namespaces like `beads-ui:ws` for WebSocket logs only. |

**Examples:**

```bash
# Use specific bd binary
BD_BIN=/usr/local/bin/bd bdui start

# Enable debug logging
DEBUG=beads-ui:* bdui start

# Debug specific modules
DEBUG=beads-ui:ws,beads-ui:cli bdui start
```

## XDG Base Directory Support

beads-ui respects the
[XDG Base Directory Specification](https://specifications.freedesktop.org/basedir-spec/basedir-spec-latest.html):

| Variable          | Used For                                             | Default Fallback       |
| ----------------- | ---------------------------------------------------- | ---------------------- |
| `XDG_RUNTIME_DIR` | Global runtime files (if `BDUI_RUNTIME_DIR` not set) | `os.tmpdir()/beads-ui` |

## Runtime Directory Resolution

When `BDUI_RUNTIME_DIR` is not set, beads-ui searches for runtime directory in
this order:

1. `.beads/.bdui/` in nearest beads project (enables multi-instance)
2. `$XDG_RUNTIME_DIR/beads-ui` (global instance)
3. `os.tmpdir()/beads-ui` (global instance fallback)

## Configuration File Formats

beads-ui uses [cosmiconfig](https://github.com/cosmiconfig/cosmiconfig) which
searches for configuration in these locations (from home directory):

- `.bduirc` (JSON or YAML)
- `.bduirc.json`, `.bduirc.yaml`, `.bduirc.yml`
- `.bduirc.js`, `.bduirc.mjs`, `.bduirc.cjs`
- `.config/bdui/config.json`, `config.yaml`, `config.yml`
- `bdui.config.js`, `bdui.config.mjs`, `bdui.config.cjs`
- `package.json` with `"bdui"` property

**Schema:**

```typescript
{
  discoveryPaths?: string[];      // Paths to search for beads projects
  defaultPortStart?: number;      // Starting port for multi-instance mode
}
```

## Examples

### Basic Setup

```bash
# Single instance (default)
bdui start

# Multi-instance on specific port
cd ~/my-project && bdui start --port 4000
cd ~/other-project && bdui start --port 4001
```

### With Configuration File

```json
// ~/.bduirc
{
  "discoveryPaths": ["~/code", "~/work", "~/projects"]
}
```

```bash
# Discover uses configured paths
bdui discover

# List shows all instances
bdui list
```

### With Environment Variables

```bash
# In ~/.bashrc or ~/.zshrc
export BDUI_DISCOVERY_PATHS="$HOME/code:$HOME/projects"
export BDUI_DEFAULT_PORT_START=5000
export DEBUG=beads-ui:*

# Commands use these settings
bdui discover  # Searches ~/code and ~/projects
```

### Hybrid Configuration

```bash
# Config file provides defaults
# ~/.bduirc: {"discoveryPaths": ["~/code"]}

# ENV overrides for this session
BDUI_DISCOVERY_PATHS="~/urgent-work" bdui discover

# CLI args override everything
bdui discover ~/specific/path
```

## Debugging

Enable verbose logging to troubleshoot configuration issues:

```bash
# See all debug logs
DEBUG=beads-ui:* bdui start

# See only CLI-related logs
DEBUG=beads-ui:cli bdui discover

# See configuration resolution
DEBUG=cosmiconfig bdui start
```

## Security Considerations

- `~/.bdui/` directory is created with `0700` permissions (owner-only access)
- Runtime directories follow XDG spec security recommendations
- PID files and registries are not world-readable
- Config files should not contain secrets (use environment variables for
  sensitive data)
