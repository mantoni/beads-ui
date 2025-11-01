import { describe, expect, test, vi } from 'vitest';
import { handleStart, handleStop } from './commands.js';
import * as daemon from './daemon.js';

describe('handleStart (unit)', () => {
  test('returns 1 when daemon start fails', async () => {
    vi.spyOn(daemon, 'readPidFile').mockReturnValue(null);
    vi.spyOn(daemon, 'isProcessRunning').mockReturnValue(false);
    vi.spyOn(daemon, 'startDaemon').mockReturnValue(null);

    const code = await handleStart({ open: false });

    expect(code).toBe(1);
  });

  test('returns 0 when already running', async () => {
    vi.spyOn(daemon, 'readPidFile').mockReturnValue(12345);
    vi.spyOn(daemon, 'isProcessRunning').mockReturnValue(true);
    const print_url = vi
      .spyOn(daemon, 'printServerUrl')
      .mockImplementation(() => {});

    const code = await handleStart({ open: false });

    expect(code).toBe(0);
    expect(print_url).not.toHaveBeenCalled();
  });
});

describe('handleStop (unit)', () => {
  test('returns 2 when not running and no PID file', async () => {
    vi.spyOn(daemon, 'readPidFile').mockReturnValue(null);

    const code = await handleStop();

    expect(code).toBe(2);
  });

  test('returns 2 on stale PID and removes file', async () => {
    vi.spyOn(daemon, 'readPidFile').mockReturnValue(1111);
    vi.spyOn(daemon, 'isProcessRunning').mockReturnValue(false);
    const remove_pid = vi
      .spyOn(daemon, 'removePidFile')
      .mockImplementation(() => {});

    const code = await handleStop();

    expect(code).toBe(2);
    expect(remove_pid).toHaveBeenCalledTimes(1);
  });

  test('returns 0 when process terminates and removes PID', async () => {
    vi.spyOn(daemon, 'readPidFile').mockReturnValue(2222);
    vi.spyOn(daemon, 'isProcessRunning').mockReturnValue(true);
    vi.spyOn(daemon, 'terminateProcess').mockResolvedValue(true);
    const remove_pid = vi
      .spyOn(daemon, 'removePidFile')
      .mockImplementation(() => {});

    const code = await handleStop();

    expect(code).toBe(0);
    expect(remove_pid).toHaveBeenCalledTimes(1);
  });
});
