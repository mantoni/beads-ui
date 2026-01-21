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
    '  restart-all        Restart all registered instances',
    '  discover [paths]   Find beads projects in directory tree',
    '  migrate            Migrate from old global PID system',
    '',
    'Options:',
    '  -h, --help        Show this help message',
    '  -d, --debug       Enable debug logging',
    '      --open        Open the browser after start/restart',
    '      --host <addr> Bind to a specific host (default: 127.0.0.1)',
    '      --port <num>  Bind to a specific port (default: 3000)',
    '',
    'Configuration:',
    '  Set BDUI_DISCOVERY_PATHS or create ~/.bduirc for defaults.',
    '  See CONFIGURATION.md for details.',
    '',
    'Multi-Project Support:',
    '  Each project with .beads/ gets its own instance.',
    '  Run multiple instances on different ports:',
    '    cd ~/project1 && bdui start --port 4000',
    '    cd ~/project2 && bdui start --port 4001',
    '  Use "bdui list" to see all running instances.',
    '',
    'Examples:',
    '  bdui discover ~/code ~/projects    # Find all beads projects',
    '  bdui list                           # Show running instances',
    '  bdui stop-all                       # Stop all instances',
    ''
  ];
  for (const line of lines) {
    out_stream.write(line + '\n');
  }
}
