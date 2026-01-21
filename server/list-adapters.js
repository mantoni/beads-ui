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
      return ['list', '--json'];
    }
    case 'epics': {
      return ['list', '--type', 'epic', '--status', 'all', '--json'];
    }
    case 'blocked-issues': {
      return ['blocked', '--json'];
    }
    case 'ready-issues': {
      return ['ready', '--limit', '1000', '--json'];
    }
    case 'in-progress-issues': {
      return ['list', '--json', '--status', 'in_progress'];
    }
    case 'closed-issues': {
      return ['list', '--json', '--status', 'closed'];
    }
    case 'issue-detail': {
      const p = spec.params || {};
      const id = String(p.id || '').trim();
      if (id.length === 0) {
        throw badRequest('Missing param: params.id');
      }
      return ['show', id, '--json'];
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

    // For epics, merge parent info and counters into the list data
    if (String(spec.type) === 'epics') {
      // Run both merges in parallel for better performance
      const [with_parents, counters_data] = await Promise.all([
        mergeEpicParents(raw, options),
        mergeEpicCounters(raw, options)
      ]);
      // Combine: use parent info from mergeEpicParents, counters from mergeEpicCounters
      const counters_map = new Map();
      for (const e of counters_data) {
        const id = String(e?.id || '');
        if (e.total_children !== undefined || e.closed_children !== undefined) {
          counters_map.set(id, {
            total_children: e.total_children,
            closed_children: e.closed_children
          });
        }
      }
      raw = with_parents.map((e) => {
        const id = String(e?.id || '');
        const counters = counters_map.get(id);
        if (counters) {
          return { ...e, ...counters };
        }
        return e;
      });
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
 * Merge parent info from `bd show` into epic list data.
 * This provides the parent field for proper hierarchy display.
 *
 * @param {any[]} epics - Epic list from `bd list --type epic`
 * @param {{ cwd?: string }} options
 * @returns {Promise<any[]>}
 */
async function mergeEpicParents(epics, options) {
  try {
    // Fetch parent info for all epics in parallel
    const parent_promises = epics.map(async (epic) => {
      const id = String(epic?.id || '');
      if (!id) return { id, parent: null };
      try {
        const res = await runBdJson(['show', id, '--json'], { cwd: options.cwd });
        if (res && res.code === 0 && res.stdoutJson) {
          // bd show returns an array with one element
          const detail = Array.isArray(res.stdoutJson)
            ? res.stdoutJson[0]
            : res.stdoutJson;
          return { id, parent: detail?.parent || null };
        }
      } catch {
        // ignore individual failures
      }
      return { id, parent: null };
    });
    const parent_results = await Promise.all(parent_promises);
    // Build a map of parent by epic id
    /** @type {Map<string, string | null>} */
    const parents = new Map();
    for (const { id, parent } of parent_results) {
      parents.set(id, parent);
    }
    // Merge parent info into epic list
    return epics.map((e) => {
      const id = String(e?.id || '');
      const parent = parents.get(id);
      if (parent) {
        return { ...e, parent };
      }
      return e;
    });
  } catch {
    return epics; // Fall back on error
  }
}

/**
 * Merge epic counters from `bd epic status` into epic list data.
 * This provides total_children and closed_children for progress display.
 *
 * @param {any[]} epics - Epic list from `bd list --type epic`
 * @param {{ cwd?: string }} options
 * @returns {Promise<any[]>}
 */
async function mergeEpicCounters(epics, options) {
  try {
    const status_res = await runBdJson(['epic', 'status', '--json'], {
      cwd: options.cwd
    });
    if (
      !status_res ||
      status_res.code !== 0 ||
      !Array.isArray(status_res.stdoutJson)
    ) {
      return epics; // Fall back to list data without counters
    }
    // Build a map of counters by epic id
    /** @type {Map<string, { total_children: number, closed_children: number }>} */
    const counters = new Map();
    for (const item of status_res.stdoutJson) {
      const epic = item?.epic;
      if (epic && typeof epic.id === 'string') {
        counters.set(epic.id, {
          total_children: Number(item.total_children) || 0,
          closed_children: Number(item.closed_children) || 0
        });
      }
    }
    // Merge counters into epic list
    return epics.map((e) => {
      const id = String(e?.id || '');
      const c = counters.get(id);
      if (c) {
        return { ...e, total_children: c.total_children, closed_children: c.closed_children };
      }
      // For closed epics without counters, show as fully complete
      if (String(e?.status || '').toLowerCase() === 'closed') {
        const total = Number(e?.dependent_count) || 0;
        return { ...e, total_children: total, closed_children: total };
      }
      return e;
    });
  } catch {
    return epics; // Fall back on error
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
