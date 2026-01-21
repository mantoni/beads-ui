import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  getDefaultPortStart,
  getDiscoveryPaths,
  loadUserConfig
} from './config.js';

/** @type {string} */
let tmp_home;
/** @type {string | undefined} */
let prev_home;
/** @type {string | undefined} */
let prev_discovery_paths;
/** @type {string | undefined} */
let prev_default_port;

beforeEach(() => {
  // Create temp home directory
  tmp_home = fs.mkdtempSync(path.join(os.tmpdir(), 'bdui-config-'));
  prev_home = process.env.HOME;
  process.env.HOME = tmp_home;

  // Save and clear env vars
  prev_discovery_paths = process.env.BDUI_DISCOVERY_PATHS;
  prev_default_port = process.env.BDUI_DEFAULT_PORT_START;
  delete process.env.BDUI_DISCOVERY_PATHS;
  delete process.env.BDUI_DEFAULT_PORT_START;
});

afterEach(() => {
  // Restore environment
  process.env.HOME = prev_home;
  if (prev_discovery_paths !== undefined) {
    process.env.BDUI_DISCOVERY_PATHS = prev_discovery_paths;
  }
  if (prev_default_port !== undefined) {
    process.env.BDUI_DEFAULT_PORT_START = prev_default_port;
  }

  // Clean up temp directory
  try {
    fs.rmSync(tmp_home, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe('loadUserConfig', () => {
  test('returns null when no config file exists', async () => {
    const config = await loadUserConfig();
    expect(config).toBeNull();
  });

  test('loads .bduirc JSON file', async () => {
    const config_path = path.join(tmp_home, '.bduirc');
    fs.writeFileSync(
      config_path,
      JSON.stringify({ discoveryPaths: ['~/code'] }),
      'utf8'
    );

    const config = await loadUserConfig();
    expect(config).toEqual({ discoveryPaths: ['~/code'] });
  });

  test('loads .bduirc.json file', async () => {
    const config_path = path.join(tmp_home, '.bduirc.json');
    fs.writeFileSync(
      config_path,
      JSON.stringify({ defaultPortStart: 5000 }),
      'utf8'
    );

    const config = await loadUserConfig();
    expect(config).toEqual({ defaultPortStart: 5000 });
  });

  test('loads .config/bdui/config.json file', async () => {
    const config_dir = path.join(tmp_home, '.config', 'bdui');
    fs.mkdirSync(config_dir, { recursive: true });
    fs.writeFileSync(
      path.join(config_dir, 'config.json'),
      JSON.stringify({ discoveryPaths: ['~/projects'] }),
      'utf8'
    );

    const config = await loadUserConfig();
    expect(config).toEqual({ discoveryPaths: ['~/projects'] });
  });

  test('handles malformed JSON gracefully', async () => {
    const config_path = path.join(tmp_home, '.bduirc.json');
    // Use .json extension to force JSON parsing (not JS)
    fs.writeFileSync(config_path, '{this is: not valid JSON at all', 'utf8');

    const config = await loadUserConfig();
    expect(config).toBeNull();
  });
});

describe('getDiscoveryPaths', () => {
  test('returns null when no configuration exists', async () => {
    const paths = await getDiscoveryPaths();
    expect(paths).toBeNull();
  });

  test('returns paths from config file', async () => {
    const config_path = path.join(tmp_home, '.bduirc');
    fs.writeFileSync(
      config_path,
      JSON.stringify({ discoveryPaths: ['~/code', '~/projects'] }),
      'utf8'
    );

    const paths = await getDiscoveryPaths();
    expect(paths).toEqual([
      path.join(tmp_home, 'code'),
      path.join(tmp_home, 'projects')
    ]);
  });

  test('expands tilde to home directory', async () => {
    const config_path = path.join(tmp_home, '.bduirc');
    fs.writeFileSync(
      config_path,
      JSON.stringify({ discoveryPaths: ['~/workspace'] }),
      'utf8'
    );

    const paths = await getDiscoveryPaths();
    expect(paths).toEqual([path.join(tmp_home, 'workspace')]);
  });

  test('keeps absolute paths unchanged', async () => {
    const config_path = path.join(tmp_home, '.bduirc');
    fs.writeFileSync(
      config_path,
      JSON.stringify({ discoveryPaths: ['/var/www', '/opt/projects'] }),
      'utf8'
    );

    const paths = await getDiscoveryPaths();
    expect(paths).toEqual(['/var/www', '/opt/projects']);
  });

  test('ENV takes precedence over config file', async () => {
    // Create config file
    const config_path = path.join(tmp_home, '.bduirc');
    fs.writeFileSync(
      config_path,
      JSON.stringify({ discoveryPaths: ['~/from-file'] }),
      'utf8'
    );

    // Set env var
    process.env.BDUI_DISCOVERY_PATHS = '~/from-env:~/another';

    const paths = await getDiscoveryPaths();
    expect(paths).toEqual([
      path.join(tmp_home, 'from-env'),
      path.join(tmp_home, 'another')
    ]);
  });

  test('parses colon-separated env var correctly', async () => {
    process.env.BDUI_DISCOVERY_PATHS = '~/code:~/work:~/projects';

    const paths = await getDiscoveryPaths();
    expect(paths).toHaveLength(3);
    expect(paths).toEqual([
      path.join(tmp_home, 'code'),
      path.join(tmp_home, 'work'),
      path.join(tmp_home, 'projects')
    ]);
  });

  test('handles empty env var gracefully', async () => {
    process.env.BDUI_DISCOVERY_PATHS = '';

    const paths = await getDiscoveryPaths();
    expect(paths).toBeNull();
  });

  test('handles invalid config file property gracefully', async () => {
    const config_path = path.join(tmp_home, '.bduirc');
    fs.writeFileSync(
      config_path,
      JSON.stringify({ discoveryPaths: 'not-an-array' }),
      'utf8'
    );

    const paths = await getDiscoveryPaths();
    expect(paths).toBeNull();
  });
});

describe('getDefaultPortStart', () => {
  test('returns 4000 when no configuration exists', async () => {
    const port = await getDefaultPortStart();
    expect(port).toBe(4000);
  });

  test('returns port from config file', async () => {
    const config_path = path.join(tmp_home, '.bduirc');
    fs.writeFileSync(
      config_path,
      JSON.stringify({ defaultPortStart: 5000 }),
      'utf8'
    );

    const port = await getDefaultPortStart();
    expect(port).toBe(5000);
  });

  test('ENV takes precedence over config file', async () => {
    // Create config file
    const config_path = path.join(tmp_home, '.bduirc');
    fs.writeFileSync(
      config_path,
      JSON.stringify({ defaultPortStart: 5000 }),
      'utf8'
    );

    // Set env var
    process.env.BDUI_DEFAULT_PORT_START = '6000';

    const port = await getDefaultPortStart();
    expect(port).toBe(6000);
  });

  test('falls back to default when env var is invalid', async () => {
    process.env.BDUI_DEFAULT_PORT_START = 'not-a-number';

    const port = await getDefaultPortStart();
    expect(port).toBe(4000);
  });

  test('falls back to default when config value is invalid', async () => {
    const config_path = path.join(tmp_home, '.bduirc');
    fs.writeFileSync(
      config_path,
      JSON.stringify({ defaultPortStart: 'invalid' }),
      'utf8'
    );

    const port = await getDefaultPortStart();
    expect(port).toBe(4000);
  });

  test('handles negative port numbers gracefully', async () => {
    process.env.BDUI_DEFAULT_PORT_START = '-1';

    const port = await getDefaultPortStart();
    expect(port).toBe(4000);
  });

  test('handles zero port number gracefully', async () => {
    const config_path = path.join(tmp_home, '.bduirc');
    fs.writeFileSync(
      config_path,
      JSON.stringify({ defaultPortStart: 0 }),
      'utf8'
    );

    const port = await getDefaultPortStart();
    expect(port).toBe(4000);
  });
});

describe('config precedence', () => {
  test('CLI args > ENV > config file > defaults (integration)', async () => {
    // This test demonstrates the intended precedence chain
    // 1. Config file provides base
    const config_path = path.join(tmp_home, '.bduirc');
    fs.writeFileSync(
      config_path,
      JSON.stringify({
        discoveryPaths: ['~/from-config'],
        defaultPortStart: 5000
      }),
      'utf8'
    );

    // 2. ENV overrides config file
    process.env.BDUI_DISCOVERY_PATHS = '~/from-env';
    process.env.BDUI_DEFAULT_PORT_START = '6000';

    const paths = await getDiscoveryPaths();
    const port = await getDefaultPortStart();

    expect(paths).toEqual([path.join(tmp_home, 'from-env')]);
    expect(port).toBe(6000);

    // 3. CLI args would override ENV (tested in commands tests)
  });
});
