import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  findNearestBeadsDb,
  findNearestBeadsMetadata,
  resolveDbPath,
  resolveWorkspaceDatabase
} from './db.js';

/** @type {string[]} */
const tmps = [];

function mkdtemp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beads-ui-test-'));
  tmps.push(dir);
  return dir;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  for (const d of tmps.splice(0)) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
});

describe('resolveDbPath', () => {
  test('uses explicit_db when provided', () => {
    const res = resolveDbPath({ cwd: '/x', explicit_db: './my.db', env: {} });
    expect(res.path.endsWith('/x/my.db')).toBe(true);
    expect(res.source).toBe('flag');
  });

  test('uses BEADS_DB from env when set', () => {
    const res = resolveDbPath({ cwd: '/x', env: { BEADS_DB: '/abs/env.db' } });
    expect(res.path).toBe('/abs/env.db');
    expect(res.source).toBe('env');
  });

  test('finds nearest .beads/ui.db walking up', () => {
    const root = mkdtemp();
    const nested = path.join(root, 'a', 'b', 'c');
    fs.mkdirSync(nested, { recursive: true });
    const beads = path.join(root, '.beads');
    fs.mkdirSync(beads);
    const ui_db = path.join(beads, 'ui.db');
    fs.writeFileSync(ui_db, '');

    const found = findNearestBeadsDb(nested);
    expect(found).toBe(ui_db);

    const res = resolveDbPath({ cwd: nested, env: {} });
    expect(res.path).toBe(ui_db);
    expect(res.source).toBe('nearest');
  });

  test('falls back to ~/.beads/default.db when none found', async () => {
    // Mock os.homedir to a deterministic location using spy
    const home = mkdtemp();
    vi.spyOn(os, 'homedir').mockReturnValue(home);
    const mod = await import('./db.js');
    const res = mod.resolveDbPath({ cwd: '/no/db/here', env: {} });
    expect(res.path).toBe(path.join(home, '.beads', 'default.db'));
    expect(res.source).toBe('home-default');
  });

  test('treats ~/.beads/default.db as fallback, not nearest workspace db', async () => {
    const home = mkdtemp();
    const nested = path.join(home, 'projects', 'repo', 'deep');
    fs.mkdirSync(nested, { recursive: true });
    const home_beads = path.join(home, '.beads');
    fs.mkdirSync(home_beads, { recursive: true });
    fs.writeFileSync(path.join(home_beads, 'default.db'), '');
    vi.spyOn(os, 'homedir').mockReturnValue(home);
    const mod = await import('./db.js');

    const res = mod.resolveDbPath({ cwd: nested, env: {} });

    expect(res.path).toBe(path.join(home, '.beads', 'default.db'));
    expect(res.source).toBe('home-default');
  });
});

describe('findNearestBeadsMetadata', () => {
  test('finds nearest metadata walking up', () => {
    const root = mkdtemp();
    const nested = path.join(root, 'a', 'b', 'c');
    fs.mkdirSync(nested, { recursive: true });
    const beads_dir = path.join(root, '.beads');
    fs.mkdirSync(beads_dir, { recursive: true });
    const metadata = path.join(beads_dir, 'metadata.json');
    fs.writeFileSync(metadata, '{}');

    const found = findNearestBeadsMetadata(nested);

    expect(found).toBe(metadata);
  });

  test('returns null when metadata is missing', () => {
    const root = mkdtemp();

    const found = findNearestBeadsMetadata(root);

    expect(found).toBeNull();
  });
});

describe('resolveWorkspaceDatabase', () => {
  test('uses metadata directory for non-SQLite workspace', () => {
    const root = mkdtemp();
    const nested = path.join(root, 'workspace', 'nested');
    fs.mkdirSync(nested, { recursive: true });
    const beads_dir = path.join(root, '.beads');
    fs.mkdirSync(beads_dir, { recursive: true });
    fs.writeFileSync(path.join(beads_dir, 'metadata.json'), '{}');

    const found = resolveWorkspaceDatabase({ cwd: nested, env: {} });

    expect(found.path).toBe(beads_dir);
    expect(found.source).toBe('metadata');
    expect(found.exists).toBe(true);
  });

  test('prefers metadata workspace when home default db exists', async () => {
    const home = mkdtemp();
    const root = path.join(home, 'project');
    const nested = path.join(root, 'workspace', 'nested');
    fs.mkdirSync(nested, { recursive: true });
    const home_beads = path.join(home, '.beads');
    fs.mkdirSync(home_beads, { recursive: true });
    fs.writeFileSync(path.join(home_beads, 'default.db'), '');
    const beads_dir = path.join(root, '.beads');
    fs.mkdirSync(beads_dir, { recursive: true });
    fs.writeFileSync(path.join(beads_dir, 'metadata.json'), '{}');
    vi.spyOn(os, 'homedir').mockReturnValue(home);
    const mod = await import('./db.js');

    const found = mod.resolveWorkspaceDatabase({ cwd: nested, env: {} });

    expect(found.path).toBe(beads_dir);
    expect(found.source).toBe('metadata');
    expect(found.exists).toBe(true);
  });

  test('prefers nearest sqlite database when present', () => {
    const root = mkdtemp();
    const nested = path.join(root, 'workspace', 'nested');
    fs.mkdirSync(nested, { recursive: true });
    const beads_dir = path.join(root, '.beads');
    fs.mkdirSync(beads_dir, { recursive: true });
    fs.writeFileSync(path.join(beads_dir, 'metadata.json'), '{}');
    const sqlite_db = path.join(beads_dir, 'workspace.db');
    fs.writeFileSync(sqlite_db, '');

    const found = resolveWorkspaceDatabase({ cwd: nested, env: {} });

    expect(found.path).toBe(sqlite_db);
    expect(found.source).toBe('nearest');
    expect(found.exists).toBe(true);
  });
});
