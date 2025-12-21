import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Resolve runtime configuration for the server.
 * Notes:
 * - `app_dir` is resolved relative to the installed package location.
 * - `root_dir` represents the directory where the process was invoked
 * (i.e., the current working directory) so DB resolution follows the
 * caller's context rather than the install location.
 * - `project_name` is derived from the directory name for display purposes.
 *
 * @returns {{ host: string, port: number, app_dir: string, root_dir: string, project_name: string, url: string }}
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

  const host_env = process.env.HOST;
  const host_value = host_env && host_env.length > 0 ? host_env : '127.0.0.1';

  // Extract project name from directory (for multi-project identification)
  const project_name = path.basename(root_dir);

  return {
    host: host_value,
    port: port_value,
    app_dir: path.resolve(package_root, 'app'),
    root_dir,
    project_name,
    url: `http://${host_value}:${port_value}`
  };
}
