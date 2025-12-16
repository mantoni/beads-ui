import { enableAllDebug } from '../logging.js';
import { handleRestart, handleStart, handleStop } from './commands.js';
import { printUsage } from './usage.js';

/**
 * Parse argv into a command token, flags, and options.
 *
 * @param {string[]} args
 * @returns {{ command: string | null, flags: string[], options: { host?: string, port?: number } }}
 */
export function parseArgs(args) {
  /** @type {string[]} */
  const flags = [];
  /** @type {string | null} */
  let command = null;
  /** @type {{ host?: string, port?: number }} */
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (token === '--help' || token === '-h') {
      flags.push('help');
      continue;
    }
    if (token === '--debug' || token === '-d') {
      flags.push('debug');
      continue;
    }
    if (token === '--open') {
      flags.push('open');
      continue;
    }
    if (token === '--host' && i + 1 < args.length) {
      options.host = args[++i];
      continue;
    }
    if (token === '--port' && i + 1 < args.length) {
      const port_value = Number.parseInt(args[++i], 10);
      if (Number.isFinite(port_value) && port_value > 0) {
        options.port = port_value;
      }
      continue;
    }
    if (
      !command &&
      (token === 'start' || token === 'stop' || token === 'restart')
    ) {
      command = token;
      continue;
    }
    // Ignore unrecognized tokens for now; future flags may be parsed here.
  }

  return { command, flags, options };
}

/**
 * CLI main entry. Returns an exit code and prints usage on `--help` or errors.
 * No side effects beyond invoking stub handlers.
 *
 * @param {string[]} args
 * @returns {Promise<number>}
 */
export async function main(args) {
  const { command, flags, options } = parseArgs(args);

  const is_debug = flags.includes('debug');
  if (is_debug) {
    enableAllDebug();
  }

  if (flags.includes('help')) {
    printUsage(process.stdout);
    return 0;
  }
  if (!command) {
    printUsage(process.stdout);
    return 1;
  }

  if (command === 'start') {
    /**
     * Default behavior: do NOT open a browser. `--open` explicitly opens.
     */
    const start_options = {
      open: flags.includes('open'),
      is_debug: is_debug || Boolean(process.env.DEBUG),
      host: options.host,
      port: options.port
    };
    return await handleStart(start_options);
  }
  if (command === 'stop') {
    return await handleStop();
  }
  if (command === 'restart') {
    const restart_options = {
      open: flags.includes('open'),
      is_debug: is_debug || Boolean(process.env.DEBUG),
      host: options.host,
      port: options.port
    };
    return await handleRestart(restart_options);
  }

  // Unknown command path (should not happen due to parseArgs guard)
  printUsage(process.stdout);
  return 1;
}
