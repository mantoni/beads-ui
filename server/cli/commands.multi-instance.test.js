import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { handleList, handleRestartAll, handleStopAll } from './commands.js';
import { handleDiscover } from './discover.js';
import * as registry from './registry.js';

// Mock daemon to avoid actual process operations
vi.mock('./daemon.js', () => ({
  terminateProcess: vi.fn().mockResolvedValue(true),
  isProcessRunning: vi.fn().mockReturnValue(false),
  readPidFile: vi.fn().mockReturnValue(null),
  removePidFile: vi.fn(),
  startDaemon: vi.fn(),
  printServerUrl: vi.fn()
}));

// Mock child_process.spawn to avoid spawning real processes
vi.mock('node:child_process', () => ({
  spawn: vi.fn().mockReturnValue({
    pid: 12345,
    unref: vi.fn(),
    on: vi.fn()
  })
}));

/** @type {string} */
let tmp_home;
/** @type {string} */
let prev_home;
/** @type {string} */
let tmp_projects;

beforeEach(() => {
  // Mock console methods
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});

  // Create temp home for registry
  tmp_home = fs.mkdtempSync(path.join(os.tmpdir(), 'bdui-home-'));
  prev_home = process.env.HOME;
  process.env.HOME = tmp_home;

  // Create temp projects directory
  tmp_projects = fs.mkdtempSync(path.join(os.tmpdir(), 'bdui-projects-'));
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env.HOME = prev_home;

  try {
    fs.rmSync(tmp_home, { recursive: true, force: true });
  } catch {
    // ignore
  }
  try {
    fs.rmSync(tmp_projects, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe('handleList', () => {
  test('returns 0 when no instances', async () => {
    const code = await handleList();

    expect(code).toBe(0);
    expect(console.log).toHaveBeenCalledWith('No beads-ui instances running.');
  });

  test('shows all instances with status', async () => {
    // Register test instances
    registry.registerInstance({
      project_path: '/test/project1',
      port: 4000,
      pid: process.pid // running
    });
    registry.registerInstance({
      project_path: '/test/project2',
      port: 4001,
      pid: 99999 // not running
    });

    const code = await handleList();

    expect(code).toBe(0);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Running beads-ui instances (2)')
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('✓ project1')
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('✗ project2')
    );
  });

  test('shows instance details including port, PID, and path', async () => {
    registry.registerInstance({
      project_path: '/test/my-project',
      port: 4000,
      pid: process.pid
    });

    await handleList();

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Port: 4000')
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('PID:  ' + process.pid)
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Path: /test/my-project')
    );
  });

  test('shows uptime for running instances', async () => {
    registry.registerInstance({
      project_path: '/test/running-project',
      port: 4000,
      pid: process.pid
    });

    await handleList();

    // Should show (started <timestamp>) for running instances
    expect(console.log).toHaveBeenCalledWith(
      expect.stringMatching(/started.*\d{1,2}\/\d{1,2}\/\d{4}/)
    );
  });

  test('shows (stopped) for non-running instances', async () => {
    registry.registerInstance({
      project_path: '/test/stopped-project',
      port: 4001,
      pid: 99999 // not running
    });

    await handleList();

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('(stopped)')
    );
  });

  test('cleans stale entries before listing', async () => {
    const clean_spy = vi.spyOn(registry, 'cleanRegistry');

    await handleList();

    expect(clean_spy).toHaveBeenCalled();
  });

  test('shows cleanup message when stale entries removed', async () => {
    vi.spyOn(registry, 'cleanRegistry').mockReturnValue(2);

    await handleList();

    expect(console.log).toHaveBeenCalledWith('Cleaned 2 stale instance(s)');
  });
});

describe('handleStopAll', () => {
  test('returns 0 when no running instances', async () => {
    const code = await handleStopAll();

    expect(code).toBe(0);
    expect(console.log).toHaveBeenCalledWith('No running instances to stop.');
  });

  test('skips stopped instances', async () => {
    registry.registerInstance({
      project_path: '/test/stopped-project',
      port: 4000,
      pid: 99999 // not running
    });

    const code = await handleStopAll();

    expect(code).toBe(0);
    expect(console.log).toHaveBeenCalledWith('No running instances to stop.');
  });

  test('stops running instance and shows success', async () => {
    const daemon = await import('./daemon.js');
    vi.spyOn(daemon, 'terminateProcess').mockResolvedValue(true);

    registry.registerInstance({
      project_path: '/test/project1',
      port: 4000,
      pid: process.pid
    });

    await handleStopAll();

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Stopping project1 (PID ' + process.pid + ')')
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('✓ Stopped')
    );
  });

  test('shows failure when terminate fails', async () => {
    const daemon = await import('./daemon.js');
    vi.spyOn(daemon, 'terminateProcess').mockResolvedValue(false);

    registry.registerInstance({
      project_path: '/test/stubborn-project',
      port: 4000,
      pid: process.pid
    });

    const code = await handleStopAll();

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('✗ Failed to stop')
    );
    expect(code).toBe(1); // Returns 1 if any failed
  });

  test('shows summary with counts', async () => {
    const daemon = await import('./daemon.js');
    vi.spyOn(daemon, 'terminateProcess').mockResolvedValue(true);

    registry.registerInstance({
      project_path: '/test/project1',
      port: 4000,
      pid: process.pid
    });

    await handleStopAll();

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Stopping 1 instance(s)')
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringMatching(/Stopped:\s*1.*Failed:\s*0/)
    );
  });

  test('handles mixed success and failure', async () => {
    const daemon = await import('./daemon.js');
    let call_count = 0;
    vi.spyOn(daemon, 'terminateProcess').mockImplementation(async () => {
      call_count++;
      return call_count === 1; // First succeeds, second fails
    });

    registry.registerInstance({
      project_path: '/test/project1',
      port: 4000,
      pid: process.pid
    });
    registry.registerInstance({
      project_path: '/test/project2',
      port: 4001,
      pid: process.pid
    });

    const code = await handleStopAll();

    expect(console.log).toHaveBeenCalledWith(
      expect.stringMatching(/Stopped:\s*1.*Failed:\s*1/)
    );
    expect(code).toBe(1); // Returns 1 if any failed
  });

  test('cleans registry after stopping', async () => {
    const clean_spy = vi.spyOn(registry, 'cleanRegistry');
    const daemon = await import('./daemon.js');
    vi.spyOn(daemon, 'terminateProcess').mockResolvedValue(true);

    registry.registerInstance({
      project_path: '/test/project',
      port: 4000,
      pid: process.pid
    });

    await handleStopAll();

    expect(clean_spy).toHaveBeenCalled();
  });
});

describe('handleRestartAll', () => {
  test('returns 0 when no instances in registry', async () => {
    const code = await handleRestartAll();

    expect(code).toBe(0);
    expect(console.log).toHaveBeenCalledWith('No instances in registry.');
  });

  test('shows helpful message when registry empty', async () => {
    await handleRestartAll();

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('bdui discover')
    );
  });

  test('attempts restart for registered instance', async () => {
    registry.registerInstance({
      project_path: '/test/project1',
      port: 4000,
      pid: 99999 // not running, so no need to stop first
    });

    await handleRestartAll();

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Restarting project1 on port 4000')
    );
  });

  test('stops running instance before restarting', async () => {
    const daemon = await import('./daemon.js');
    const terminate_spy = vi.spyOn(daemon, 'terminateProcess');

    registry.registerInstance({
      project_path: '/test/running-project',
      port: 4000,
      pid: process.pid // running
    });

    await handleRestartAll();

    // Should attempt to stop the running instance first
    expect(terminate_spy).toHaveBeenCalledWith(process.pid, 5000);
  });

  test('shows warning when stop fails during restart', async () => {
    const daemon = await import('./daemon.js');
    vi.spyOn(daemon, 'terminateProcess').mockResolvedValue(false);

    registry.registerInstance({
      project_path: '/test/project',
      port: 4000,
      pid: process.pid
    });

    await handleRestartAll();

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('⚠ Warning: Failed to stop old instance')
    );
  });

  test('shows success when restart succeeds', async () => {
    const cp = await import('node:child_process');
    const spawn_mock = vi.mocked(cp.spawn);
    spawn_mock.mockReturnValue({
      pid: 77777,
      unref: vi.fn(),
      on: vi.fn()
    });

    registry.registerInstance({
      project_path: '/test/project1',
      port: 4000,
      pid: 99999
    });

    await handleRestartAll();

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('✓ Restarted (PID 77777)')
    );
  });

  test('shows failure when spawn fails', async () => {
    const cp = await import('node:child_process');
    const spawn_mock = vi.mocked(cp.spawn);
    spawn_mock.mockReturnValue({
      pid: undefined, // spawn failed
      unref: vi.fn(),
      on: vi.fn()
    });

    registry.registerInstance({
      project_path: '/test/project1',
      port: 4000,
      pid: 99999
    });

    await handleRestartAll();

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('✗ Failed to start')
    );
  });

  test('shows final summary with restart counts', async () => {
    const cp = await import('node:child_process');
    const spawn_mock = vi.mocked(cp.spawn);
    let call_count = 0;
    spawn_mock.mockImplementation(() => {
      call_count++;
      return {
        pid: call_count === 1 ? 12345 : undefined, // First succeeds, second fails
        unref: vi.fn(),
        on: vi.fn()
      };
    });

    registry.registerInstance({
      project_path: '/test/project1',
      port: 4000,
      pid: 99999
    });
    registry.registerInstance({
      project_path: '/test/project2',
      port: 4001,
      pid: 99998
    });

    const code = await handleRestartAll();

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Restarting 2 instance(s)')
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringMatching(/Restarted:\s*1.*Failed:\s*1/)
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('View instances: bdui list')
    );
    expect(code).toBe(1); // Returns 1 if any failed
  });

  test('returns 0 when all restarts succeed', async () => {
    const cp = await import('node:child_process');
    const spawn_mock = vi.mocked(cp.spawn);
    spawn_mock.mockReturnValue({
      pid: 55555,
      unref: vi.fn(),
      on: vi.fn()
    });

    registry.registerInstance({
      project_path: '/test/project1',
      port: 4000,
      pid: 99999
    });

    const code = await handleRestartAll();

    expect(code).toBe(0); // Returns 0 if all succeeded
  });
});

describe('handleDiscover (commands integration)', () => {
  test('discovers beads projects in explicit path', async () => {
    fs.mkdirSync(path.join(tmp_projects, 'proj1', '.beads'), {
      recursive: true
    });
    fs.mkdirSync(path.join(tmp_projects, 'proj2', '.beads'), {
      recursive: true
    });

    const code = await handleDiscover([tmp_projects]);

    expect(code).toBe(0);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Found 2 project(s)')
    );
  });

  test('returns 1 when no paths provided and none configured', async () => {
    const code = await handleDiscover([]);

    expect(code).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('No search paths provided and none configured')
    );
  });

  test('returns 0 when no projects found in path', async () => {
    const code = await handleDiscover([tmp_projects]);

    expect(code).toBe(0);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('No beads projects found')
    );
  });
});
