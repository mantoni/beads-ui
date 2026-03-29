import { describe, expect, test, vi } from 'vitest';
import { createTopNav } from './nav.js';

function setup() {
  document.body.innerHTML = '<div id="m"></div>';
  const mount = /** @type {HTMLElement} */ (document.getElementById('m'));
  const store = {
    state: { view: 'issues' },
    getState() {
      return this.state;
    },
    /** @param {any} v */
    set(v) {
      this.state = { ...this.state, ...v };
    },
    /** @param {(s: any) => void} fn */
    subscribe(fn) {
      // simplistic subscription for test
      this._fn = fn;
      return () => void 0;
    },
    _fn: /** @type {(s: any) => void} */ (() => {})
  };
  const router = { gotoView: vi.fn() };
  return { mount, store, router };
}

describe('views/nav', () => {
  test('renders and routes between tabs', async () => {
    const { mount, store, router } = setup();
    createTopNav(
      mount,
      /** @type {any} */ (store),
      /** @type {any} */ (router)
    );
    const links = mount.querySelectorAll('a.tab');
    expect(links.length).toBe(3);
    links[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(router.gotoView).toHaveBeenCalledWith('epics');
    links[2].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(router.gotoView).toHaveBeenCalledWith('board');
  });

  test('renders stable data test ids for nav shell and tabs', () => {
    const { mount, store, router } = setup();
    createTopNav(
      mount,
      /** @type {any} */ (store),
      /** @type {any} */ (router)
    );

    expect(mount.querySelector('[data-testid="top-nav"]')).toBeTruthy();
    expect(mount.querySelector('[data-testid="nav-tab-issues"]')).toBeTruthy();
    expect(mount.querySelector('[data-testid="nav-tab-epics"]')).toBeTruthy();
    expect(mount.querySelector('[data-testid="nav-tab-board"]')).toBeTruthy();
  });
});
