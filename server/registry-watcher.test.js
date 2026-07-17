import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { getRegistryPath } from './registry-watcher.js';

/** @type {string[]} */
const tmps = [];

function mkdtemp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beads-ui-test-'));
  tmps.push(dir);
  return dir;
}

/**
 * @param {string} home
 */
function writeLegacyRegistry(home) {
  fs.mkdirSync(path.join(home, '.beads'));
  fs.writeFileSync(path.join(home, '.beads', 'registry.json'), '[]');
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const d of tmps.splice(0)) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
});

describe('getRegistryPath', () => {
  test('override wins over an existing legacy registry and XDG_DATA_HOME', () => {
    const home = mkdtemp();
    writeLegacyRegistry(home);
    vi.spyOn(os, 'homedir').mockReturnValue(home);

    const result = getRegistryPath({
      env: { BEADS_REGISTRY_DIR: '/custom/dir', XDG_DATA_HOME: '/data' }
    });

    expect(result).toBe(path.join('/custom/dir', 'registry.json'));
  });

  test('prefers legacy ~/.beads over XDG_DATA_HOME when it exists', () => {
    const home = mkdtemp();
    writeLegacyRegistry(home);
    vi.spyOn(os, 'homedir').mockReturnValue(home);

    const result = getRegistryPath({ env: { XDG_DATA_HOME: '/data' } });

    expect(result).toBe(path.join(home, '.beads', 'registry.json'));
  });

  test('uses XDG_DATA_HOME when set and no legacy registry exists', () => {
    const home = mkdtemp();
    vi.spyOn(os, 'homedir').mockReturnValue(home);

    const result = getRegistryPath({ env: { XDG_DATA_HOME: '/data' } });

    expect(result).toBe(path.join('/data', 'beads', 'registry.json'));
  });

  test('ignores a relative XDG_DATA_HOME and falls back to ~/.local/share', () => {
    const home = mkdtemp();
    vi.spyOn(os, 'homedir').mockReturnValue(home);

    const result = getRegistryPath({ env: { XDG_DATA_HOME: 'relative/dir' } });

    expect(result).toBe(
      path.join(home, '.local', 'share', 'beads', 'registry.json')
    );
  });

  test('falls back to ~/.local/share/beads without env or legacy', () => {
    const home = mkdtemp();
    vi.spyOn(os, 'homedir').mockReturnValue(home);

    const result = getRegistryPath({ env: {} });

    expect(result).toBe(
      path.join(home, '.local', 'share', 'beads', 'registry.json')
    );
  });
});
