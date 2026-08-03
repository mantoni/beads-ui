import { runBdJson } from './bd.js';
import { debug } from './logging.js';

const log = debug('list-adapters');

/**
 * Build concrete `bd` CLI args for a subscription type + params.
 * Always includes `--json` for parseable output.
 *
 * @param {{ type: string, params?: Record<string, string | number | boolean> }} spec
 * @returns {string[]}
 */
export function mapSubscriptionToBdArgs(spec) {
  const t = String(spec.type);
  switch (t) {
    case 'all-issues': {
      // `--limit 0` = unlimited. Without it, `bd list` caps at its default 50.
      return ['list', '--json', '--tree=false', '--limit', '0'];
    }
    case 'epics': {
      return ['epic', 'status', '--json'];
    }
    case 'blocked-issues': {
      return ['blocked', '--json'];
    }
    case 'status-blocked-issues': {
      // `bd blocked` reports only dependency-blocked issues (whose own status
      // is `open`), so issues whose stored status is `blocked` need their own
      // query. The Board's Blocked lane is the union of both.
      // `--limit 0` = unlimited. Without it, `bd list` caps at its default 50.
      return [
        'list',
        '--json',
        '--tree=false',
        '--status',
        'blocked',
        '--limit',
        '0'
      ];
    }
    case 'ready-issues': {
      return ['ready', '--limit', '1000', '--json'];
    }
    case 'in-progress-issues': {
      // `--limit 0` = unlimited. Without it, `bd list` caps at its default 50.
      return [
        'list',
        '--json',
        '--tree=false',
        '--status',
        'in_progress',
        '--limit',
        '0'
      ];
    }
    case 'closed-issues': {
      return [
        'list',
        '--json',
        '--tree=false',
        '--status',
        'closed',
        '--limit',
        '1000'
      ];
    }
    case 'issue-detail': {
      const p = spec.params || {};
      const id = String(p.id || '').trim();
      if (id.length === 0) {
        throw badRequest('Missing param: params.id');
      }
      return ['show', id, '--json', '--include-dependents'];
    }
    default: {
      throw badRequest(`Unknown subscription type: ${t}`);
    }
  }
}

/**
 * Normalize bd list output to minimal Issue shape used by the registry.
 * - Ensures `id` is a string.
 * - Coerces timestamps to numbers.
 * - `closed_at` defaults to null when missing or invalid.
 *
 * @param {unknown} value
 * @returns {Array<{ id: string, created_at: number, updated_at: number, closed_at: number | null } & Record<string, unknown>>}
 */
export function normalizeIssueList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  /** @type {Array<{ id: string, created_at: number, updated_at: number, closed_at: number | null } & Record<string, unknown>>} */
  const out = [];
  for (const it of value) {
    const id = String(it.id ?? '');
    if (id.length === 0) {
      continue;
    }
    const created_at = parseTimestamp(/** @type {any} */ (it).created_at);
    const updated_at = parseTimestamp(it.updated_at);
    const closed_raw = it.closed_at;
    /** @type {number | null} */
    let closed_at = null;
    if (closed_raw !== undefined && closed_raw !== null) {
      const n = parseTimestamp(closed_raw);
      closed_at = Number.isFinite(n) ? n : null;
    }
    out.push({
      ...it,
      id,
      created_at: Number.isFinite(created_at) ? created_at : 0,
      updated_at: Number.isFinite(updated_at) ? updated_at : 0,
      closed_at
    });
  }
  return out;
}

/**
 * @typedef {Object} FetchListResultSuccess
 * @property {true} ok
 * @property {Array<{ id: string, updated_at: number, closed_at: number | null } & Record<string, unknown>>} items
 */

/**
 * @typedef {Object} FetchListResultFailure
 * @property {false} ok
 * @property {{ code: string, message: string, details?: Record<string, unknown> }} error
 */

/**
 * Execute the mapped `bd` command for a subscription spec and return normalized items.
 * Errors do not throw; they are surfaced as a structured object.
 *
 * @param {{ type: string, params?: Record<string, string | number | boolean> }} spec
 * @param {{ cwd?: string }} [options] - Optional working directory for bd command
 * @returns {Promise<FetchListResultSuccess | FetchListResultFailure>}
 */
export async function fetchListForSubscription(spec, options = {}) {
  /** @type {string[]} */
  let args;
  try {
    args = mapSubscriptionToBdArgs(spec);
  } catch (err) {
    // Surface bad requests (e.g., missing params)
    log('mapSubscriptionToBdArgs failed for %o: %o', spec, err);
    const e = toErrorObject(err);
    return { ok: false, error: e };
  }

  try {
    const res = await runBdJson(args, { cwd: options.cwd });
    if (!res || res.code !== 0 || !('stdoutJson' in res)) {
      log(
        'bd failed for %o (args=%o) code=%s stderr=%s',
        spec,
        args,
        res?.code,
        res?.stderr || ''
      );
      return {
        ok: false,
        error: {
          code: 'bd_error',
          message: String(res?.stderr || 'bd failed'),
          details: { exit_code: res?.code ?? -1 }
        }
      };
    }
    // bd show may return a single object; normalize to an array first
    let raw = Array.isArray(res.stdoutJson)
      ? res.stdoutJson
      : res.stdoutJson && typeof res.stdoutJson === 'object'
        ? [res.stdoutJson]
        : [];

    // Special-case mapping for `epics`: current bd output nests the epic under
    // an `epic` key and exposes counters at the top level. Flatten so that
    // each entry has a top-level `id` and core fields expected by the registry.
    if (String(spec.type) === 'epics') {
      raw = raw.map((it) => {
        if (it && typeof it === 'object' && 'epic' in it) {
          const e = /** @type {any} */ (it).epic || {};
          /** @type {Record<string, unknown>} */
          const flat = {
            // Required minimal fields for registry + client rendering
            id: String(e.id ?? ''),
            title: e.title,
            status: e.status,
            issue_type: e.issue_type || 'epic',
            created_at: e.created_at,
            updated_at: e.updated_at,
            closed_at: e.closed_at ?? null,
            deleted_at: e.deleted_at ?? null,
            // Preserve useful counters from bd output
            total_children: /** @type {any} */ (it).total_children,
            closed_children: /** @type {any} */ (it).closed_children,
            eligible_for_close: /** @type {any} */ (it).eligible_for_close
          };
          return flat;
        }
        return it;
      });
      raw = raw.filter((it) => {
        if (!it || typeof it !== 'object') {
          return false;
        }
        const status =
          typeof (/** @type {any} */ (it).status) === 'string'
            ? /** @type {any} */ (it).status
            : '';
        if (status === 'tombstone') {
          return false;
        }
        const deleted_at = /** @type {any} */ (it).deleted_at;
        if (deleted_at !== undefined && deleted_at !== null) {
          return false;
        }
        return true;
      });
    }

    // Epic children reach the client via `--include-dependents`, which zeroes
    // each child's created_at/updated_at. Merge the real timestamps from a
    // second `bd show <id> --children` call so the epics table can show and
    // sort by them. Gated to epics so regular issue-detail fetches stay single.
    if (String(spec.type) === 'issue-detail' && raw.length > 0) {
      const first = /** @type {any} */ (raw[0]);
      if (
        first &&
        first.issue_type === 'epic' &&
        Array.isArray(first.dependents) &&
        first.dependents.length > 0
      ) {
        const id = String((spec.params && spec.params.id) || first.id || '');
        raw[0] = await enrichEpicDependents(first, id, { cwd: options.cwd });
      }
    }

    const items = normalizeIssueList(raw);
    return { ok: true, items };
  } catch (err) {
    log('bd invocation failed for %o (args=%o): %o', spec, args, err);
    return {
      ok: false,
      error: {
        code: 'bd_error',
        message:
          (err && /** @type {any} */ (err).message) || 'bd invocation failed'
      }
    };
  }
}

/**
 * Create a `bad_request` error object.
 *
 * @param {string} message
 */
function badRequest(message) {
  const e = new Error(message);
  // @ts-expect-error add code
  e.code = 'bad_request';
  return e;
}

/**
 * Normalize arbitrary thrown values to a structured error object.
 *
 * @param {unknown} err
 * @returns {FetchListResultFailure['error']}
 */
function toErrorObject(err) {
  if (err && typeof err === 'object') {
    const any = /** @type {{ code?: unknown, message?: unknown }} */ (err);
    const code = typeof any.code === 'string' ? any.code : 'bad_request';
    const message =
      typeof any.message === 'string' ? any.message : 'Request error';
    return { code, message };
  }
  return { code: 'bad_request', message: 'Request error' };
}

/**
 * Merge real child timestamps into an epic's `dependents`.
 *
 * `bd show <id> --json --include-dependents` returns dependents whose
 * created_at/updated_at are Go's zero time (`0001-01-01`). The real values are
 * available from `bd show <id> --children --json`, whose output is shaped as
 * `{ "<id>": [ {full child record}, ... ] }`. This patches each dependent's
 * created_at/updated_at/closed_at (as epoch-ms) from that map, matching the
 * numeric convention `normalizeIssueList` uses for top-level items. Best-effort:
 * any failure returns the epic unchanged so the table still renders.
 *
 * @param {Record<string, unknown>} epic
 * @param {string} id
 * @param {{ cwd?: string }} [options]
 * @returns {Promise<Record<string, unknown>>}
 */
async function enrichEpicDependents(epic, id, options = {}) {
  const dependents = Array.isArray(epic.dependents) ? epic.dependents : [];
  if (id.length === 0 || dependents.length === 0) {
    return epic;
  }
  /** @type {{ code: number, stdoutJson?: unknown }} */
  let res;
  try {
    res = await runBdJson(['show', id, '--children', '--json'], {
      cwd: options.cwd
    });
  } catch (err) {
    log('enrichEpicDependents failed for %s: %o', id, err);
    return epic;
  }
  if (!res || res.code !== 0 || !('stdoutJson' in res)) {
    return epic;
  }
  const json = /** @type {any} */ (res.stdoutJson);
  const children =
    json && typeof json === 'object' && Array.isArray(json[id]) ? json[id] : [];
  /** @type {Map<string, any>} */
  const by_id = new Map();
  for (const child of children) {
    const cid = String((child && child.id) ?? '');
    if (cid.length > 0) {
      by_id.set(cid, child);
    }
  }
  if (by_id.size === 0) {
    return epic;
  }
  const patched = dependents.map((d) => {
    const child = by_id.get(String((d && /** @type {any} */ (d).id) ?? ''));
    if (!child) {
      return d;
    }
    const closed_raw = child.closed_at;
    /** @type {number | null} */
    let closed_at = null;
    if (closed_raw !== undefined && closed_raw !== null) {
      const n = parseTimestamp(closed_raw);
      closed_at = Number.isFinite(n) ? n : null;
    }
    return {
      .../** @type {any} */ (d),
      created_at: parseTimestamp(child.created_at),
      updated_at: parseTimestamp(child.updated_at),
      closed_at
    };
  });
  return { ...epic, dependents: patched };
}

/**
 * Parse a bd timestamp string to epoch ms using Date.parse.
 * Falls back to numeric coercion when parsing fails.
 *
 * @param {unknown} v
 * @returns {number}
 */
function parseTimestamp(v) {
  if (typeof v === 'string') {
    const ms = Date.parse(v);
    if (Number.isFinite(ms)) {
      return ms;
    }
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof v === 'number') {
    return Number.isFinite(v) ? v : 0;
  }
  return 0;
}
