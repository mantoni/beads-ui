/**
 * Validation helpers for protocol payloads.
 *
 * Provides schema checks for subscription specs and selected mutations.
 */

/**
 * Known subscription types supported by the server.
 * @type {Set<string>}
 */
const SUBSCRIPTION_TYPES = new Set([
  'all-issues',
  'epics',
  'issues-for-epic',
  'blocked-issues',
  'ready-issues',
  'in-progress-issues',
  'closed-issues'
]);

/**
 * Validate a subscribe-list payload and normalize to a SubscriptionSpec.
 * @param {unknown} payload
 * @returns {{ ok: true, id: string, spec: { type: string, params?: Record<string, string|number|boolean> } } | { ok: false, code: 'bad_request', message: string }}
 */
export function validateSubscribeListPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return {
      ok: false,
      code: 'bad_request',
      message: 'payload must be an object'
    };
  }
  const any =
    /** @type {{ id?: unknown, type?: unknown, params?: unknown }} */ (payload);

  const id = typeof any.id === 'string' ? any.id : '';
  if (id.length === 0) {
    return {
      ok: false,
      code: 'bad_request',
      message: 'payload.id must be a non-empty string'
    };
  }

  const type = typeof any.type === 'string' ? any.type : '';
  if (type.length === 0 || !SUBSCRIPTION_TYPES.has(type)) {
    return {
      ok: false,
      code: 'bad_request',
      message: `payload.type must be one of: ${Array.from(SUBSCRIPTION_TYPES).join(', ')}`
    };
  }

  /** @type {Record<string, string|number|boolean> | undefined} */
  let params;
  if (any.params !== undefined) {
    if (
      !any.params ||
      typeof any.params !== 'object' ||
      Array.isArray(any.params)
    ) {
      return {
        ok: false,
        code: 'bad_request',
        message: 'payload.params must be an object when provided'
      };
    }
    params = /** @type {Record<string, string|number|boolean>} */ (any.params);
  }

  // Per-type param schemas
  if (type === 'issues-for-epic') {
    const epic_id = String(params?.epic_id ?? '').trim();
    if (epic_id.length === 0) {
      return {
        ok: false,
        code: 'bad_request',
        message: 'params.epic_id must be a non-empty string'
      };
    }
    params = { epic_id };
  } else if (type === 'closed-issues') {
    if (params && 'since' in params) {
      const since = params.since;
      const n = typeof since === 'number' ? since : Number.NaN;
      if (!Number.isFinite(n) || n < 0) {
        return {
          ok: false,
          code: 'bad_request',
          message: 'params.since must be a non-negative number (epoch ms)'
        };
      }
      params = { since: n };
    } else {
      params = undefined;
    }
  } else {
    // Other types do not accept params
    if (params && Object.keys(params).length > 0) {
      return {
        ok: false,
        code: 'bad_request',
        message: `type ${type} does not accept params`
      };
    }
    params = undefined;
  }

  return { ok: true, id, spec: { type, params } };
}
