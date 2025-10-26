import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Resolve runtime configuration for the server.
 * Notes:
 * - `app_dir` is resolved relative to the installed package location.
 * - `root_dir` represents the directory where the process was invoked
 *   (i.e., the current working directory) so DB resolution follows the
 *   caller's context rather than the install location.
 * @returns {{ host: string, port: number, env: string, app_dir: string, root_dir: string, url: string }}
 */
export function getConfig() {
  const this_file = fileURLToPath(new URL(import.meta.url));
  const server_dir = path.dirname(this_file);
  const package_root = path.resolve(server_dir, '..');
  // Always reflect the directory from which the process was started
  const root_dir = process.cwd();

  let port_value = Number.parseInt(process.env.PORT || '', 10);
  if (!Number.isFinite(port_value)) {
    port_value = 3000;
  }

  const host_value = '127.0.0.1';

  return {
    host: host_value,
    port: port_value,
    env: process.env.NODE_ENV ? String(process.env.NODE_ENV) : 'development',
    app_dir: path.resolve(package_root, 'app'),
    root_dir,
    url: `http://${host_value}:${port_value}`
  };
}
