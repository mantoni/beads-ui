/**
 * @import { Express, Request, Response } from 'express'
 */
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Create and configure the Express application.
 *
 * @param {{ host: string, port: number, app_dir: string, root_dir: string }} config - Server configuration.
 * @param {{
 *   getRootDir?: () => string,
 *   setRootDir?: (root_dir: string) => void
 * }} [deps]
 * @returns {Express} Configured Express app instance.
 */
export function createApp(config, deps = {}) {
  const app = express();

  const get_root_dir = deps.getRootDir || (() => config.root_dir);
  const set_root_dir = deps.setRootDir || null;

  // Basic hardening and config
  app.disable('x-powered-by');

  // Parse small JSON bodies for local API calls.
  app.use(express.json({ limit: '64kb' }));

  // Health endpoint
  /**
   * @param {Request} _req
   * @param {Response} res
   */
  app.get('/healthz', (_req, res) => {
    res.type('application/json');
    res.status(200).send({ ok: true });
  });

  /**
   * Get the current workspace root directory.
   */
  app.get('/api/workspace', (_req, res) => {
    res.type('application/json');
    res.status(200).send({ ok: true, root_dir: get_root_dir() });
  });

  /**
   * Browse a directory for sub-directories.
   * Query: ?path=<absolute-or-relative>
   */
  app.get('/api/browse', (req, res) => {
    const q_path = /** @type {any} */ (req.query || {}).path;
    const raw_path = typeof q_path === 'string' ? q_path : '';
    const base = get_root_dir();
    const abs_path = raw_path
      ? path.isAbsolute(raw_path)
        ? path.resolve(raw_path)
        : path.resolve(base, raw_path)
      : path.resolve(base);

    /** @type {Array<{ name: string, path: string, has_beads: boolean }>} */
    let entries = [];
    try {
      const st = fs.statSync(abs_path);
      if (!st.isDirectory()) {
        res
          .status(400)
          .type('application/json')
          .send({ ok: false, error: 'path is not a directory' });
        return;
      }
      const dirents = fs.readdirSync(abs_path, { withFileTypes: true });
      /** @type {Array<{ name: string, path: string, has_beads: boolean }>} */
      const dirs = [];
      for (const d of dirents) {
        if (!d.isDirectory()) {
          continue;
        }
        const child_path = path.join(abs_path, d.name);
        let has_beads = false;
        try {
          const beads_dir = path.join(child_path, '.beads');
          const bst = fs.statSync(beads_dir, { throwIfNoEntry: false });
          has_beads = Boolean(bst && bst.isDirectory());
        } catch {
          has_beads = false;
        }
        dirs.push({ name: d.name, path: child_path, has_beads });
      }
      dirs.sort((a, b) => a.name.localeCompare(b.name));
      // Cap to keep payload small.
      entries = dirs.slice(0, 200);
    } catch (err) {
      res
        .status(400)
        .type('application/json')
        .send({
          ok: false,
          error:
            (err && /** @type {any} */ (err).message) ||
            'failed to read directory'
        });
      return;
    }

    const parent = path.dirname(abs_path);

    res.type('application/json');
    res.status(200).send({
      ok: true,
      path: abs_path,
      parent: parent === abs_path ? null : parent,
      entries,
      truncated: entries.length === 200
    });
  });

  /**
   * Switch the active workspace root directory.
   * Body: { root_dir: string }
   */
  app.post('/api/workspace', (req, res) => {
    if (!set_root_dir) {
      res
        .status(500)
        .type('application/json')
        .send({ ok: false, error: 'workspace switching not available' });
      return;
    }
    const body_root = /** @type {any} */ (req.body || {}).root_dir;
    if (typeof body_root !== 'string' || body_root.trim().length === 0) {
      res
        .status(400)
        .type('application/json')
        .send({ ok: false, error: 'root_dir must be a non-empty string' });
      return;
    }
    const base = get_root_dir();
    const next_abs = path.isAbsolute(body_root)
      ? path.resolve(body_root)
      : path.resolve(base, body_root);

    try {
      const st = fs.statSync(next_abs);
      if (!st.isDirectory()) {
        res
          .status(400)
          .type('application/json')
          .send({ ok: false, error: 'root_dir is not a directory' });
        return;
      }
    } catch (err) {
      res
        .status(400)
        .type('application/json')
        .send({
          ok: false,
          error:
            (err && /** @type {any} */ (err).message) ||
            'root_dir not accessible'
        });
      return;
    }

    try {
      set_root_dir(next_abs);
    } catch (err) {
      res
        .status(500)
        .type('application/json')
        .send({
          ok: false,
          error:
            (err && /** @type {any} */ (err).message) ||
            'failed to set root_dir'
        });
      return;
    }

    res.type('application/json');
    res.status(200).send({ ok: true, root_dir: next_abs });
  });

  if (
    !fs.statSync(path.resolve(config.app_dir, 'main.bundle.js'), {
      throwIfNoEntry: false
    })
  ) {
    /**
     * On-demand bundle for the browser using esbuild.
     *
     * @param {Request} _req
     * @param {Response} res
     */
    app.get('/main.bundle.js', async (_req, res) => {
      try {
        const esbuild = await import('esbuild');
        const entry = path.join(config.app_dir, 'main.js');
        const result = await esbuild.build({
          entryPoints: [entry],
          bundle: true,
          format: 'esm',
          platform: 'browser',
          target: 'es2020',
          sourcemap: 'inline',
          minify: false,
          write: false
        });
        const out = result.outputFiles && result.outputFiles[0];
        if (!out) {
          res.status(500).type('text/plain').send('Bundle failed: no output');
          return;
        }
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.send(out.text);
      } catch (err) {
        res
          .status(500)
          .type('text/plain')
          .send('Bundle error: ' + (err && /** @type {any} */ (err).message));
      }
    });
  }

  // Static assets from /app
  app.use(express.static(config.app_dir));

  // Root serves index.html explicitly (even if static would catch it)
  /**
   * @param {Request} _req
   * @param {Response} res
   */
  app.get('/', (_req, res) => {
    const index_path = path.join(config.app_dir, 'index.html');
    res.sendFile(index_path);
  });

  return app;
}
