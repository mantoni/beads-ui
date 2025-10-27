/**
 * @import { Express, Request, Response } from 'express'
 */
import express from 'express';
import path from 'node:path';

/**
 * Create and configure the Express application.
 *
 * @param {{ host: string, port: number, env: string, app_dir: string, root_dir: string }} config - Server configuration.
 * @returns {Express} Configured Express app instance.
 */
export function createApp(config) {
  const app = express();

  // Basic hardening and config
  app.disable('x-powered-by');

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
   * On-demand bundle for the browser using esbuild.
   * Note: esbuild is loaded lazily so tests don't require it to be installed.
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
        sourcemap: config.env === 'production' ? false : 'inline',
        minify: config.env === 'production',
        write: false
      });
      const out = result.outputFiles && result.outputFiles[0];
      if (!out) {
        res.status(500).type('text/plain').send('Bundle failed: no output');
        return;
      }
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      if (config.env !== 'production') {
        res.setHeader('Cache-Control', 'no-store');
      }
      res.send(out.text);
    } catch (err) {
      res
        .status(500)
        .type('text/plain')
        .send('Bundle error: ' + (err && /** @type {any} */ (err).message));
    }
  });

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
