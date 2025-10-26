import { describe, expect, test } from 'vitest';
import {
  MESSAGE_TYPES,
  PROTOCOL_VERSION,
  decodeReply,
  decodeRequest,
  isMessageType,
  isReply,
  isRequest,
  makeError,
  makeOk,
  makeRequest
} from './protocol.js';

describe('server/protocol', () => {
  test('isMessageType returns true for known type', () => {
    // execution
    const res = isMessageType('show-issue');

    // assertion
    expect(res).toBe(true);
  });

  test('isMessageType returns false for unknown type', () => {
    // execution
    const res = isMessageType('not-a-type');

    // assertion
    expect(res).toBe(false);
  });

  test('makeRequest and decodeRequest round-trip', () => {
    // setup
    const req = makeRequest('show-issue', { id: 'UI-9' }, 'r-9');

    // execution
    const decoded = decodeRequest(JSON.parse(JSON.stringify(req)));

    // assertion
    expect(isRequest(req)).toBe(true);
    expect(decoded.id).toBe('r-9');
    expect(decoded.type).toBe('show-issue');
  });

  test('makeOk and makeError create valid replies', () => {
    // setup
    const req = makeRequest('show-issue', { id: 'UI-1' }, 'r-10');

    // execution
    const ok = makeOk(req, [{ id: 'UI-1' }]);
    const err = makeError(req, 'boom', 'Something went wrong');

    // assertion
    expect(isReply(ok)).toBe(true);
    expect(isReply(err)).toBe(true);
    expect(ok.ok).toBe(true);
    expect(err.ok).toBe(false);
  });

  test('decodeReply accepts ok and error envelopes', () => {
    // setup
    const req = makeRequest('edit-text', { id: 'UI-1', text: 'x' }, 'r-11');
    const ok = makeOk(req, { id: 'UI-1' });
    const err = makeError(req, 'validation', 'Invalid');

    // execution
    const ok2 = decodeReply(JSON.parse(JSON.stringify(ok)));
    const err2 = decodeReply(JSON.parse(JSON.stringify(err)));

    // assertion
    expect(ok2.ok).toBe(true);
    expect(err2.ok).toBe(false);
  });

  test('invalid envelopes throw on decode', () => {
    // execution + assertion
    expect(() => decodeRequest({})).toThrow();
    expect(() => decodeReply({ ok: true })).toThrow();
  });

  test('exports protocol constants', () => {
    // assertion
    expect(typeof PROTOCOL_VERSION).toBe('string');
    expect(Array.isArray(MESSAGE_TYPES)).toBe(true);
    expect(MESSAGE_TYPES.length).toBeGreaterThan(0);
  });
});
