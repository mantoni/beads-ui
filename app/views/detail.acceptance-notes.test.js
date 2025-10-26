import { describe, expect, test } from 'vitest';
import { createDetailView } from './detail.js';

describe('views/detail acceptance + notes', () => {
  test('renders acceptance from acceptance_criteria and notes markdown', async () => {
    document.body.innerHTML =
      '<section class="panel"><div id="mount"></div></section>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));

    /** @type {any} */
    const issue = {
      id: 'UI-71',
      title: 'Has acceptance + notes',
      acceptance_criteria: '- step A\n- step B',
      notes: 'Plain note text',
      status: 'open',
      priority: 2
    };

    const stores = {
      /** @param {string} id */
      snapshotFor(id) {
        return id === 'detail:UI-71' ? [issue] : [];
      },
      subscribe() {
        return () => {};
      }
    };
    const view = createDetailView(mount, async () => ({}), undefined, stores);
    await view.load('UI-71');

    const accTitle = mount.querySelector('.acceptance .props-card__title');
    expect(accTitle && accTitle.textContent).toBe('Acceptance Criteria');
    const accMd = mount.querySelector('.acceptance .md');
    expect(accMd && (accMd.textContent || '').toLowerCase()).toContain(
      'step a'
    );

    const notesTitle = mount.querySelector('.notes .props-card__title');
    expect(notesTitle && notesTitle.textContent).toBe('Notes');
    const notesMd = mount.querySelector('.notes .md');
    expect(notesMd && (notesMd.textContent || '')).toContain('Plain note text');
  });

  test('gates headings when acceptance and notes are empty', async () => {
    document.body.innerHTML =
      '<section class="panel"><div id="mount"></div></section>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));

    /** @type {any} */
    const issue = {
      id: 'UI-72',
      title: 'No acceptance/notes',
      acceptance_criteria: '',
      notes: '',
      status: 'open',
      priority: 2
    };

    const stores2 = {
      /** @param {string} id */
      snapshotFor(id) {
        return id === 'detail:UI-72' ? [issue] : [];
      },
      subscribe() {
        return () => {};
      }
    };
    const view = createDetailView(mount, async () => ({}), undefined, stores2);
    await view.load('UI-72');

    // Headings should not be present
    expect(mount.querySelector('.acceptance .props-card__title')).toBeNull();
    expect(mount.querySelector('.notes .props-card__title')).toBeNull();
  });
});
