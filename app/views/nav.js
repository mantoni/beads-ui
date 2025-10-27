import { html, render } from 'lit-html';

/**
 * Render the top navigation with three tabs and handle route changes.
 *
 * @param {HTMLElement} mount_element
 * @param {{ getState: () => any, subscribe: (fn: (s: any) => void) => () => void }} store
 * @param {{ gotoView: (v: 'issues'|'epics'|'board') => void }} router
 */
export function createTopNav(mount_element, store, router) {
  /** @type {(() => void) | null} */
  let unsubscribe = null;

  /**
   * @param {'issues'|'epics'|'board'} view
   * @returns {(ev: MouseEvent) => void}
   */
  function onClick(view) {
    return (ev) => {
      ev.preventDefault();
      router.gotoView(view);
    };
  }

  function template() {
    const s = store.getState();
    const active = s.view || 'issues';
    return html`
      <nav class="header-nav" aria-label="Primary">
        <a
          href="#/issues"
          class="tab ${active === 'issues' ? 'active' : ''}"
          @click=${onClick('issues')}
          >Issues</a
        >
        <a
          href="#/epics"
          class="tab ${active === 'epics' ? 'active' : ''}"
          @click=${onClick('epics')}
          >Epics</a
        >
        <a
          href="#/board"
          class="tab ${active === 'board' ? 'active' : ''}"
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
