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
      /** @type {any} */ (router),
      {
        fetchFn: /** @type {any} */ (
          async () => ({
            ok: true,
            async json() {
              return { ok: true, root_dir: '/tmp/repo' };
            }
          })
        ),
        reloadFn: () => {}
      }
    );

    expect(mount.querySelector('button.workspace-button')).not.toBeNull();

    const links = mount.querySelectorAll('a.tab');
    expect(links.length).toBe(3);
    links[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(router.gotoView).toHaveBeenCalledWith('epics');
    links[2].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(router.gotoView).toHaveBeenCalledWith('board');
  });
});
