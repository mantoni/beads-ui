/**
 * @import { MessageType } from '../protocol.js'
 */

/**
 * Track in-flight UI actions and toggle a bound indicator element.
 *
 * @param {HTMLElement | null} mount_element
 * @returns {{ wrapSend: (fn: (type: MessageType, payload?: unknown) => Promise<unknown>) => (type: MessageType, payload?: unknown) => Promise<unknown>, start: () => void, done: () => void, getCount: () => number }}
 */
export function createActivityIndicator(mount_element) {
  /** @type {number} */
  let pending_count = 0;

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
    render();
  }

  function done() {
    pending_count = Math.max(0, pending_count - 1);
    render();
  }

  /**
   * Wrap a transport-style send function to track activity.
   *
   * @param {(type: MessageType, payload?: unknown) => Promise<unknown>} send_fn
   * @returns {(type: MessageType, payload?: unknown) => Promise<unknown>}
   */
  function wrapSend(send_fn) {
    return async (type, payload) => {
      start();
      try {
        return await send_fn(type, payload);
      } finally {
        done();
      }
    };
  }

  render();

  return {
    wrapSend,
    start,
    done,
    getCount: () => pending_count
  };
}
