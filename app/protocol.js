/**
 * Protocol definitions for beads-ui WebSocket communication.
 *
 * Conventions
 * - All messages are JSON objects.
 * - Client → Server uses RequestEnvelope.
 * - Server → Client uses ReplyEnvelope.
 * - Every request is correlated by `id` in replies.
 * - Server can also send unsolicited events (e.g., subscription `snapshot`).
 */

/** @typedef {'list-issues'|'update-status'|'edit-text'|'update-priority'|'create-issue'|'list-ready'|'dep-add'|'dep-remove'|'dep-tree'|'epic-status'|'update-assignee'|'label-add'|'label-remove'|'subscribe-list'|'unsubscribe-list'|'snapshot'|'upsert'|'delete'} MessageType */

/**
 * @typedef {Object} RequestEnvelope
 * @property {string} id - Unique id to correlate request/response.
 * @property {MessageType} type - Message type.
 * @property {unknown} [payload] - Message payload.
 */

/**
 * @typedef {Object} ErrorObject
 * @property {string} code - Stable error code.
 * @property {string} message - Human-readable message.
 * @property {unknown} [details] - Optional extra info for debugging.
 */

/**
 * @typedef {Object} ReplyEnvelope
 * @property {string} id - Correlates to the originating request.
 * @property {boolean} ok - True when request succeeded; false on error.
 * @property {MessageType} type - Echoes request type (or event type).
 * @property {unknown} [payload] - Response payload.
 * @property {ErrorObject} [error] - Present when ok=false.
 */

/** @type {MessageType[]} */
export const MESSAGE_TYPES = /** @type {const} */ ([
  'list-issues',
  'update-status',
  'edit-text',
  'update-priority',
  'create-issue',
  'list-ready',
  'dep-add',
  'dep-remove',
  'dep-tree',
  'epic-status',
  'update-assignee',
  'label-add',
  'label-remove',
  'subscribe-list',
  'unsubscribe-list',
  // vNext per-subscription full-issue push events
  'snapshot',
  'upsert',
  'delete'
]);

/**
 * Generate a lexically sortable request id.
 *
 * @returns {string}
 */
export function nextId() {
  const now = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${now}-${rand}`;
}

/**
 * Create a request envelope.
 *
 * @param {MessageType} type - Message type.
 * @param {unknown} [payload] - Message payload.
 * @param {string} [id] - Optional id; generated if omitted.
 * @returns {RequestEnvelope}
 */
export function makeRequest(type, payload, id = nextId()) {
  return { id, type, payload };
}

/**
 * Create a successful reply envelope for a given request.
 *
 * @param {RequestEnvelope} req - Original request.
 * @param {unknown} [payload] - Reply payload.
 * @returns {ReplyEnvelope}
 */
export function makeOk(req, payload) {
  return { id: req.id, ok: true, type: req.type, payload };
}

/**
 * Create an error reply envelope for a given request.
 *
 * @param {RequestEnvelope} req - Original request.
 * @param {string} code
 * @param {string} message
 * @param {unknown} [details]
 * @returns {ReplyEnvelope}
 */
export function makeError(req, code, message, details) {
  return {
    id: req.id,
    ok: false,
    type: req.type,
    error: { code, message, details }
  };
}

/**
 * Check if a value is a plain object.
 *
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Type guard for MessageType values.
 *
 * @param {unknown} value
 * @returns {value is MessageType}
 */
export function isMessageType(value) {
  return (
    typeof value === 'string' &&
    MESSAGE_TYPES.includes(/** @type {MessageType} */ (value))
  );
}

/**
 * Type guard for RequestEnvelope.
 *
 * @param {unknown} value
 * @returns {value is RequestEnvelope}
 */
export function isRequest(value) {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === 'string' &&
    typeof value.type === 'string' &&
    (value.payload === undefined || 'payload' in value)
  );
}

/**
 * Type guard for ReplyEnvelope.
 *
 * @param {unknown} value
 * @returns {value is ReplyEnvelope}
 */
export function isReply(value) {
  if (!isRecord(value)) {
    return false;
  }
  if (
    typeof value.id !== 'string' ||
    typeof value.ok !== 'boolean' ||
    !isMessageType(value.type)
  ) {
    return false;
  }
  if (value.ok === false) {
    const err = value.error;
    if (
      !isRecord(err) ||
      typeof err.code !== 'string' ||
      typeof err.message !== 'string'
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Normalize and validate an incoming JSON value as a RequestEnvelope.
 * Throws a user-friendly error if invalid.
 *
 * @param {unknown} json
 * @returns {RequestEnvelope}
 */
export function decodeRequest(json) {
  if (!isRequest(json)) {
    throw new Error('Invalid request envelope');
  }
  return json;
}

/**
 * Normalize and validate an incoming JSON value as a ReplyEnvelope.
 *
 * @param {unknown} json
 * @returns {ReplyEnvelope}
 */
export function decodeReply(json) {
  if (!isReply(json)) {
    throw new Error('Invalid reply envelope');
  }
  return json;
}
