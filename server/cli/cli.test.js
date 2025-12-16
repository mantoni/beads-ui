import { beforeEach, describe, expect, test, vi } from 'vitest';
import * as logging from '../logging.js';
import * as commands from './commands.js';
import { main, parseArgs } from './index.js';

vi.mock('../logging.js', () => ({
  enableAllDebug: vi.fn(),
  debug: () => () => {}
}));

vi.mock('./commands.js', () => ({
  handleStart: vi.fn().mockResolvedValue(0),
  handleStop: vi.fn().mockResolvedValue(0),
  handleRestart: vi.fn().mockResolvedValue(0)
}));

/** @type {import('vitest').MockInstance} */
let write_mock;

beforeEach(() => {
  write_mock = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

describe('parseArgs', () => {
  test('returns help flag when -h or --help present', () => {
    const r1 = parseArgs(['-h']);
    const r2 = parseArgs(['--help']);

    expect(r1.flags.includes('help')).toBe(true);
    expect(r2.flags.includes('help')).toBe(true);
  });

  test('returns command token when valid', () => {
    expect(parseArgs(['start']).command).toBe('start');
    expect(parseArgs(['stop']).command).toBe('stop');
    expect(parseArgs(['restart']).command).toBe('restart');
  });

  test('recognizes --debug and -d flags', () => {
    const r1 = parseArgs(['--debug']);
    const r2 = parseArgs(['-d']);

    expect(r1.flags.includes('debug')).toBe(true);
    expect(r2.flags.includes('debug')).toBe(true);
  });
  test('recognizes --open flag', () => {
    const r = parseArgs(['start', '--open']);

    expect(r.flags.includes('open')).toBe(true);
  });

  test('parses --host option', () => {
    const r = parseArgs(['start', '--host', '0.0.0.0']);

    expect(r.options.host).toBe('0.0.0.0');
  });

  test('parses --port option', () => {
    const r = parseArgs(['start', '--port', '8080']);

    expect(r.options.port).toBe(8080);
  });

  test('ignores invalid --port value', () => {
    const r = parseArgs(['start', '--port', 'abc']);

    expect(r.options.port).toBeUndefined();
  });
});

describe('main', () => {
  test('prints usage and exits 0 on --help', async () => {
    const code = await main(['--help']);

    expect(code).toBe(0);
    expect(write_mock).toHaveBeenCalled();
  });

  test('enables debug when --debug passed', async () => {
    const spy = vi.spyOn(logging, 'enableAllDebug');

    await main(['--debug', '--help']);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('prints usage and exits 1 on no command', async () => {
    const code = await main([]);

    expect(code).toBe(1);
    expect(write_mock).toHaveBeenCalled();
  });

  test('dispatches to start handler', async () => {
    const code = await main(['start']);

    expect(code).toBe(0);
    expect(commands.handleStart).toHaveBeenCalledTimes(1);
  });

  test('propagates --open to start handler', async () => {
    await main(['start', '--open']);

    expect(commands.handleStart).toHaveBeenCalledWith({
      open: true,
      is_debug: false,
      host: undefined,
      port: undefined
    });
  });

  test('propagates --host and --port to start handler', async () => {
    await main(['start', '--host', '0.0.0.0', '--port', '8080']);

    expect(commands.handleStart).toHaveBeenCalledWith({
      open: false,
      is_debug: false,
      host: '0.0.0.0',
      port: 8080
    });
  });

  test('help lists --open', async () => {
    const write_spy = write_mock;
    write_spy.mockClear();

    await main(['--help']);

    const output = write_spy.mock.calls.map((c) => String(c[0])).join('');
    expect(output.includes('--open')).toBe(true);
  });

  test('dispatches to stop handler', async () => {
    const code = await main(['stop']);

    expect(code).toBe(0);
    expect(commands.handleStop).toHaveBeenCalledTimes(1);
  });

  test('dispatches to restart handler', async () => {
    const code = await main(['restart']);

    expect(code).toBe(0);
    expect(commands.handleRestart).toHaveBeenCalledTimes(1);
    expect(commands.handleRestart).toHaveBeenCalledWith({
      open: false,
      is_debug: false,
      host: undefined,
      port: undefined
    });
  });

  test('propagates --open to restart handler', async () => {
    await main(['restart', '--open']);

    expect(commands.handleRestart).toHaveBeenCalledWith({
      open: true,
      is_debug: false,
      host: undefined,
      port: undefined
    });
  });

  test('propagates --host and --port to restart handler', async () => {
    await main(['restart', '--host', '0.0.0.0', '--port', '9000']);

    expect(commands.handleRestart).toHaveBeenCalledWith({
      open: false,
      is_debug: false,
      host: '0.0.0.0',
      port: 9000
    });
  });

  test('unknown command prints usage and exits 1', async () => {
    const code = await main(['unknown']);

    expect(code).toBe(1);
    expect(write_mock).toHaveBeenCalled();
  });
});
