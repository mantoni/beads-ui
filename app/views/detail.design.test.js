import { describe, expect, test } from 'vitest';
import { createDetailView } from './detail.js';

function mountDiv() {
  const div = document.createElement('div');
  document.body.appendChild(div);
  return div;
}

describe('detail view design section', () => {
  test('orders sections: Description → Design → Notes → Acceptance Criteria', async () => {
    const mount = mountDiv();
    /** @type {any} */
    const issue = {
      id: 'UI-116',
      title: 'Ordering test',
      description: 'Some description',
      design: '',
      notes: 'Some notes',
      acceptance_criteria: '- a' // also supports fallback field
    };
    const storesA = {
      /** @param {string} id */
      snapshotFor(id) {
        return id === 'detail:UI-116' ? [issue] : [];
      },
      subscribe() {
        return () => {};
      }
    };
    const view = createDetailView(mount, async () => ({}), undefined, storesA);
    await view.load('UI-116');

    const wrapper = /** @type {HTMLElement} */ (
      mount.querySelector('.tab-content-wrapper')
    );
    expect(wrapper).toBeTruthy();
    const children = Array.from(wrapper.children);
    const names = children.map((el) => {
      if (el.classList.contains('design')) {
        return 'design';
      }
      if (el.classList.contains('notes')) {
        return 'notes';
      }
      if (el.classList.contains('acceptance')) {
        return 'acceptance';
      }
      return 'description';
    });
    expect(names).toEqual(['description', 'design', 'notes', 'acceptance']);
    // Heading text for acceptance should be updated
    const accTitle = mount.querySelector('.acceptance .props-card__title');
    expect(accTitle && accTitle.textContent).toBe('Acceptance Criteria');
  });

  test('editing Design updates field and persists after reload', async () => {
    const mount = mountDiv();
    /** @type {any} */
    let current = {
      id: 'UI-116',
      title: 'Design edit test',
      description: 'X',
      design: '',
      notes: '',
      status: 'open',
      priority: 2
    };
    const storesB = {
      /** @param {string} id */
      snapshotFor(id) {
        return id === 'detail:UI-116' ? [current] : [];
      },
      subscribe() {
        return () => {};
      }
    };
    /**
     * @param {string} type
     * @param {any} [payload]
     */
    const send = async (type, payload) => {
      if (type === 'edit-text') {
        if (payload.field === 'design') {
          current = { ...current, design: payload.value };
          return current;
        }
        throw new Error('Unexpected field: ' + payload.field);
      }
      throw new Error('Unexpected: ' + type);
    };
    const view = createDetailView(mount, send, undefined, storesB);
    await view.load('UI-116');

    // Simulate edit-text result from server and reload to verify persistence
    await send('edit-text', {
      id: 'UI-116',
      field: 'design',
      value: 'Proposed design\n\n- step 1'
    });
    await view.load('UI-116');
    const designDiv2 = /** @type {HTMLDivElement} */ (
      mount.querySelector('.design')
    );
    expect(designDiv2 && (designDiv2.textContent || '')).toContain(
      'Proposed design'
    );
  });
});
