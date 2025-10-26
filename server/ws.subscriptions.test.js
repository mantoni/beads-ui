import { createServer } from 'node:http';
import { describe, expect, test, vi } from 'vitest';
import { runBdJson } from './bd.js';
import { attachWsServer, handleMessage, notifyIssuesChanged } from './ws.js';

vi.mock('./bd.js', () => ({ runBdJson: vi.fn(), runBd: vi.fn() }));

describe('ws subscriptions + targeted fanout', () => {
  test('targeted issues-changed by show id without subscribe-updates', async () => {
    const mJson = /** @type {import('vitest').Mock} */ (runBdJson);
    // show-issue → return object with id
    mJson.mockImplementation(async (args) => {
      if (Array.isArray(args) && args[0] === 'show') {
        return { code: 0, stdoutJson: { id: String(args[1]), status: 'open' } };
      }
      return { code: 0, stdoutJson: [] };
    });

    // Create an http server object but do not listen; just to satisfy attachWsServer
    const server = createServer();
    const { wss } = attachWsServer(server, {
      path: '/ws',
      heartbeat_ms: 10000
    });

    // Create two stub sockets and register them as connected clients
    const a = {
      sent: /** @type {string[]} */ ([]),
      readyState: 1,
      OPEN: 1,
      /** @param {string} msg */
      send(msg) {
        this.sent.push(String(msg));
      }
    };
    const b = {
      sent: /** @type {string[]} */ ([]),
      readyState: 1,
      OPEN: 1,
      /** @param {string} msg */
      send(msg) {
        this.sent.push(String(msg));
      }
    };
    wss.clients.add(/** @type {any} */ (a));
    wss.clients.add(/** @type {any} */ (b));

    // Set show-issue for A (no subscription required in v2)
    await handleMessage(
      /** @type {any} */ (a),
      Buffer.from(
        JSON.stringify({
          id: 'q1',
          type: 'show-issue',
          payload: { id: 'UI-1' }
        })
      )
    );

    // Now emit a targeted change for UI-1
    notifyIssuesChanged(
      { hint: { ids: ['UI-1'] } },
      { issue: { id: 'UI-1', status: 'open' } }
    );

    const aHas = a.sent.some((m) => {
      try {
        const o = JSON.parse(m);
        return o && o.type === 'issues-changed';
      } catch {
        return false;
      }
    });
    const bHas = b.sent.some((m) => {
      try {
        const o = JSON.parse(m);
        return o && o.type === 'issues-changed';
      } catch {
        return false;
      }
    });

    expect(aHas).toBe(true);
    expect(bHas).toBe(false);
  });

  // subscribe-updates removed in v2; no ack test
});
