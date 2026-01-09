import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as daemon from './daemon.js';
import {
  cleanStaleInstances,
  findInstanceByPort,
  findInstanceByWorkspace,
  getRegistryPath,
  readInstanceRegistry,
  registerInstance,
  unregisterInstance,
  writeInstanceRegistry
} from './instance-registry.js';

describe('getRegistryPath', () => {
  test('returns path in home directory', () => {
    const registry_path = getRegistryPath();
    const home_dir = os.homedir();
    expect(registry_path).toBe(
      path.join(home_dir, '.beads-ui', 'instances.json')
    );
  });
});

describe('readInstanceRegistry', () => {
  /** @type {string} */
  let temp_dir;
  /** @type {string} */
  let original_home;

  beforeEach(() => {
    temp_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beads-test-'));
    original_home = process.env.HOME || '';
    process.env.HOME = temp_dir;
  });

  afterEach(() => {
    process.env.HOME = original_home;
    if (temp_dir && fs.existsSync(temp_dir)) {
      fs.rmSync(temp_dir, { recursive: true, force: true });
    }
  });

  test('returns empty array when file does not exist', () => {
    const instances = readInstanceRegistry();
    expect(instances).toEqual([]);
  });

  test('returns parsed data when file contains valid JSON', () => {
    const registry_path = getRegistryPath();
    const test_data = [
      { workspace: '/test/workspace', port: 3000, pid: 12345 }
    ];
    fs.writeFileSync(registry_path, JSON.stringify(test_data), 'utf8');

    const instances = readInstanceRegistry();
    expect(instances).toEqual(test_data);
  });

  test('returns empty array when file contains corrupted JSON', () => {
    const registry_path = getRegistryPath();
    fs.writeFileSync(registry_path, 'not valid json', 'utf8');

    const instances = readInstanceRegistry();
    expect(instances).toEqual([]);
  });

  test('returns empty array when file contains non-array JSON', () => {
    const registry_path = getRegistryPath();
    fs.writeFileSync(registry_path, '{"foo": "bar"}', 'utf8');

    const instances = readInstanceRegistry();
    expect(instances).toEqual([]);
  });
});

describe('writeInstanceRegistry', () => {
  /** @type {string} */
  let temp_dir;
  /** @type {string} */
  let original_home;

  beforeEach(() => {
    temp_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beads-test-'));
    original_home = process.env.HOME || '';
    process.env.HOME = temp_dir;
  });

  afterEach(() => {
    process.env.HOME = original_home;
    if (temp_dir && fs.existsSync(temp_dir)) {
      fs.rmSync(temp_dir, { recursive: true, force: true });
    }
  });

  test('creates file with correct structure', () => {
    const test_data = [
      { workspace: '/test/workspace', port: 3000, pid: 12345 }
    ];
    writeInstanceRegistry(test_data);

    const registry_path = getRegistryPath();
    const content = fs.readFileSync(registry_path, 'utf8');
    const parsed = JSON.parse(content);
    expect(parsed).toEqual(test_data);
  });

  test('overwrites existing file', () => {
    const first_data = [
      { workspace: '/test/workspace1', port: 3000, pid: 11111 }
    ];
    const second_data = [
      { workspace: '/test/workspace2', port: 3001, pid: 22222 }
    ];

    writeInstanceRegistry(first_data);
    writeInstanceRegistry(second_data);

    const instances = readInstanceRegistry();
    expect(instances).toEqual(second_data);
  });
});

describe('registerInstance', () => {
  /** @type {string} */
  let temp_dir;
  /** @type {string} */
  let original_home;

  beforeEach(() => {
    temp_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beads-test-'));
    original_home = process.env.HOME || '';
    process.env.HOME = temp_dir;
  });

  afterEach(() => {
    process.env.HOME = original_home;
    if (temp_dir && fs.existsSync(temp_dir)) {
      fs.rmSync(temp_dir, { recursive: true, force: true });
    }
  });

  test('adds new entry to empty registry', () => {
    registerInstance({ workspace: '/test/workspace', port: 3000, pid: 12345 });

    const instances = readInstanceRegistry();
    expect(instances).toHaveLength(1);
    expect(instances[0]).toEqual({
      workspace: '/test/workspace',
      port: 3000,
      pid: 12345
    });
  });

  test('updates existing entry with same port', () => {
    registerInstance({ workspace: '/test/workspace1', port: 3000, pid: 11111 });
    registerInstance({ workspace: '/test/workspace2', port: 3000, pid: 22222 });

    const instances = readInstanceRegistry();
    expect(instances).toHaveLength(1);
    expect(instances[0]).toEqual({
      workspace: '/test/workspace2',
      port: 3000,
      pid: 22222
    });
  });

  test('adds multiple entries with different ports', () => {
    registerInstance({ workspace: '/test/workspace1', port: 3000, pid: 11111 });
    registerInstance({ workspace: '/test/workspace2', port: 3001, pid: 22222 });

    const instances = readInstanceRegistry();
    expect(instances).toHaveLength(2);
  });
});

describe('unregisterInstance', () => {
  /** @type {string} */
  let temp_dir;
  /** @type {string} */
  let original_home;

  beforeEach(() => {
    temp_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beads-test-'));
    original_home = process.env.HOME || '';
    process.env.HOME = temp_dir;
  });

  afterEach(() => {
    process.env.HOME = original_home;
    if (temp_dir && fs.existsSync(temp_dir)) {
      fs.rmSync(temp_dir, { recursive: true, force: true });
    }
  });

  test('removes entry by port', () => {
    registerInstance({ workspace: '/test/workspace1', port: 3000, pid: 11111 });
    registerInstance({ workspace: '/test/workspace2', port: 3001, pid: 22222 });

    unregisterInstance(3000);

    const instances = readInstanceRegistry();
    expect(instances).toHaveLength(1);
    expect(instances[0].port).toBe(3001);
  });

  test('does nothing when port not found', () => {
    registerInstance({ workspace: '/test/workspace', port: 3000, pid: 11111 });

    unregisterInstance(9999);

    const instances = readInstanceRegistry();
    expect(instances).toHaveLength(1);
  });
});

describe('findInstanceByWorkspace', () => {
  /** @type {string} */
  let temp_dir;
  /** @type {string} */
  let original_home;

  beforeEach(() => {
    temp_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beads-test-'));
    original_home = process.env.HOME || '';
    process.env.HOME = temp_dir;
  });

  afterEach(() => {
    process.env.HOME = original_home;
    if (temp_dir && fs.existsSync(temp_dir)) {
      fs.rmSync(temp_dir, { recursive: true, force: true });
    }
  });

  test('finds exact match', () => {
    registerInstance({ workspace: '/test/workspace', port: 3000, pid: 11111 });

    const found = findInstanceByWorkspace('/test/workspace');
    expect(found).not.toBeNull();
    expect(found?.port).toBe(3000);
  });

  test('finds parent workspace match', () => {
    registerInstance({ workspace: '/test/workspace', port: 3000, pid: 11111 });

    const found = findInstanceByWorkspace('/test/workspace/subdir');
    expect(found).not.toBeNull();
    expect(found?.port).toBe(3000);
  });

  test('returns null when not found', () => {
    registerInstance({ workspace: '/test/workspace', port: 3000, pid: 11111 });

    const found = findInstanceByWorkspace('/other/workspace');
    expect(found).toBeNull();
  });
});

describe('findInstanceByPort', () => {
  /** @type {string} */
  let temp_dir;
  /** @type {string} */
  let original_home;

  beforeEach(() => {
    temp_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beads-test-'));
    original_home = process.env.HOME || '';
    process.env.HOME = temp_dir;
  });

  afterEach(() => {
    process.env.HOME = original_home;
    if (temp_dir && fs.existsSync(temp_dir)) {
      fs.rmSync(temp_dir, { recursive: true, force: true });
    }
  });

  test('finds instance by port', () => {
    registerInstance({ workspace: '/test/workspace', port: 3000, pid: 11111 });

    const found = findInstanceByPort(3000);
    expect(found).not.toBeNull();
    expect(found?.workspace).toBe('/test/workspace');
  });

  test('returns null when port not found', () => {
    registerInstance({ workspace: '/test/workspace', port: 3000, pid: 11111 });

    const found = findInstanceByPort(9999);
    expect(found).toBeNull();
  });
});

describe('cleanStaleInstances', () => {
  /** @type {string} */
  let temp_dir;
  /** @type {string} */
  let original_home;

  beforeEach(() => {
    temp_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beads-test-'));
    original_home = process.env.HOME || '';
    process.env.HOME = temp_dir;
  });

  afterEach(() => {
    process.env.HOME = original_home;
    if (temp_dir && fs.existsSync(temp_dir)) {
      fs.rmSync(temp_dir, { recursive: true, force: true });
    }
  });

  test('removes entries for dead processes', () => {
    registerInstance({ workspace: '/test/workspace1', port: 3000, pid: 99999 });
    registerInstance({
      workspace: '/test/workspace2',
      port: 3001,
      pid: process.pid
    });

    vi.spyOn(daemon, 'isProcessRunning')
      .mockReturnValueOnce(false) // First instance is dead
      .mockReturnValueOnce(true); // Second instance is alive

    cleanStaleInstances();

    const instances = readInstanceRegistry();
    expect(instances).toHaveLength(1);
    expect(instances[0].port).toBe(3001);
  });

  test('keeps all entries when all processes are alive', () => {
    registerInstance({ workspace: '/test/workspace1', port: 3000, pid: 11111 });
    registerInstance({ workspace: '/test/workspace2', port: 3001, pid: 22222 });

    vi.spyOn(daemon, 'isProcessRunning').mockReturnValue(true);

    cleanStaleInstances();

    const instances = readInstanceRegistry();
    expect(instances).toHaveLength(2);
  });
});
