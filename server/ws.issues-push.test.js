import { describe, expect, test, vi } from 'vitest';
import { runBdJson } from './bd.js';
import { handleMessage } from './ws.js';

vi.mock('./bd.js', () => ({ runBdJson: vi.fn() }));

function makeStubSocket() {
  return {
    sent: /** @type {string[]} */ ([]),
    readyState: 1,
    OPEN: 1,
    /** @param {string} msg */
    send(msg) {
      this.sent.push(String(msg));
    }
  };
}

describe('ws issues push subscription', () => {
  test('subscribe-issues replies ok and sends snapshot envelope', async () => {
    const mocked = /** @type {import('vitest').Mock} */ (runBdJson);
    mocked.mockResolvedValueOnce({
      code: 0,
      stdoutJson: [
        { id: 'UI-1', title: 'A' },
        { id: 'UI-2', title: 'B' }
      ]
    });
    const ws = makeStubSocket();
    const req = { id: 'sub1', type: /** @type {any} */ ('subscribe-issues') };
    await handleMessage(
      /** @type {any} */ (ws),
      Buffer.from(JSON.stringify(req))
    );
    expect(ws.sent.length).toBeGreaterThanOrEqual(2);
    const ack = JSON.parse(ws.sent[ws.sent.length - 2]);
    expect(ack.ok).toBe(true);
    expect(ack.type).toBe('subscribe-issues');

    const evt = JSON.parse(ws.sent[ws.sent.length - 1]);
    expect(evt.ok).toBe(true);
    expect(evt.type).toBe('issues');
    const env = evt.payload;
    expect(env && env.topic).toBe('issues');
    expect(env.snapshot).toBe(true);
    expect(Array.isArray(env.added)).toBe(true);
    expect(env.added.length).toBe(2);
  });
});
