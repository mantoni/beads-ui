import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  cleanRegistry,
  getAllInstances,
  markInstanceStopped,
  readRegistry,
  registerInstance,
  unregisterInstance,
  unregisterInstanceByPath
} from './registry.js';

/** @type {string} */
let tmp_home;
/** @type {string | undefined} */
let prev_home;

beforeEach(() => {
  // Create temp home directory for registry
  tmp_home = fs.mkdtempSync(path.join(os.tmpdir(), 'bdui-test-'));
  prev_home = process.env.HOME;
  process.env.HOME = tmp_home;
});

afterEach(() => {
  // Restore original HOME
  process.env.HOME = prev_home;
  // Clean up temp directory
  try {
    fs.rmSync(tmp_home, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe('registry', () => {
  describe('readRegistry', () => {
    test('returns empty object when registry file does not exist', () => {
      const registry = readRegistry();
      expect(registry).toEqual({});
    });

    test('returns parsed registry when file exists', () => {
      const registry_path = path.join(tmp_home, '.bdui', 'instances.json');
      fs.mkdirSync(path.dirname(registry_path), { recursive: true });
      const test_data = {
        project1: {
          path: '/test/project1',
          port: 4000,
          pid: 12345,
          started_at: '2026-01-21T10:00:00Z'
        }
      };
      fs.writeFileSync(registry_path, JSON.stringify(test_data), 'utf8');

      const registry = readRegistry();
      expect(registry).toEqual(test_data);
    });

    test('handles malformed JSON gracefully', () => {
      const registry_path = path.join(tmp_home, '.bdui', 'instances.json');
      fs.mkdirSync(path.dirname(registry_path), { recursive: true });
      fs.writeFileSync(registry_path, '{invalid json}', 'utf8');

      const registry = readRegistry();
      expect(registry).toEqual({});
    });
  });

  describe('registerInstance', () => {
    test('creates registry file and adds instance', () => {
      registerInstance({
        project_path: '/test/my-project',
        port: 4000,
        pid: 99999
      });

      const registry = readRegistry();
      expect(registry['my-project']).toBeDefined();
      expect(registry['my-project'].path).toBe('/test/my-project');
      expect(registry['my-project'].port).toBe(4000);
      expect(registry['my-project'].pid).toBe(99999);
      expect(registry['my-project'].started_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test('creates .bdui directory if missing', () => {
      const bdui_dir = path.join(tmp_home, '.bdui');
      expect(fs.existsSync(bdui_dir)).toBe(false);

      registerInstance({
        project_path: '/test/project',
        port: 4000,
        pid: 1111
      });

      expect(fs.existsSync(bdui_dir)).toBe(true);
      const stats = fs.statSync(bdui_dir);
      expect(stats.isDirectory()).toBe(true);
    });

    test('updates existing instance', () => {
      registerInstance({
        project_path: '/test/my-project',
        port: 4000,
        pid: 1111
      });

      registerInstance({
        project_path: '/test/my-project',
        port: 4001,
        pid: 2222
      });

      const registry = readRegistry();
      expect(Object.keys(registry)).toHaveLength(1);
      expect(registry['my-project'].port).toBe(4001);
      expect(registry['my-project'].pid).toBe(2222);
    });

    test('extracts project name from path', () => {
      registerInstance({
        project_path: '/very/long/path/to/my-awesome-project',
        port: 4000,
        pid: 5555
      });

      const registry = readRegistry();
      expect(registry['my-awesome-project']).toBeDefined();
    });
  });

  describe('unregisterInstance', () => {
    test('removes instance by project name', () => {
      registerInstance({
        project_path: '/test/project1',
        port: 4000,
        pid: 1111
      });
      registerInstance({
        project_path: '/test/project2',
        port: 4001,
        pid: 2222
      });

      unregisterInstance('project1');

      const registry = readRegistry();
      expect(registry['project1']).toBeUndefined();
      expect(registry['project2']).toBeDefined();
    });

    test('handles non-existent instance gracefully', () => {
      unregisterInstance('does-not-exist');

      const registry = readRegistry();
      expect(registry).toEqual({});
    });
  });

  describe('unregisterInstanceByPath', () => {
    test('removes instance by full path', () => {
      registerInstance({
        project_path: '/test/my-project',
        port: 4000,
        pid: 1111
      });

      unregisterInstanceByPath('/test/my-project');

      const registry = readRegistry();
      expect(registry['my-project']).toBeUndefined();
    });

    test('extracts project name correctly', () => {
      registerInstance({
        project_path: '/long/path/to/project',
        port: 4000,
        pid: 1111
      });

      unregisterInstanceByPath('/long/path/to/project');

      const registry = readRegistry();
      expect(registry['project']).toBeUndefined();
    });
  });

  describe('getAllInstances', () => {
    test('returns empty array when no instances', () => {
      const instances = getAllInstances();
      expect(instances).toEqual([]);
    });

    test('returns all instances with running status', () => {
      // Use current process PID (guaranteed to be running)
      const running_pid = process.pid;

      registerInstance({
        project_path: '/test/project1',
        port: 4000,
        pid: running_pid
      });
      registerInstance({
        project_path: '/test/project2',
        port: 4001,
        pid: 99999 // unlikely to exist
      });

      const instances = getAllInstances();

      expect(instances).toHaveLength(2);
      expect(instances[0].project).toBe('project1');
      expect(instances[0].running).toBe(true);
      expect(instances[1].project).toBe('project2');
      expect(instances[1].running).toBe(false);
    });

    test('includes all instance metadata', () => {
      registerInstance({
        project_path: '/test/my-project',
        port: 4000,
        pid: process.pid
      });

      const instances = getAllInstances();

      expect(instances[0]).toMatchObject({
        project: 'my-project',
        path: '/test/my-project',
        port: 4000,
        pid: process.pid,
        running: true
      });
      expect(instances[0].started_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('cleanRegistry', () => {
    test('removes entries with invalid PIDs', () => {
      const registry_path = path.join(tmp_home, '.bdui', 'instances.json');
      fs.mkdirSync(path.dirname(registry_path), { recursive: true });

      const test_data = {
        project1: { path: '/test/project1', port: 4000, pid: 0 }, // invalid
        project2: { path: '/test/project2', port: 4001, pid: -1 }, // invalid
        project3: {
          path: '/test/project3',
          port: 4002,
          pid: process.pid
        } // valid
      };
      fs.writeFileSync(registry_path, JSON.stringify(test_data), 'utf8');

      const removed = cleanRegistry();

      expect(removed).toBe(2);
      const registry = readRegistry();
      expect(Object.keys(registry)).toHaveLength(1);
      expect(registry['project3']).toBeDefined();
    });

    test('returns 0 when no entries removed', () => {
      registerInstance({
        project_path: '/test/project',
        port: 4000,
        pid: process.pid
      });

      const removed = cleanRegistry();

      expect(removed).toBe(0);
      const registry = readRegistry();
      expect(Object.keys(registry)).toHaveLength(1);
    });

    test('handles empty registry gracefully', () => {
      const removed = cleanRegistry();

      expect(removed).toBe(0);
      const registry = readRegistry();
      expect(registry).toEqual({});
    });
  });

  describe('markInstanceStopped', () => {
    test('adds stopped_at timestamp without removing entry', () => {
      registerInstance({
        project_path: '/test/my-project',
        port: 4000,
        pid: 1111
      });

      markInstanceStopped('/test/my-project');

      const registry = readRegistry();
      expect(registry['my-project']).toBeDefined();
      expect(registry['my-project'].stopped_at).toBeDefined();
      expect(registry['my-project'].stopped_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(registry['my-project'].port).toBe(4000); // preserved
      expect(registry['my-project'].path).toBe('/test/my-project'); // preserved
    });

    test('handles non-existent instance gracefully', () => {
      markInstanceStopped('/test/does-not-exist');

      const registry = readRegistry();
      expect(registry).toEqual({});
    });

    test('allows restart-all to use stopped instance metadata', () => {
      registerInstance({
        project_path: '/test/project',
        port: 4000,
        pid: 1111
      });
      markInstanceStopped('/test/project');

      const registry = readRegistry();
      expect(registry['project'].port).toBe(4000); // port preserved for restart
      expect(registry['project'].path).toBe('/test/project'); // path preserved
    });
  });
});
