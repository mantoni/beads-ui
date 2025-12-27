import fs from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createApp } from './app.js';
import { getConfig } from './config.js';

/** @type {string[]} */
const tmps = [];

function mkdtemp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beads-ui-ws-api-'));
  tmps.push(dir);
  return dir;
}

describe('workspace API', () => {
  /** @type {import('node:http').Server | null} */
  let server = null;
  /** @type {string} */
  let base_url = '';

  /** @type {string} */
  let current_root_dir = '';

  const on_set = vi.fn();

  beforeEach(async () => {
    const root = mkdtemp();
    fs.mkdirSync(path.join(root, 'a'));
    fs.mkdirSync(path.join(root, 'b'));
    fs.mkdirSync(path.join(root, 'with-beads'));
    fs.mkdirSync(path.join(root, 'with-beads', '.beads'));

    current_root_dir = root;

    const config = getConfig();
    const app = createApp(config, {
      getRootDir: () => current_root_dir,
      setRootDir: (next_root_dir) => {
        current_root_dir = next_root_dir;
        on_set(next_root_dir);
      }
    });
    server = createServer(app);
    await new Promise((resolve) => {
      server?.listen(0, '127.0.0.1', () => resolve(null));
    });
    const addr = /** @type {any} */ (server.address());
    base_url = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    on_set.mockClear();
    await new Promise((resolve) => {
      if (!server) {
        resolve(null);
        return;
      }
      server.close(() => resolve(null));
    });
    server = null;
  });

  afterEach(() => {
    for (const d of tmps.splice(0, tmps.length)) {
      try {
        fs.rmSync(d, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  test('returns current workspace root', async () => {
    const res = await fetch(`${base_url}/api/workspace`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.root_dir).toBe(current_root_dir);
  });

  test('browses directories under a path', async () => {
    const res = await fetch(
      `${base_url}/api/browse?path=${encodeURIComponent(current_root_dir)}`
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    const names = /** @type {any[]} */ (json.entries).map(
      (/** @type {any} */ e) => e.name
    );
    expect(names).toContain('a');
    expect(names).toContain('b');
    const wb = /** @type {any[]} */ (json.entries).find(
      (/** @type {any} */ e) => e.name === 'with-beads'
    );
    expect(wb.has_beads).toBe(true);
  });

  test('switches workspace root', async () => {
    const next = path.join(current_root_dir, 'a');
    const res = await fetch(`${base_url}/api/workspace`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ root_dir: next })
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.root_dir).toBe(next);
    expect(current_root_dir).toBe(next);
    expect(on_set).toHaveBeenCalledWith(next);
  });

  test('rejects invalid workspace root', async () => {
    const res = await fetch(`${base_url}/api/workspace`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ root_dir: path.join(current_root_dir, 'missing') })
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });
});
