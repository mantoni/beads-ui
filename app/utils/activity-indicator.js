/**
 * @import { MessageType } from '../protocol.js'
 */
import { debug } from './logging.js';

/**
 * Track in-flight UI actions and toggle a bound indicator element.
 *
 * @param {HTMLElement | null} mount_element
 * @returns {{ wrapSend: (fn: (type: MessageType, payload?: unknown) => Promise<unknown>) => (type: MessageType, payload?: unknown) => Promise<unknown>, start: () => void, done: () => void, getCount: () => number }}
 */
export function createActivityIndicator(mount_element) {
  const log = debug('activity');
  /** @type {number} */
  let pending_count = 0;
  /** @type {Map<number, { type: string, start_ts: number }>} */
  const active_requests = new Map();
  /** @type {number} */
  let next_request_id = 1;

  function render() {
    if (!mount_element) {
      return;
    }
    const is_active = pending_count > 0;
    mount_element.toggleAttribute('hidden', !is_active);
    mount_element.setAttribute('aria-busy', is_active ? 'true' : 'false');
  }

  function start() {
    pending_count += 1;
    log('start count=%d', pending_count);
    render();
  }

  function done() {
    const prev = pending_count;
    pending_count = Math.max(0, pending_count - 1);
    if (prev <= 0) {
      log('done called but count was already %d', prev);
    } else {
      log('done count=%d→%d', prev, pending_count);
    }
    render();
  }

  /**
   * Wrap a transport-style send function to track activity.
   * Includes a safety timeout to prevent the loading indicator from getting stuck
   * if a request hangs due to network issues or server problems.
   *
   * @param {(type: MessageType, payload?: unknown) => Promise<unknown>} send_fn
   * @returns {(type: MessageType, payload?: unknown) => Promise<unknown>}
   */
  function wrapSend(send_fn) {
    // Safety timeout: if a request takes longer than this, force decrement the counter
    const SAFETY_TIMEOUT_MS = 30000; // 30 seconds

    return async (type, payload) => {
      const req_id = next_request_id++;
      const start_ts = Date.now();
      active_requests.set(req_id, { type, start_ts });
      log('request start id=%d type=%s count=%d', req_id, type, pending_count + 1);
      start();

      // Track if we've already called done() for this request
      let completed = false;
      const markComplete = () => {
        if (!completed) {
          completed = true;
          active_requests.delete(req_id);
          done();
        }
      };

      // Safety timeout: force decrement if request takes too long
      const timeout_id = setTimeout(() => {
        if (!completed) {
          log('request TIMEOUT id=%d type=%s elapsed=%dms', req_id, type, Date.now() - start_ts);
          markComplete();
        }
      }, SAFETY_TIMEOUT_MS);

      try {
        const result = await send_fn(type, payload);
        const elapsed = Date.now() - start_ts;
        log('request done id=%d type=%s elapsed=%dms', req_id, type, elapsed);
        return result;
      } catch (err) {
        const elapsed = Date.now() - start_ts;
        log('request error id=%d type=%s elapsed=%dms err=%o', req_id, type, elapsed, err);
        throw err;
      } finally {
        clearTimeout(timeout_id);
        markComplete();
      }
    };
  }

  render();

  return {
    wrapSend,
    start,
    done,
    getCount: () => pending_count,
    /**
     * Get details about active requests (for debugging stuck indicators).
     *
     * @returns {Array<{ id: number, type: string, elapsed_ms: number }>}
     */
    getActiveRequests: () => {
      const now = Date.now();
      return Array.from(active_requests.entries()).map(([id, info]) => ({
        id,
        type: info.type,
        elapsed_ms: now - info.start_ts
      }));
    }
  };
}
