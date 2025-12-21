/**
 * Print CLI usage to a stream-like target.
 *
 * @param {{ write: (chunk: string) => any }} out_stream
 */
export function printUsage(out_stream) {
  const lines = [
    'Usage: bdui <command> [options]',
    '',
    'Commands:',
    '  start              Start the UI server',
    '  stop               Stop the UI server',
    '  restart            Restart the UI server',
    '  list               List all running beads-ui instances',
    '  stop-all           Stop all running instances',
    '  discover [paths]   Find beads projects (default: ~/github)',
    '  migrate            Migrate from old global PID system',
    '',
    'Options:',
    '  -h, --help        Show this help message',
    '  -d, --debug       Enable debug logging',
    '      --open        Open the browser after start/restart',
    '      --host <addr> Bind to a specific host (default: 127.0.0.1)',
    '      --port <num>  Bind to a specific port (default: 3000)',
    '',
    'Multi-Project Support:',
    '  Each project with .beads/ gets its own instance.',
    '  Run multiple instances on different ports:',
    '    cd ~/project1 && bdui start --port 4000',
    '    cd ~/project2 && bdui start --port 4001',
    '  Use "bdui list" to see all running instances.',
    '',
    'Migration from older versions:',
    '  1. Run "bdui migrate" to check for old global instances',
    '  2. Run "bdui discover ~/github" to find all projects',
    '  3. Restart instances: cd <project> && bdui start --port 400X',
    ''
  ];
  for (const line of lines) {
    out_stream.write(line + '\n');
  }
}
