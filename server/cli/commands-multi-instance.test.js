import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { handleRestart, handleStart, handleStop } from './commands.js';
import * as daemon from './daemon.js';
import * as registry from './instance-registry.js';

// Mock open.js to avoid external effects
vi.mock('./open.js', () => ({
  openUrl: async () => true,
  waitForServer: async () => {},
  registerWorkspaceWithServer: async () => true
}));

// Mock db resolution
vi.mock('../db.js', () => ({
  resolveDbPath: () => ({
    path: '/mock/test.db',
    source: 'nearest',
    exists: false
  })
}));

// Mock config
vi.mock('../config.js', () => ({
  getConfig: () => ({ url: 'http://127.0.0.1:3000' })
}));

describe('Multi-instance support', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleStart with --new-instance flag', () => {
    test('uses port-specific PID file when new_instance is true', async () => {
      vi.spyOn(registry, 'cleanStaleInstances').mockImplementation(() => {});
      vi.spyOn(registry, 'findInstanceByWorkspace').mockReturnValue(null);
      vi.spyOn(registry, 'registerInstance').mockImplementation(() => {});
      const read_pid_spy = vi
        .spyOn(daemon, 'readPidFile')
        .mockReturnValue(null);
      vi.spyOn(daemon, 'isProcessRunning').mockReturnValue(false);
      vi.spyOn(daemon, 'findAvailablePort').mockResolvedValue(3001);
      vi.spyOn(daemon, 'startDaemon').mockReturnValue({ pid: 12345 });
      vi.spyOn(daemon, 'printServerUrl').mockImplementation(() => {});

      await handleStart({ new_instance: true, open: false });

      expect(read_pid_spy).toHaveBeenCalledWith(3001);
    });

    test('uses default PID file when new_instance is false', async () => {
      vi.spyOn(registry, 'cleanStaleInstances').mockImplementation(() => {});
      const read_pid_spy = vi
        .spyOn(daemon, 'readPidFile')
        .mockReturnValue(null);
      vi.spyOn(daemon, 'isProcessRunning').mockReturnValue(false);
      vi.spyOn(daemon, 'startDaemon').mockReturnValue({ pid: 12345 });
      vi.spyOn(daemon, 'printServerUrl').mockImplementation(() => {});

      await handleStart({ new_instance: false, open: false });

      expect(read_pid_spy).toHaveBeenCalledWith(undefined);
    });

    test('starts from port 3001 for new instance when global instance running', async () => {
      vi.spyOn(registry, 'cleanStaleInstances').mockImplementation(() => {});
      vi.spyOn(registry, 'findInstanceByWorkspace').mockReturnValue(null);
      vi.spyOn(registry, 'registerInstance').mockImplementation(() => {});
      vi.spyOn(daemon, 'readPidFile')
        .mockReturnValueOnce(12345) // global instance running
        .mockReturnValueOnce(null); // no instance on port 3001
      vi.spyOn(daemon, 'isProcessRunning').mockReturnValue(true);
      const find_port_spy = vi
        .spyOn(daemon, 'findAvailablePort')
        .mockResolvedValue(3001);
      vi.spyOn(daemon, 'startDaemon').mockReturnValue({ pid: 54321 });
      vi.spyOn(daemon, 'printServerUrl').mockImplementation(() => {});

      await handleStart({ new_instance: true, open: false });

      expect(find_port_spy).toHaveBeenCalledWith(3001);
    });

    test('reuses port from orphaned instance', async () => {
      vi.spyOn(registry, 'cleanStaleInstances').mockImplementation(() => {});
      vi.spyOn(registry, 'findInstanceByWorkspace').mockReturnValue({
        workspace: '/test/workspace',
        port: 3005,
        pid: 99999
      });
      vi.spyOn(registry, 'unregisterInstance').mockImplementation(() => {});
      vi.spyOn(registry, 'registerInstance').mockImplementation(() => {});
      vi.spyOn(daemon, 'readPidFile').mockReturnValue(null);
      vi.spyOn(daemon, 'isProcessRunning').mockReturnValue(false);
      vi.spyOn(daemon, 'removePidFile').mockImplementation(() => {});
      const start_daemon_spy = vi
        .spyOn(daemon, 'startDaemon')
        .mockReturnValue({ pid: 12345 });
      vi.spyOn(daemon, 'printServerUrl').mockImplementation(() => {});

      await handleStart({ new_instance: true, open: false });

      expect(start_daemon_spy).toHaveBeenCalledWith({
        port: 3005,
        host: undefined,
        is_debug: undefined
      });
    });

    test('registers instance in registry when new_instance is true', async () => {
      vi.spyOn(registry, 'cleanStaleInstances').mockImplementation(() => {});
      vi.spyOn(registry, 'findInstanceByWorkspace').mockReturnValue(null);
      const register_spy = vi
        .spyOn(registry, 'registerInstance')
        .mockImplementation(() => {});
      vi.spyOn(daemon, 'readPidFile').mockReturnValue(null);
      vi.spyOn(daemon, 'isProcessRunning').mockReturnValue(false);
      vi.spyOn(daemon, 'findAvailablePort').mockResolvedValue(3001);
      vi.spyOn(daemon, 'startDaemon').mockReturnValue({ pid: 12345 });
      vi.spyOn(daemon, 'printServerUrl').mockImplementation(() => {});

      await handleStart({ new_instance: true, open: false });

      expect(register_spy).toHaveBeenCalledWith({
        workspace: expect.any(String),
        port: 3001,
        pid: 12345
      });
    });

    test('does not register instance when new_instance is false', async () => {
      vi.spyOn(registry, 'cleanStaleInstances').mockImplementation(() => {});
      const register_spy = vi
        .spyOn(registry, 'registerInstance')
        .mockImplementation(() => {});
      vi.spyOn(daemon, 'readPidFile').mockReturnValue(null);
      vi.spyOn(daemon, 'isProcessRunning').mockReturnValue(false);
      vi.spyOn(daemon, 'startDaemon').mockReturnValue({ pid: 12345 });
      vi.spyOn(daemon, 'printServerUrl').mockImplementation(() => {});

      await handleStart({ new_instance: false, open: false });

      expect(register_spy).not.toHaveBeenCalled();
    });

    test('stops existing running instance when starting new instance', async () => {
      vi.spyOn(registry, 'cleanStaleInstances').mockImplementation(() => {});
      vi.spyOn(registry, 'findInstanceByWorkspace').mockReturnValue({
        workspace: '/test/workspace',
        port: 3002,
        pid: 88888
      });
      vi.spyOn(daemon, 'isProcessRunning').mockReturnValue(true);
      const terminate_spy = vi
        .spyOn(daemon, 'terminateProcess')
        .mockResolvedValue(true);
      vi.spyOn(daemon, 'removePidFile').mockImplementation(() => {});
      const unregister_spy = vi
        .spyOn(registry, 'unregisterInstance')
        .mockImplementation(() => {});
      vi.spyOn(registry, 'registerInstance').mockImplementation(() => {});
      vi.spyOn(daemon, 'readPidFile').mockReturnValue(null);
      vi.spyOn(daemon, 'startDaemon').mockReturnValue({ pid: 12345 });
      vi.spyOn(daemon, 'printServerUrl').mockImplementation(() => {});

      await handleStart({ new_instance: true, open: false });

      expect(terminate_spy).toHaveBeenCalledWith(88888, 5000);
      expect(unregister_spy).toHaveBeenCalledWith(3002);
    });

    test('reuses port from stopped instance when no port specified', async () => {
      vi.spyOn(registry, 'cleanStaleInstances').mockImplementation(() => {});
      vi.spyOn(registry, 'findInstanceByWorkspace').mockReturnValue({
        workspace: '/test/workspace',
        port: 3003,
        pid: 77777
      });
      vi.spyOn(daemon, 'isProcessRunning').mockReturnValue(true);
      vi.spyOn(daemon, 'terminateProcess').mockResolvedValue(true);
      vi.spyOn(daemon, 'removePidFile').mockImplementation(() => {});
      vi.spyOn(registry, 'unregisterInstance').mockImplementation(() => {});
      vi.spyOn(registry, 'registerInstance').mockImplementation(() => {});
      vi.spyOn(daemon, 'readPidFile').mockReturnValue(null);
      const start_daemon_spy = vi
        .spyOn(daemon, 'startDaemon')
        .mockReturnValue({ pid: 12345 });
      vi.spyOn(daemon, 'printServerUrl').mockImplementation(() => {});

      await handleStart({ new_instance: true, open: false });

      expect(start_daemon_spy).toHaveBeenCalledWith({
        port: 3003,
        host: undefined,
        is_debug: undefined
      });
    });
  });

  describe('handleStop with workspace detection', () => {
    test('uses port-specific PID file when port specified', async () => {
      vi.spyOn(registry, 'unregisterInstance').mockImplementation(() => {});
      const read_pid_spy = vi
        .spyOn(daemon, 'readPidFile')
        .mockReturnValue(12345);
      vi.spyOn(daemon, 'isProcessRunning').mockReturnValue(true);
      vi.spyOn(daemon, 'terminateProcess').mockResolvedValue(true);
      const remove_pid_spy = vi
        .spyOn(daemon, 'removePidFile')
        .mockImplementation(() => {});

      await handleStop({ port: 3001 });

      expect(read_pid_spy).toHaveBeenCalledWith(3001);
      expect(remove_pid_spy).toHaveBeenCalledWith(3001);
    });

    test('uses default PID file when no port specified', async () => {
      vi.spyOn(registry, 'unregisterInstance').mockImplementation(() => {});
      const read_pid_spy = vi
        .spyOn(daemon, 'readPidFile')
        .mockReturnValue(12345);
      vi.spyOn(daemon, 'isProcessRunning').mockReturnValue(true);
      vi.spyOn(daemon, 'terminateProcess').mockResolvedValue(true);
      const remove_pid_spy = vi
        .spyOn(daemon, 'removePidFile')
        .mockImplementation(() => {});

      await handleStop({});

      expect(read_pid_spy).toHaveBeenCalledWith(undefined);
      expect(remove_pid_spy).toHaveBeenCalledWith(undefined);
    });

    test('unregisters instance from registry when port specified', async () => {
      const unregister_spy = vi
        .spyOn(registry, 'unregisterInstance')
        .mockImplementation(() => {});
      vi.spyOn(daemon, 'readPidFile').mockReturnValue(12345);
      vi.spyOn(daemon, 'isProcessRunning').mockReturnValue(true);
      vi.spyOn(daemon, 'terminateProcess').mockResolvedValue(true);
      vi.spyOn(daemon, 'removePidFile').mockImplementation(() => {});

      await handleStop({ port: 3001 });

      expect(unregister_spy).toHaveBeenCalledWith(3001);
    });

    test('unregisters instance even when process not running (self-healing)', async () => {
      const unregister_spy = vi
        .spyOn(registry, 'unregisterInstance')
        .mockImplementation(() => {});
      vi.spyOn(daemon, 'readPidFile').mockReturnValue(null);

      const code = await handleStop({ port: 3001 });

      expect(code).toBe(0);
      expect(unregister_spy).toHaveBeenCalledWith(3001);
    });
  });

  describe('handleRestart with smart workspace detection', () => {
    test('restarts workspace instance when found', async () => {
      vi.spyOn(registry, 'cleanStaleInstances').mockImplementation(() => {});
      vi.spyOn(registry, 'findInstanceByWorkspace').mockReturnValue({
        workspace: '/test/workspace',
        port: 3005,
        pid: 99999
      });
      let call_count = 0;
      vi.spyOn(daemon, 'readPidFile').mockImplementation(() => {
        call_count++;
        return call_count === 1 ? 99999 : null;
      });
      vi.spyOn(daemon, 'isProcessRunning').mockReturnValue(true);
      const terminate_spy = vi
        .spyOn(daemon, 'terminateProcess')
        .mockResolvedValue(true);
      vi.spyOn(daemon, 'removePidFile').mockImplementation(() => {});
      const unregister_spy = vi
        .spyOn(registry, 'unregisterInstance')
        .mockImplementation(() => {});
      vi.spyOn(daemon, 'findAvailablePort').mockResolvedValue(3005);
      vi.spyOn(registry, 'registerInstance').mockImplementation(() => {});
      vi.spyOn(daemon, 'startDaemon').mockReturnValue({ pid: 11111 });
      vi.spyOn(daemon, 'printServerUrl').mockImplementation(() => {});
      const console_spy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = await handleRestart({ open: false });

      expect(result).toBe(0);
      expect(console_spy).toHaveBeenCalledWith(
        'Restarting workspace instance on port 3005'
      );
      expect(terminate_spy).toHaveBeenCalledWith(99999, 5000);
      expect(unregister_spy).toHaveBeenCalledWith(3005);
      expect(daemon.startDaemon).toHaveBeenCalledWith({
        port: 3005,
        host: undefined,
        is_debug: undefined
      });
      expect(registry.registerInstance).toHaveBeenCalledWith({
        workspace: process.cwd(),
        port: 3005,
        pid: 11111
      });
    });

    test('restarts global instance when no workspace instance found', async () => {
      vi.spyOn(registry, 'cleanStaleInstances').mockImplementation(() => {});
      vi.spyOn(registry, 'findInstanceByWorkspace').mockReturnValue(null);
      let call_count = 0;
      vi.spyOn(daemon, 'readPidFile').mockImplementation((port) => {
        call_count++;
        if (port === undefined && call_count === 1) {
          return 88888;
        }
        return null;
      });
      vi.spyOn(daemon, 'isProcessRunning').mockReturnValue(true);
      const terminate_spy = vi
        .spyOn(daemon, 'terminateProcess')
        .mockResolvedValue(true);
      vi.spyOn(daemon, 'removePidFile').mockImplementation(() => {});
      vi.spyOn(registry, 'unregisterInstance').mockImplementation(() => {});
      vi.spyOn(registry, 'registerInstance').mockImplementation(() => {});
      vi.spyOn(daemon, 'startDaemon').mockReturnValue({ pid: 22222 });
      vi.spyOn(daemon, 'printServerUrl').mockImplementation(() => {});

      const result = await handleRestart({ open: false });

      expect(result).toBe(0);
      expect(terminate_spy).toHaveBeenCalledWith(88888, 5000);
      expect(daemon.startDaemon).toHaveBeenCalledWith({
        port: undefined,
        host: undefined,
        is_debug: undefined
      });
      expect(registry.registerInstance).not.toHaveBeenCalled();
    });

    test('restarts specific port when --port specified', async () => {
      vi.spyOn(registry, 'cleanStaleInstances').mockImplementation(() => {});
      const find_spy = vi
        .spyOn(registry, 'findInstanceByWorkspace')
        .mockReturnValue(null);
      let call_count = 0;
      vi.spyOn(daemon, 'readPidFile').mockImplementation(() => {
        call_count++;
        return call_count === 1 ? 77777 : null;
      });
      vi.spyOn(daemon, 'isProcessRunning').mockReturnValue(true);
      const terminate_spy = vi
        .spyOn(daemon, 'terminateProcess')
        .mockResolvedValue(true);
      vi.spyOn(daemon, 'removePidFile').mockImplementation(() => {});
      const unregister_spy = vi
        .spyOn(registry, 'unregisterInstance')
        .mockImplementation(() => {});
      vi.spyOn(daemon, 'findAvailablePort').mockResolvedValue(3002);
      vi.spyOn(registry, 'registerInstance').mockImplementation(() => {});
      vi.spyOn(daemon, 'startDaemon').mockReturnValue({ pid: 33333 });
      vi.spyOn(daemon, 'printServerUrl').mockImplementation(() => {});

      const result = await handleRestart({ port: 3002, open: false });

      expect(result).toBe(0);
      expect(find_spy).not.toHaveBeenCalled();
      expect(terminate_spy).toHaveBeenCalledWith(77777, 5000);
      expect(unregister_spy).toHaveBeenCalledWith(3002);
      expect(daemon.startDaemon).toHaveBeenCalledWith({
        port: 3002,
        host: undefined,
        is_debug: undefined
      });
    });

    test('handles restart when instance not running', async () => {
      vi.spyOn(registry, 'cleanStaleInstances').mockImplementation(() => {});
      vi.spyOn(registry, 'findInstanceByWorkspace').mockReturnValue({
        workspace: '/test/workspace',
        port: 3005,
        pid: 99999
      });
      vi.spyOn(daemon, 'readPidFile').mockReturnValue(null);
      vi.spyOn(daemon, 'isProcessRunning').mockReturnValue(false);
      vi.spyOn(daemon, 'findAvailablePort').mockResolvedValue(3005);
      vi.spyOn(registry, 'registerInstance').mockImplementation(() => {});
      vi.spyOn(daemon, 'startDaemon').mockReturnValue({ pid: 44444 });
      vi.spyOn(daemon, 'printServerUrl').mockImplementation(() => {});

      const result = await handleRestart({ open: false });

      expect(result).toBe(0);
      expect(daemon.startDaemon).toHaveBeenCalled();
    });
  });
});
