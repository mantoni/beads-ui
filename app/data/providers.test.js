import { describe, expect, test } from 'vitest';
import { createDataLayer } from './providers.js';

/**
 * @returns {{ calls: { type: string, payload: any }[], send: (type: string, payload?: any) => Promise<any> }}
 */
function makeTransportRecorder() {
  /** @type {{ type: string, payload: any }[]} */
  const calls = [];
  return {
    calls,
    /**
     * @param {string} type
     * @param {any} [payload]
     */
    async send(type, payload) {
      calls.push({ type, payload });
      // default fake payloads
      if (type === 'epic-status') {
        return [];
      }
      if (type === 'list-issues') {
        return [];
      }
      if (
        type === 'update-status' ||
        type === 'update-priority' ||
        type === 'edit-text' ||
        type === 'update-assignee'
      ) {
        return { id: payload?.id || 'X' };
      }
      return null;
    }
  };
}

describe('data/providers', () => {
  test('does not expose list read methods (push-only)', async () => {
    const rec = makeTransportRecorder();
    const data = createDataLayer((t, p) => rec.send(t, p));
    // @ts-expect-error legacy methods removed
    expect(data.getReady).toBeUndefined();
    // @ts-expect-error legacy methods removed
    expect(data.getInProgress).toBeUndefined();
    // @ts-expect-error legacy methods removed
    expect(data.getClosed).toBeUndefined();
    // @ts-expect-error legacy methods removed
    expect(data.getEpicStatus).toBeUndefined();
  });

  test('updateIssue dispatches field-specific mutations', async () => {
    const rec = makeTransportRecorder();
    const data = createDataLayer((t, p) => rec.send(t, p));
    await data.updateIssue({
      id: 'UI-1',
      title: 'X',
      acceptance: 'Y',
      status: 'in_progress',
      priority: 2,
      assignee: 'max'
    });
    const types = rec.calls.map((c) => c.type);
    expect(types).toContain('edit-text');
    expect(types).toContain('update-status');
    expect(types).toContain('update-priority');
    expect(types).toContain('update-assignee');
  });

  // removed: getIssue (read RPC)
});
