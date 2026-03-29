import { html, render } from 'lit-html';
import { debug } from '../utils/logging.js';

/**
 * Render the top navigation with three tabs and handle route changes.
 *
 * @param {HTMLElement} mount_element
 * @param {{ getState: () => any, subscribe: (fn: (s: any) => void) => () => void }} store
 * @param {{ gotoView: (v: 'issues'|'epics'|'board') => void }} router
 */
export function createTopNav(mount_element, store, router) {
  const log = debug('views:nav');
  /** @type {(() => void) | null} */
  let unsubscribe = null;

  /**
   * @param {'issues'|'epics'|'board'} view
   * @returns {(ev: MouseEvent) => void}
   */
  function onClick(view) {
    return (ev) => {
      ev.preventDefault();
      log('click tab %s', view);
      router.gotoView(view);
    };
  }

  function template() {
    const s = store.getState();
    const active = s.view || 'issues';
    return html`
      <nav
        class="header-nav"
        aria-label="Primary"
        data-testid="top-nav"
      >
        <a
          href="#/issues"
          class="tab ${active === 'issues' ? 'active' : ''}"
          data-testid="nav-tab-issues"
          @click=${onClick('issues')}
          >Issues</a
        >
        <a
          href="#/epics"
          class="tab ${active === 'epics' ? 'active' : ''}"
          data-testid="nav-tab-epics"
          @click=${onClick('epics')}
          >Epics</a
        >
        <a
          href="#/board"
          class="tab ${active === 'board' ? 'active' : ''}"
          data-testid="nav-tab-board"
          @click=${onClick('board')}
          >Board</a
        >
      </nav>
    `;
  }

  function doRender() {
    render(template(), mount_element);
  }

  doRender();
  unsubscribe = store.subscribe(() => doRender());

  return {
    destroy() {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      render(html``, mount_element);
    }
  };
}
