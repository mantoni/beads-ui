/* global console */
// Suppress Lit dev-mode warning in Vitest
// Provided snippet: overrides console.warn but forwards all other messages
const { warn } = console;
console.warn = /** @type {function(...*): void} */ (
  (...args) => {
    // Filter out the noisy Lit dev-mode banner in tests
    if (!args[0].startsWith('Lit is in dev mode.')) {
      warn.call(console, ...args);
    }
  }
);

// Keep frame-scheduled rendering deterministic without waiting for JSDOM's
// timer-backed animation frames in every view test.
globalThis.requestAnimationFrame = (
  /** @type {FrameRequestCallback} */ callback
) => {
  globalThis.queueMicrotask(() => callback(globalThis.performance.now()));
  return 0;
};
