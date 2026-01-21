/**
 * User configuration management for bdui using cosmiconfig.
 *
 * Precedence (highest to lowest):
 * 1. Environment variables (BDUI_*)
 * 2. Config file (.bduirc, ~/.config/bdui/config.json, etc.)
 * 3. Defaults
 *
 * Config file search locations:
 * - ~/.bduirc (JSON or YAML)
 * - ~/.bduirc.json, .bduirc.yaml, .bduirc.yml
 * - ~/.bduirc.js, .bduirc.mjs, .bduirc.cjs
 * - ~/.config/bdui/config.json, config.yaml, config.yml
 * - package.json "bdui" property
 */
import os from 'node:os';
import path from 'node:path';
import { cosmiconfig } from 'cosmiconfig';

const explorer = cosmiconfig('bdui', {
  searchPlaces: [
    '.bduirc',
    '.bduirc.json',
    '.bduirc.yaml',
    '.bduirc.yml',
    '.bduirc.js',
    '.bduirc.mjs',
    '.bduirc.cjs',
    '.config/bdui/config.json',
    '.config/bdui/config.yaml',
    '.config/bdui/config.yml',
    'bdui.config.js',
    'bdui.config.mjs',
    'bdui.config.cjs'
  ]
});

/**
 * Load user configuration from standard locations.
 * Searches from home directory for global config.
 *
 * @returns {Promise<{ discoveryPaths?: string[], defaultPortStart?: number } | null>}
 */
export async function loadUserConfig() {
  try {
    const result = await explorer.search(os.homedir());
    return result?.config || null;
  } catch {
    return null;
  }
}

/**
 * Get discovery paths with precedence: ENV > config file > null.
 * Supports BDUI_DISCOVERY_PATHS environment variable (colon-separated).
 *
 * @returns {Promise<string[] | null>}
 */
export async function getDiscoveryPaths() {
  // 1. Check environment variable first (backward compatibility)
  const env_paths = process.env.BDUI_DISCOVERY_PATHS;
  if (env_paths && env_paths.length > 0) {
    return env_paths.split(':').map((p) =>
      p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p
    );
  }

  // 2. Check config file
  const config = await loadUserConfig();
  if (config?.discoveryPaths && Array.isArray(config.discoveryPaths)) {
    return config.discoveryPaths.map((p) =>
      p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p
    );
  }

  // 3. No configuration found
  return null;
}

/**
 * Get default starting port for multi-instance mode.
 * Supports BDUI_DEFAULT_PORT_START environment variable.
 *
 * @returns {Promise<number>} Default: 4000
 */
export async function getDefaultPortStart() {
  // 1. Check environment variable first
  const env_port = process.env.BDUI_DEFAULT_PORT_START;
  if (env_port) {
    const port = Number.parseInt(env_port, 10);
    if (Number.isFinite(port) && port > 0) {
      return port;
    }
  }

  // 2. Check config file
  const config = await loadUserConfig();
  if (config?.defaultPortStart && Number.isFinite(config.defaultPortStart)) {
    return config.defaultPortStart;
  }

  // 3. Default
  return 4000;
}
