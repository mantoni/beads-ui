import { describe, expect, test, vi, beforeEach } from 'vitest';

// Mock child_process.spawn before importing
vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

import { spawn as spawnMock } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

/**
 * @param {string} stdoutText
 * @param {number} exitCode
 */
function makeFakeChild(stdoutText, exitCode) {
  const cp = new EventEmitter();
  cp.stdout = new PassThrough();
  cp.stderr = new PassThrough();
  cp.stdin = new PassThrough();
  setImmediate(() => {
    cp.stdout.end(stdoutText);
    cp.stderr.end('');
    cp.emit('close', exitCode);
  });
  return cp;
}

const mockedSpawn = /** @type {import('vitest').Mock} */ (spawnMock);

// We'll test the handler logic by importing handleMessage once implemented
// For now, we test via integration through the WebSocket setup

describe('delete-issue handler', () => {
  beforeEach(() => {
    mockedSpawn.mockReset();
  });

  test('calls bd delete with correct id', async () => {
    // This test will fail until we implement the handler
    // We need to verify that when delete-issue message is received,
    // bd delete <id> is called

    mockedSpawn.mockReturnValue(makeFakeChild('', 0));

    // Import the handler function (will fail until implemented)
    const { handleDeleteIssue } = await import('./ws.js');

    expect(handleDeleteIssue).toBeDefined();
  });
});
