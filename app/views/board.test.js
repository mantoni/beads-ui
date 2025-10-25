import { describe, expect, test } from 'vitest';
import { createBoardView } from './board.js';

describe('views/board', () => {
  test('renders four columns (Blocked, Ready, In Progress, Closed) with sorted cards and navigates on click', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));

    /** @type {{ getBlocked: () => Promise<any[]>, getReady: () => Promise<any[]>, getInProgress: () => Promise<any[]>, getClosed: () => Promise<any[]> }} */
    const data = {
      async getBlocked() {
        return [
          {
            id: 'B-2',
            title: 'b2',
            priority: 1,
            updated_at: '2025-10-22T07:00:00.000Z',
            issue_type: 'task'
          },
          {
            id: 'B-1',
            title: 'b1',
            priority: 0,
            updated_at: '2025-10-21T07:00:00.000Z',
            issue_type: 'bug'
          }
        ];
      },
      async getReady() {
        return [
          {
            id: 'R-2',
            title: 'r2',
            priority: 1,
            updated_at: '2025-10-20T08:00:00.000Z',
            issue_type: 'task'
          },
          {
            id: 'R-1',
            title: 'r1',
            priority: 0,
            updated_at: '2025-10-21T08:00:00.000Z',
            issue_type: 'bug'
          },
          {
            id: 'R-3',
            title: 'r3',
            priority: 1,
            updated_at: '2025-10-22T08:00:00.000Z',
            issue_type: 'feature'
          }
        ];
      },
      async getInProgress() {
        return [
          {
            id: 'P-1',
            title: 'p1',
            updated_at: '2025-10-23T09:00:00.000Z',
            issue_type: 'task'
          },
          {
            id: 'P-2',
            title: 'p2',
            updated_at: '2025-10-22T09:00:00.000Z',
            issue_type: 'feature'
          }
        ];
      },
      async getClosed() {
        const now = Date.now();
        return [
          {
            id: 'C-2',
            title: 'c2',
            updated_at: '2025-10-20T09:00:00.000Z',
            // Closed just now → appears first for default 'today' filter
            closed_at: new Date(now).toISOString(),
            issue_type: 'task'
          },
          {
            id: 'C-1',
            title: 'c1',
            updated_at: '2025-10-21T09:00:00.000Z',
            // Closed one hour ago today → second
            closed_at: new Date(now - 60 * 60 * 1000).toISOString(),
            issue_type: 'bug'
          }
        ];
      }
    };

    /** @type {string[]} */
    const navigations = [];
    const view = createBoardView(mount, /** @type {any} */ (data), (id) => {
      navigations.push(id);
    });

    await view.load();

    // Blocked: priority asc, then updated_at desc for equal priority
    const blocked_ids = Array.from(
      mount.querySelectorAll('#blocked-col .board-card .mono')
    ).map((el) => el.textContent?.trim());
    expect(blocked_ids).toEqual(['#1', '#2']);

    // Ready: priority asc, then updated_at desc for equal priority
    const ready_ids = Array.from(
      mount.querySelectorAll('#ready-col .board-card .mono')
    ).map((el) => el.textContent?.trim());
    expect(ready_ids).toEqual(['#1', '#3', '#2']);

    // In progress: updated_at desc
    const prog_ids = Array.from(
      mount.querySelectorAll('#in-progress-col .board-card .mono')
    ).map((el) => el.textContent?.trim());
    expect(prog_ids).toEqual(['#1', '#2']);

    // Closed: closed_at desc
    const closed_ids = Array.from(
      mount.querySelectorAll('#closed-col .board-card .mono')
    ).map((el) => el.textContent?.trim());
    expect(closed_ids).toEqual(['#2', '#1']);

    // Click navigates
    const first_ready = /** @type {HTMLElement|null} */ (
      mount.querySelector('#ready-col .board-card')
    );
    first_ready?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(navigations[0]).toBe('R-1');
  });

  test('filters Ready to exclude items that are In Progress', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));

    /** @type {{ getReady: () => Promise<any[]>, getInProgress: () => Promise<any[]>, getClosed: () => Promise<any[]> }} */
    const data = {
      async getReady() {
        return [
          {
            id: 'X-1',
            title: 'x1',
            priority: 1,
            updated_at: '2025-10-23T10:00:00.000Z',
            issue_type: 'task'
          },
          {
            id: 'X-2',
            title: 'x2',
            priority: 1,
            updated_at: '2025-10-23T09:00:00.000Z',
            issue_type: 'task'
          }
        ];
      },
      async getInProgress() {
        return [
          {
            id: 'X-2',
            title: 'x2',
            updated_at: '2025-10-23T11:00:00.000Z',
            issue_type: 'task'
          }
        ];
      },
      async getClosed() {
        return [];
      }
    };

    const view = createBoardView(mount, /** @type {any} */ (data), () => {});

    await view.load();

    const ready_ids = Array.from(
      mount.querySelectorAll('#ready-col .board-card .mono')
    ).map((el) => el.textContent?.trim());

    // X-2 is in progress, so Ready should only show X-1
    expect(ready_ids).toEqual(['#1']);

    const prog_ids = Array.from(
      mount.querySelectorAll('#in-progress-col .board-card .mono')
    ).map((el) => el.textContent?.trim());
    expect(prog_ids).toEqual(['#2']);
  });
});
