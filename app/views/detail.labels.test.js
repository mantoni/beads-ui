import { describe, expect, test, vi } from 'vitest';
import { createDetailView } from './detail.js';

function mountDiv() {
  const div = document.createElement('div');
  document.body.appendChild(div);
  return div;
}

describe('detail view labels', () => {
  test('shows labels and allows add/remove', async () => {
    const mount = mountDiv();
    let current = {
      id: 'UI-5',
      title: 'With labels',
      status: 'open',
      priority: 2,
      labels: ['frontend']
    };
    const stores = {
      /** @param {string} id */
      snapshotFor(id) {
        return id === 'detail:UI-5' ? [current] : [];
      },
      subscribe() {
        return () => {};
      }
    };
    const sendFn = vi.fn(async (type, payload) => {
      if (type === 'label-add') {
        current = { ...current, labels: [...current.labels, payload.label] };
        return current;
      }
      if (type === 'label-remove') {
        current = {
          ...current,
          labels: current.labels.filter((l) => l !== payload.label)
        };
        return current;
      }
      return current;
    });

    const view = createDetailView(mount, sendFn, undefined, stores);
    await view.load('UI-5');

    // Initial chip present
    expect(mount.querySelectorAll('.prop.labels .badge').length).toBe(1);

    // Add a label via input + Enter
    const input = /** @type {HTMLInputElement} */ (
      mount.querySelector('.prop.labels input')
    );
    input.value = 'backend';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    );
    await Promise.resolve();

    expect(sendFn).toHaveBeenCalledWith('label-add', {
      id: 'UI-5',
      label: 'backend'
    });
    expect(mount.querySelectorAll('.prop.labels .badge').length).toBe(2);

    // Remove the first label by clicking the × button
    const removeBtn = /** @type {HTMLButtonElement} */ (
      mount.querySelector('.prop.labels .badge button')
    );
    removeBtn.click();
    await Promise.resolve();
    expect(sendFn).toHaveBeenCalledWith('label-remove', {
      id: 'UI-5',
      label: 'frontend'
    });
    expect(mount.querySelectorAll('.prop.labels .badge').length).toBe(1);
  });
});
