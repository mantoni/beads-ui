import { spawn } from 'node:child_process';
import { resolveDbPath } from './db.js';

/**
 * Resolve the bd executable path.
 * @returns {string}
 */
export function getBdBin() {
  const env_value = process.env.BD_BIN;
  if (env_value && env_value.length > 0) {
    return env_value;
  }
  return 'bd';
}

/**
 * Run the `bd` CLI with provided arguments.
 * Shell is not used to avoid injection; args must be pre-split.
 * @param {string[]} args - Arguments to pass (e.g., ["list", "--json"]).
 * @param {{ cwd?: string, env?: Record<string, string | undefined>, timeout_ms?: number }} [options]
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
export function runBd(args, options = {}) {
  const bin = getBdBin();
  const spawn_opts = {
    cwd: options.cwd || process.cwd(),
    env: options.env ? options.env : process.env,
    shell: false
  };

  // Ensure a consistent DB by injecting --db if missing, following beads precedence.
  /** @type {string[]} */
  const finalArgs = withDbArg(args, spawn_opts.cwd, spawn_opts.env);

  return new Promise((resolve) => {
    const child = spawn(bin, finalArgs, spawn_opts);

    /** @type {string[]} */
    const out_chunks = [];
    /** @type {string[]} */
    const err_chunks = [];

    if (child.stdout) {
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        out_chunks.push(String(chunk));
      });
    }
    if (child.stderr) {
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk) => {
        err_chunks.push(String(chunk));
      });
    }

    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer;
    if (options.timeout_ms && options.timeout_ms > 0) {
      timer = setTimeout(() => {
        child.kill('SIGKILL');
      }, options.timeout_ms);
      timer.unref?.();
    }

    /**
     * @param {number | string | null} code
     */
    const finish = (code) => {
      if (timer) {
        clearTimeout(timer);
      }
      resolve({
        code: Number(code || 0),
        stdout: out_chunks.join(''),
        stderr: err_chunks.join('')
      });
    };

    child.on('error', () => {
      // Treat spawn error as an immediate non-zero exit with captured stderr message.
      finish(127);
    });
    child.on('close', (code) => {
      finish(code);
    });
  });
}

/**
 * Run `bd` and parse JSON from stdout if exit code is 0.
 * @param {string[]} args - Must include flags that cause JSON to be printed (e.g., `--json`).
 * @param {{ cwd?: string, env?: Record<string, string | undefined>, timeout_ms?: number }} [options]
 * @returns {Promise<{ code: number, stdoutJson?: unknown, stderr?: string }>}
 */
export async function runBdJson(args, options = {}) {
  const result = await runBd(args, options);
  if (result.code !== 0) {
    return { code: result.code, stderr: result.stderr };
  }
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(result.stdout || 'null');
  } catch {
    return { code: 0, stderr: 'Invalid JSON from bd' };
  }
  return { code: 0, stdoutJson: parsed };
}

/**
 * Add a resolved "--db <path>" pair to args when none present.
 * @param {string[]} args
 * @param {string} cwd
 * @param {Record<string, string | undefined>} env
 * @returns {string[]}
 */
function withDbArg(args, cwd, env) {
  if (args.includes('--db')) {
    return args.slice();
  }
  const resolved = resolveDbPath({ cwd, env });
  return ['--db', resolved.path, ...args];
}
