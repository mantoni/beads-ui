import { describe, expect, test } from 'vitest';
import { createDetailView } from './detail.js';

describe('views/detail acceptance placeholder', () => {
  test('shows placeholder and allows entering edit mode when empty', async () => {
    document.body.innerHTML =
      '<section class="panel"><div id="mount"></div></section>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));

    /** @type {any} */
    const issue = {
      id: 'UI-200',
      title: 'Empty acceptance',
      acceptance: '',
      acceptance_criteria: '',
      status: 'open',
      priority: 2
    };

    const stores = {
      /** @param {string} id */
      snapshotFor(id) {
        return id === 'detail:UI-200' ? [issue] : [];
      },
      subscribe() {
        return () => {};
      }
    };
    const view = createDetailView(
      mount,
      async (type, payload) => {
        if (type === 'edit-text') {
          const f = /** @type {any} */ (payload).field;
          const v = /** @type {any} */ (payload).value;
          expect(f).toBe('acceptance');
          /** @type {any} */ (issue)[f] = v;
          return issue;
        }
        throw new Error('Unexpected: ' + type);
      },
      undefined,
      stores
    );

    await view.load('UI-200');

    // Heading should be omitted when empty
    expect(mount.querySelector('.acceptance .props-card__title')).toBeNull();
    // Placeholder is visible
    const ph = mount.querySelector('.acceptance .muted');
    expect(ph && (ph.textContent || '')).toContain('Add acceptance criteria');

    // Click to enter edit mode
    const editable = /** @type {HTMLDivElement} */ (
      mount.querySelector('.acceptance .editable')
    );
    editable.click();
    const ta = /** @type {HTMLTextAreaElement} */ (
      mount.querySelector('.acceptance textarea')
    );
    expect(ta).toBeTruthy();
    ta.value = 'Step 1';

    // Save via Cmd/Ctrl+Enter
    const key = new KeyboardEvent('keydown', { key: 'Enter', metaKey: true });
    ta.dispatchEvent(key);
    await Promise.resolve();

    // Back to read mode, content rendered
    const md = /** @type {HTMLDivElement} */ (
      mount.querySelector('.acceptance .md')
    );
    expect(md && (md.textContent || '')).toContain('Step 1');
  });
});
