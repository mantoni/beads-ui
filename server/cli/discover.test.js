import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { findBeadsProjects, handleDiscover } from './discover.js';

// Mock config module to avoid cosmiconfig filesystem operations in tests
vi.mock('./config.js', () => ({
  getDiscoveryPaths: vi.fn().mockResolvedValue(null),
  getDefaultPortStart: vi.fn().mockResolvedValue(4000),
  loadUserConfig: vi.fn().mockResolvedValue(null)
}));

/** @type {string} */
let tmp_dir;

beforeEach(() => {
  tmp_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bdui-discover-'));
});

afterEach(() => {
  try {
    fs.rmSync(tmp_dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe('findBeadsProjects', () => {
  test('finds project with .beads directory', () => {
    const project_dir = path.join(tmp_dir, 'my-project');
    fs.mkdirSync(path.join(project_dir, '.beads'), { recursive: true });

    const projects = findBeadsProjects(tmp_dir);

    expect(projects).toHaveLength(1);
    expect(projects[0]).toBe(project_dir);
  });

  test('finds multiple projects at same level', () => {
    fs.mkdirSync(path.join(tmp_dir, 'project1', '.beads'), { recursive: true });
    fs.mkdirSync(path.join(tmp_dir, 'project2', '.beads'), { recursive: true });
    fs.mkdirSync(path.join(tmp_dir, 'project3', '.beads'), { recursive: true });

    const projects = findBeadsProjects(tmp_dir);

    expect(projects).toHaveLength(3);
    expect(projects).toContain(path.join(tmp_dir, 'project1'));
    expect(projects).toContain(path.join(tmp_dir, 'project2'));
    expect(projects).toContain(path.join(tmp_dir, 'project3'));
  });

  test('finds nested projects', () => {
    fs.mkdirSync(path.join(tmp_dir, 'org1', 'repo1', '.beads'), {
      recursive: true
    });
    fs.mkdirSync(path.join(tmp_dir, 'org2', 'repo2', '.beads'), {
      recursive: true
    });

    const projects = findBeadsProjects(tmp_dir);

    expect(projects).toHaveLength(2);
    expect(projects).toContain(path.join(tmp_dir, 'org1', 'repo1'));
    expect(projects).toContain(path.join(tmp_dir, 'org2', 'repo2'));
  });

  test('skips node_modules directories', () => {
    fs.mkdirSync(
      path.join(tmp_dir, 'project', '.beads'),
      { recursive: true }
    );
    fs.mkdirSync(
      path.join(tmp_dir, 'project', 'node_modules', 'some-package', '.beads'),
      { recursive: true }
    );

    const projects = findBeadsProjects(tmp_dir);

    expect(projects).toHaveLength(1);
    expect(projects[0]).toBe(path.join(tmp_dir, 'project'));
  });

  test('skips .git directories', () => {
    fs.mkdirSync(path.join(tmp_dir, 'project', '.beads'), {
      recursive: true
    });
    fs.mkdirSync(path.join(tmp_dir, 'project', '.git', 'hooks', '.beads'), {
      recursive: true
    });

    const projects = findBeadsProjects(tmp_dir);

    expect(projects).toHaveLength(1);
    expect(projects[0]).toBe(path.join(tmp_dir, 'project'));
  });

  test('skips hidden directories except .beads', () => {
    fs.mkdirSync(path.join(tmp_dir, 'project', '.beads'), {
      recursive: true
    });
    fs.mkdirSync(path.join(tmp_dir, '.hidden', 'repo', '.beads'), {
      recursive: true
    });

    const projects = findBeadsProjects(tmp_dir);

    // Should find 'project' but skip '.hidden' directory tree
    expect(projects).toHaveLength(1);
    expect(projects[0]).toBe(path.join(tmp_dir, 'project'));
  });

  test('skips dist and build directories', () => {
    fs.mkdirSync(path.join(tmp_dir, 'project', '.beads'), {
      recursive: true
    });
    fs.mkdirSync(path.join(tmp_dir, 'project', 'dist', '.beads'), {
      recursive: true
    });
    fs.mkdirSync(path.join(tmp_dir, 'project', 'build', '.beads'), {
      recursive: true
    });

    const projects = findBeadsProjects(tmp_dir);

    expect(projects).toHaveLength(1);
    expect(projects[0]).toBe(path.join(tmp_dir, 'project'));
  });

  test('does not recurse into beads projects (avoids nested detection)', () => {
    fs.mkdirSync(path.join(tmp_dir, 'parent', '.beads'), {
      recursive: true
    });
    fs.mkdirSync(path.join(tmp_dir, 'parent', 'child', '.beads'), {
      recursive: true
    });

    const projects = findBeadsProjects(tmp_dir);

    // Should find 'parent' and stop, not find 'child'
    expect(projects).toHaveLength(1);
    expect(projects[0]).toBe(path.join(tmp_dir, 'parent'));
  });

  test('respects max_depth parameter', () => {
    fs.mkdirSync(path.join(tmp_dir, 'level1', '.beads'), {
      recursive: true
    });
    fs.mkdirSync(path.join(tmp_dir, 'a', 'level2', '.beads'), {
      recursive: true
    });
    fs.mkdirSync(path.join(tmp_dir, 'a', 'b', 'level3', '.beads'), {
      recursive: true
    });
    fs.mkdirSync(path.join(tmp_dir, 'a', 'b', 'c', 'level4', '.beads'), {
      recursive: true
    });
    fs.mkdirSync(
      path.join(tmp_dir, 'a', 'b', 'c', 'd', 'level5', '.beads'),
      { recursive: true }
    );

    const projects = findBeadsProjects(tmp_dir, 3);

    // Should find up to depth 3 only
    expect(projects.length).toBeLessThanOrEqual(4);
    expect(projects).toContain(path.join(tmp_dir, 'level1'));
    expect(projects).toContain(path.join(tmp_dir, 'a', 'level2'));
    expect(projects).toContain(path.join(tmp_dir, 'a', 'b', 'level3'));
  });

  test('returns empty array for non-existent path', () => {
    const projects = findBeadsProjects('/path/does/not/exist');
    expect(projects).toEqual([]);
  });

  test('handles permission errors gracefully', () => {
    const restricted = path.join(tmp_dir, 'restricted');
    fs.mkdirSync(restricted);
    fs.chmodSync(restricted, 0o000);

    const projects = findBeadsProjects(tmp_dir);

    // Should not throw, returns empty array
    expect(Array.isArray(projects)).toBe(true);

    // Cleanup
    fs.chmodSync(restricted, 0o755);
  });

  test('ignores .beads files (not directories)', () => {
    const project_dir = path.join(tmp_dir, 'project');
    fs.mkdirSync(project_dir);
    fs.writeFileSync(path.join(project_dir, '.beads'), 'not a directory');

    const projects = findBeadsProjects(tmp_dir);

    expect(projects).toEqual([]);
  });
});

describe('handleDiscover', () => {
  let console_log_spy;
  let console_error_spy;
  let tmp_home;
  let prev_home;

  beforeEach(() => {
    console_log_spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    console_error_spy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    tmp_home = fs.mkdtempSync(path.join(os.tmpdir(), 'bdui-home-'));
    prev_home = process.env.HOME;
    process.env.HOME = tmp_home;
  });

  afterEach(() => {
    console_log_spy.mockRestore();
    console_error_spy.mockRestore();
    process.env.HOME = prev_home;
    try {
      fs.rmSync(tmp_home, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  test('discovers projects in specified paths', async () => {
    fs.mkdirSync(path.join(tmp_dir, 'proj1', '.beads'), { recursive: true });
    fs.mkdirSync(path.join(tmp_dir, 'proj2', '.beads'), { recursive: true });

    const code = await handleDiscover([tmp_dir]);

    expect(code).toBe(0);
    expect(console_log_spy).toHaveBeenCalledWith(
      expect.stringContaining('Found 2 project(s)')
    );
    expect(console_log_spy).toHaveBeenCalledWith(
      expect.stringContaining('proj1')
    );
    expect(console_log_spy).toHaveBeenCalledWith(
      expect.stringContaining('proj2')
    );
  });

  test('returns 0 when no projects found', async () => {
    const code = await handleDiscover([tmp_dir]);

    expect(code).toBe(0);
    expect(console_log_spy).toHaveBeenCalledWith(
      expect.stringContaining('No beads projects found')
    );
  });

  test('uses configured paths when no args provided', async () => {
    const { getDiscoveryPaths } = await import('./config.js');
    vi.mocked(getDiscoveryPaths).mockResolvedValueOnce([tmp_dir]);

    fs.mkdirSync(path.join(tmp_dir, 'repo', '.beads'), { recursive: true });

    const code = await handleDiscover([]);

    expect(code).toBe(0);
    expect(console_log_spy).toHaveBeenCalledWith(
      expect.stringContaining('Using discovery paths from')
    );
    expect(console_log_spy).toHaveBeenCalledWith(
      expect.stringContaining('Found 1 project(s)')
    );
  });

  test('returns 1 when no paths provided and none configured', async () => {
    const code = await handleDiscover([]);

    expect(code).toBe(1);
    expect(console_error_spy).toHaveBeenCalledWith(
      expect.stringContaining('No search paths provided and none configured')
    );
    expect(console_log_spy).toHaveBeenCalledWith(
      expect.stringContaining('BDUI_DISCOVERY_PATHS')
    );
  });

  test('searches multiple paths', async () => {
    const path1 = path.join(tmp_dir, 'work');
    const path2 = path.join(tmp_dir, 'personal');

    fs.mkdirSync(path.join(path1, 'proj1', '.beads'), { recursive: true });
    fs.mkdirSync(path.join(path2, 'proj2', '.beads'), { recursive: true });

    const code = await handleDiscover([path1, path2]);

    expect(code).toBe(0);
    expect(console_log_spy).toHaveBeenCalledWith(
      expect.stringContaining('Searching ' + path1)
    );
    expect(console_log_spy).toHaveBeenCalledWith(
      expect.stringContaining('Searching ' + path2)
    );
    expect(console_log_spy).toHaveBeenCalledWith(
      expect.stringContaining('Discovered beads projects (2)')
    );
  });

  test('handles permission errors during discovery', async () => {
    const restricted = path.join(tmp_dir, 'restricted');
    fs.mkdirSync(restricted);
    fs.chmodSync(restricted, 0o000);

    const code = await handleDiscover([tmp_dir]);

    // Should not crash
    expect(code).toBe(0);

    // Cleanup
    fs.chmodSync(restricted, 0o755);
  });
});
