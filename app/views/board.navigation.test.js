import { describe, expect, test } from 'vitest';
import { createBoardView } from './board.js';

describe('views/board keyboard navigation', () => {
  test('ArrowUp/ArrowDown move within column', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));

    /** @type {{ getReady: () => Promise<any[]>, getInProgress: () => Promise<any[]>, getClosed: () => Promise<any[]> }} */
    const data = {
      async getReady() {
        return [];
      },
      async getInProgress() {
        return [
          { id: 'P-1', title: 'p1', updated_at: '2025-10-23T10:00:00.000Z' },
          { id: 'P-2', title: 'p2', updated_at: '2025-10-23T09:00:00.000Z' }
        ];
      },
      async getClosed() {
        return [];
      }
    };

    const view = createBoardView(mount, /** @type {any} */ (data), () => {});
    await view.load();

    const first = /** @type {HTMLElement} */ (
      mount.querySelector('#in-progress-col .board-card')
    );
    const second = /** @type {HTMLElement} */ (
      mount.querySelectorAll('#in-progress-col .board-card')[1]
    );
    first.focus();
    expect(document.activeElement).toBe(first);

    first.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })
    );
    expect(document.activeElement).toBe(second);

    second.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })
    );
    expect(document.activeElement).toBe(first);
  });

  test('ArrowLeft/ArrowRight jump to top card in adjacent non-empty column, skipping empty', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));

    const data = {
      async getReady() {
        // Empty column should be skipped on ArrowRight
        return [];
      },
      async getBlocked() {
        return [
          { id: 'B-1', title: 'b1', updated_at: '2025-10-23T10:00:00.000Z' }
        ];
      },
      async getInProgress() {
        return [
          { id: 'P-1', title: 'p1', updated_at: '2025-10-23T10:00:00.000Z' },
          { id: 'P-2', title: 'p2', updated_at: '2025-10-23T09:00:00.000Z' }
        ];
      },
      async getClosed() {
        return [];
      }
    };

    /** @type {string[]} */
    const opened = [];
    const view = createBoardView(mount, /** @type {any} */ (data), (id) => {
      opened.push(id);
    });
    await view.load();

    const open_first = /** @type {HTMLElement} */ (
      mount.querySelector('#blocked-col .board-card')
    );
    const prog_first = /** @type {HTMLElement} */ (
      mount.querySelector('#in-progress-col .board-card')
    );
    open_first.focus();
    open_first.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
    );
    expect(document.activeElement).toBe(prog_first);

    // Enter opens the details (via goto_issue callback)
    prog_first.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    );
    expect(opened).toEqual(['P-1']);

    // Space also opens
    prog_first.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', bubbles: true })
    );
    expect(opened).toEqual(['P-1', 'P-1']);
  });
});
