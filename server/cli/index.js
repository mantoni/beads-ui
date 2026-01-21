import { enableAllDebug } from '../logging.js';
import { handleRestart, handleStart, handleStop, handleList, handleStopAll, handleRestartAll } from './commands.js';
import { handleMigrate } from './migrate.js';
import { handleDiscover } from './discover.js';
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
    if (token === '--force') {
      flags.push('force');
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
      (token === 'start' || token === 'stop' || token === 'restart' || token === 'list' || token === 'stop-all' || token === 'restart-all' || token === 'migrate' || token === 'discover')
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
  if (command === 'list') {
    return await handleList();
  }
  if (command === 'stop-all') {
    return await handleStopAll();
  }
  if (command === 'restart-all') {
    return await handleRestartAll();
  }
  if (command === 'migrate') {
    return await handleMigrate({ force: flags.includes('force') });
  }
  if (command === 'discover') {
    // Get remaining args as search paths
    const search_paths = args.filter(a => !a.startsWith('-') && a !== 'discover');
    return await handleDiscover(search_paths);
  }

  // Unknown command path (should not happen due to parseArgs guard)
  printUsage(process.stdout);
  return 1;
}
