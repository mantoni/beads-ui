import { describe, expect, test, vi } from 'vitest';
import { resolveWorkspaceDatabase } from '../db.js';
import { printServerUrl } from './daemon.js';

vi.mock('../db.js', () => ({
  resolveWorkspaceDatabase: vi.fn(() => ({
    path: '/repo/.beads',
    source: 'metadata',
    exists: true
  }))
}));

vi.mock('../config.js', () => ({
  getConfig: () => ({ url: 'http://127.0.0.1:3000' })
}));

describe('printServerUrl', () => {
  test('prints workspace-aware database resolution', () => {
    const log_spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    printServerUrl();

    expect(resolveWorkspaceDatabase).toHaveBeenCalledTimes(1);
    expect(log_spy).toHaveBeenCalledWith('beads db   /repo/.beads (metadata)');
    expect(log_spy).toHaveBeenCalledWith(
      'beads ui   listening on http://127.0.0.1:3000'
    );

    log_spy.mockRestore();
  });
});
