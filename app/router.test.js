import { describe, expect, test } from 'vitest';
import { createHashRouter, parseHash } from './router.js';
import { createStore } from './state.js';

describe('router', () => {
  test('parseHash extracts id', () => {
    expect(parseHash('#/issue/UI-5')).toBe('UI-5');
    expect(parseHash('#/anything')).toBeNull();
  });

  test('router updates store and gotoIssue updates hash', () => {
    document.body.innerHTML = '<div></div>';
    const store = createStore();
    const router = createHashRouter(store);
    router.start();

    window.location.hash = '#/issue/UI-10';
    // Trigger handler synchronously
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(store.getState().selected_id).toBe('UI-10');

    router.gotoIssue('UI-11');
    expect(window.location.hash).toBe('#/issue/UI-11');
    router.stop();
  });
});
