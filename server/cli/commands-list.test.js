import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { handleList } from './commands.js';
import * as daemon from './daemon.js';
import * as registry from './instance-registry.js';

describe('handleList command', () => {
  /** @type {any} */
  let console_log_spy;

  beforeEach(() => {
    console_log_spy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    console_log_spy.mockRestore();
    vi.restoreAllMocks();
  });

  test('shows no instances when nothing is running', async () => {
    vi.spyOn(registry, 'readInstanceRegistry').mockReturnValue([]);
    vi.spyOn(daemon, 'readPidFile').mockReturnValue(null);

    const code = await handleList();

    expect(code).toBe(0);
    expect(console_log_spy).toHaveBeenCalledWith('No instances running');
  });

  test('shows global instance when running', async () => {
    vi.spyOn(registry, 'readInstanceRegistry').mockReturnValue([]);
    vi.spyOn(daemon, 'readPidFile').mockReturnValue(1234);
    vi.spyOn(daemon, 'isProcessRunning').mockReturnValue(true);

    const code = await handleList();

    expect(code).toBe(0);
    const output = console_log_spy.mock.calls
      .map((/** @type {any[]} */ call) => call[0])
      .join('\n');
    expect(output).toContain('global');
    expect(output).toContain('1234');
  });

  test('shows workspace instances', async () => {
    vi.spyOn(registry, 'readInstanceRegistry').mockReturnValue([
      { workspace: '/home/user/project-a', port: 3001, pid: 5678 },
      { workspace: '/home/user/project-b', port: 3002, pid: 5679 }
    ]);
    vi.spyOn(daemon, 'readPidFile').mockReturnValue(null);
    vi.spyOn(daemon, 'isProcessRunning').mockReturnValue(true);

    const code = await handleList();

    expect(code).toBe(0);
    const output = console_log_spy.mock.calls
      .map((/** @type {any[]} */ call) => call[0])
      .join('\n');
    expect(output).toContain('workspace');
    expect(output).toContain('3001');
    expect(output).toContain('5678');
    expect(output).toContain('3002');
    expect(output).toContain('5679');
  });

  test('shows both global and workspace instances', async () => {
    vi.spyOn(registry, 'readInstanceRegistry').mockReturnValue([
      { workspace: '/home/user/project', port: 3001, pid: 5678 }
    ]);
    vi.spyOn(daemon, 'readPidFile').mockReturnValue(1234);
    vi.spyOn(daemon, 'isProcessRunning').mockReturnValue(true);

    const code = await handleList();

    expect(code).toBe(0);
    const output = console_log_spy.mock.calls
      .map((/** @type {any[]} */ call) => call[0])
      .join('\n');
    expect(output).toContain('global');
    expect(output).toContain('1234');
    expect(output).toContain('workspace');
    expect(output).toContain('3001');
    expect(output).toContain('5678');
  });

  test('shows stale instances with (stale) marker', async () => {
    vi.spyOn(registry, 'readInstanceRegistry').mockReturnValue([
      { workspace: '/home/user/project-a', port: 3001, pid: 5678 },
      { workspace: '/home/user/project-b', port: 3002, pid: 5679 }
    ]);
    vi.spyOn(daemon, 'readPidFile').mockReturnValue(null);
    vi.spyOn(daemon, 'isProcessRunning').mockImplementation((pid) => pid === 5678);

    const code = await handleList();

    expect(code).toBe(0);
    const output = console_log_spy.mock.calls
      .map((/** @type {any[]} */ call) => call[0])
      .join('\n');
    expect(output).toContain('3001');
    expect(output).toContain('5678');
    expect(output).toContain('3002');
    expect(output).toContain('5679');
    expect(output).toContain('(stale)');
  });

  test('does not modify registry (read-only)', async () => {
    const clean_spy = vi.spyOn(registry, 'cleanStaleInstances');
    vi.spyOn(registry, 'readInstanceRegistry').mockReturnValue([]);
    vi.spyOn(daemon, 'readPidFile').mockReturnValue(null);

    await handleList();

    // Should NOT call cleanStaleInstances (read-only operation)
    expect(clean_spy).not.toHaveBeenCalled();
  });
});

