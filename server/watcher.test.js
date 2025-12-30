import { beforeEach, describe, expect, test, vi } from 'vitest';
import { watchDb } from './watcher.js';

/** @type {{ dir: string, cb: (event: string, filename?: string) => void, w: { close: () => void } }[]} */
const watchers = [];

vi.mock('node:fs', () => {
  const watch = vi.fn((dir, _opts, cb) => {
    // Minimal event emitter interface for FSWatcher
    const handlers = /** @type {{ close: Array<() => void> }} */ ({
      close: []
    });
    const w = {
      close: () => handlers.close.forEach((fn) => fn())
    };
    watchers.push({ dir, cb, w });
    return /** @type {any} */ (w);
  });
  return { default: { watch }, watch };
});

beforeEach(() => {
  watchers.length = 0;
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('watchDb', () => {
  test('debounces rapid change events', () => {
    const calls = [];
    const handle = watchDb('/repo', () => calls.push(null), {
      debounce_ms: 100,
      explicit_db: '/repo/.beads/ui.db'
    });
    expect(watchers.length).toBe(1);
    const { cb } = watchers[0];

    // Fire multiple changes in quick succession
    cb('change', 'ui.db');
    cb('change', 'ui.db');
    cb('rename', 'ui.db');

    // Nothing yet until debounce passes
    expect(calls.length).toBe(0);
    vi.advanceTimersByTime(99);
    expect(calls.length).toBe(0);
    vi.advanceTimersByTime(1);
    expect(calls.length).toBe(1);

    // Cleanup
    handle.close();
  });

  test('ignores other filenames', () => {
    const calls = [];
    const handle = watchDb('/repo', () => calls.push(null), {
      debounce_ms: 50,
      explicit_db: '/repo/.beads/ui.db'
    });
    const { cb } = watchers[0];
    cb('change', 'something-else.db');
    vi.advanceTimersByTime(60);
    expect(calls.length).toBe(0);
    handle.close();
  });

  test('rebind attaches to new db path', () => {
    const calls = [];
    const handle = watchDb('/repo', () => calls.push(null), {
      debounce_ms: 50,
      explicit_db: '/repo/.beads/ui.db'
    });
    expect(watchers.length).toBe(1);
    const first = watchers[0];

    // Rebind to a different DB path
    handle.rebind({ explicit_db: '/other/.beads/alt.db' });

    // A new watcher is created
    expect(watchers.length).toBe(2);
    const second = watchers[1];

    // Old watcher should ignore new file name
    first.cb('change', 'ui.db');
    vi.advanceTimersByTime(60);
    expect(calls.length).toBe(0);

    // New watcher reacts
    second.cb('change', 'alt.db');
    vi.advanceTimersByTime(60);
    expect(calls.length).toBe(1);

    handle.close();
  });

  test('ignores changes during cooldown window', () => {
    const calls = [];
    const handle = watchDb('/repo', () => calls.push(null), {
      debounce_ms: 10,
      cooldown_ms: 100,
      explicit_db: '/repo/.beads/ui.db'
    });
    const { cb } = watchers[0];

    cb('change', 'ui.db');
    vi.advanceTimersByTime(10);
    expect(calls.length).toBe(1);

    cb('change', 'ui.db');
    vi.advanceTimersByTime(10);
    expect(calls.length).toBe(1);

    vi.advanceTimersByTime(100);
    cb('change', 'ui.db');
    vi.advanceTimersByTime(10);
    expect(calls.length).toBe(2);

    handle.close();
  });
});
