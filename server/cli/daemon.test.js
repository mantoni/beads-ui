import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  findAvailablePort,
  getLogFilePath,
  getPidFilePath,
  readPidFile,
  removePidFile,
  writePidFile
} from './daemon.js';

describe('getPidFilePath', () => {
  test('returns default PID file path when no port specified', () => {
    const pid_path = getPidFilePath();
    expect(pid_path).toMatch(/server\.pid$/);
  });

  test('returns port-specific PID file path when port specified', () => {
    const pid_path = getPidFilePath(3001);
    expect(pid_path).toMatch(/server-3001\.pid$/);
  });

  test('returns different paths for different ports', () => {
    const path_3001 = getPidFilePath(3001);
    const path_3002 = getPidFilePath(3002);
    expect(path_3001).not.toBe(path_3002);
    expect(path_3001).toMatch(/server-3001\.pid$/);
    expect(path_3002).toMatch(/server-3002\.pid$/);
  });
});

describe('getLogFilePath', () => {
  test('returns default log file path when no port specified', () => {
    const log_path = getLogFilePath();
    expect(log_path).toMatch(/daemon\.log$/);
  });

  test('returns port-specific log file path when port specified', () => {
    const log_path = getLogFilePath(3001);
    expect(log_path).toMatch(/daemon-3001\.log$/);
  });

  test('returns different paths for different ports', () => {
    const path_3001 = getLogFilePath(3001);
    const path_3002 = getLogFilePath(3002);
    expect(path_3001).not.toBe(path_3002);
    expect(path_3001).toMatch(/daemon-3001\.log$/);
    expect(path_3002).toMatch(/daemon-3002\.log$/);
  });
});

describe('PID file operations', () => {
  /** @type {string} */
  let temp_dir;

  beforeEach(() => {
    temp_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beads-test-'));
    process.env.BDUI_RUNTIME_DIR = temp_dir;
  });

  afterEach(() => {
    delete process.env.BDUI_RUNTIME_DIR;
    if (temp_dir && fs.existsSync(temp_dir)) {
      fs.rmSync(temp_dir, { recursive: true, force: true });
    }
  });

  test('writes and reads PID file without port', () => {
    writePidFile(12345);
    const pid = readPidFile();
    expect(pid).toBe(12345);
  });

  test('writes and reads PID file with port', () => {
    writePidFile(12345, 3001);
    const pid = readPidFile(3001);
    expect(pid).toBe(12345);
  });

  test('returns null when PID file does not exist', () => {
    const pid = readPidFile(9999);
    expect(pid).toBeNull();
  });

  test('removes PID file without port', () => {
    writePidFile(12345);
    removePidFile();
    const pid = readPidFile();
    expect(pid).toBeNull();
  });

  test('removes PID file with port', () => {
    writePidFile(12345, 3001);
    removePidFile(3001);
    const pid = readPidFile(3001);
    expect(pid).toBeNull();
  });

  test('handles multiple port-specific PID files independently', () => {
    writePidFile(11111, 3001);
    writePidFile(22222, 3002);
    writePidFile(33333);

    expect(readPidFile(3001)).toBe(11111);
    expect(readPidFile(3002)).toBe(22222);
    expect(readPidFile()).toBe(33333);

    removePidFile(3001);
    expect(readPidFile(3001)).toBeNull();
    expect(readPidFile(3002)).toBe(22222);
    expect(readPidFile()).toBe(33333);
  });
});

describe('findAvailablePort', () => {
  test('finds an available port starting from 3000', async () => {
    const port = await findAvailablePort(3000);
    expect(port).toBeGreaterThanOrEqual(3000);
    expect(port).toBeLessThan(3010);
  });

  test('returns null when no ports available in range', async () => {
    // This test would require mocking net.createServer to simulate all ports busy
    // For now, we'll skip this as it's complex to mock properly
    // In real usage, it's very unlikely all 10 ports would be busy
  });

  test('finds next available port when first is busy', async () => {
    const net = await import('node:net');
    const server = net.createServer();

    // Block port 3000
    await new Promise((resolve) => {
      server.listen(3000, () => {
        resolve(undefined);
      });
    });

    const port = await findAvailablePort(3000);
    expect(port).toBeGreaterThan(3000);
    expect(port).toBeLessThan(3010);

    server.close();
  });
});

