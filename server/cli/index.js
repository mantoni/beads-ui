import { handleRestart, handleStart, handleStop } from './commands.js';
import { printUsage } from './usage.js';

/**
 * Parse argv into a command token and flags.
 * @param {string[]} args
 * @returns {{ command: string | null, flags: string[] }}
 */
export function parseArgs(args) {
  /** @type {string[]} */
  const flags = [];
  /** @type {string | null} */
  let command = null;

  for (const token of args) {
    if (token === '--help' || token === '-h') {
      flags.push('help');
      continue;
    }
    if (token === '--open') {
      flags.push('open');
      continue;
    }
    if (token === '--no-open') {
      flags.push('no-open');
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

  return { command, flags };
}

/**
 * CLI main entry. Returns an exit code and prints usage on `--help` or errors.
 * No side effects beyond invoking stub handlers.
 * @param {string[]} args
 * @returns {Promise<number>}
 */
export async function main(args) {
  const { command, flags } = parseArgs(args);

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
     * Default behavior: do NOT open a browser.
     * `--open` explicitly opens, overriding env/config; `--no-open` forces closed.
     */
    const options = {
      no_open: true
    };

    const has_open = flags.includes('open');
    const has_no_open = flags.includes('no-open');
    const env_no_open = String(process.env.BDUI_NO_OPEN || '') === '1';

    if (has_open) {
      options.no_open = false;
    } else if (has_no_open) {
      options.no_open = true;
    } else if (env_no_open) {
      options.no_open = true;
    }
    return await handleStart(options);
  }
  if (command === 'stop') {
    return await handleStop();
  }
  if (command === 'restart') {
    const options = { no_open: true };
    const has_open = flags.includes('open');
    const has_no_open = flags.includes('no-open');
    const env_no_open = String(process.env.BDUI_NO_OPEN || '') === '1';

    if (has_open) {
      options.no_open = false;
    } else if (has_no_open) {
      options.no_open = true;
    } else if (env_no_open) {
      options.no_open = true;
    }
    return await handleRestart(options);
  }

  // Unknown command path (should not happen due to parseArgs guard)
  printUsage(process.stdout);
  return 1;
}
