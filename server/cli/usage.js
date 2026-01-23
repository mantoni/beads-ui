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
    '  start       Start the UI server',
    '  stop        Stop the UI server',
    '  restart     Restart the UI server',
    '',
    'Options:',
    '  -h, --help        Show this help message',
    '  -v, --version     Show the CLI version',
    '  -d, --debug       Enable debug logging',
    '      --open        Open the browser after start/restart',
    '      --host <addr> Bind to a specific host (default: 127.0.0.1)',
    '      --port <num>  Bind to a specific port (default: 3000)',
    ''
  ];
  for (const line of lines) {
    out_stream.write(line + '\n');
  }
}
