/**
 * Agent-lease and workgraph lifecycle helpers.
 *
 * Agent control planes (e.g. pi-workgraph) store a harness-neutral lease in
 * three reserved issue-metadata keys — `lease_holder`, `lease_epoch`,
 * `lease_expires_at` — and their lifecycle phase in `workgraph_*` keys.
 * This UI treats those keys as read-only: it renders them and guards status
 * writes against live leases, but never writes them itself.
 */

/** Lifecycle phases a workgraph control plane may stamp. */
const KNOWN_PHASES = new Set([
  'draft',
  'ready',
  'planning',
  'implementing',
  'judging',
  'revising',
  'verifying',
  'accepted',
  'escalated'
]);

/**
 * @typedef {{
 *   phase: string | null,
 *   risk_tier: string | null,
 *   workflow_class: string | null,
 *   lease_holder: string | null,
 *   lease_expires_at_ms: number | null
 * }} WorkgraphMeta
 */

/**
 * Read workgraph/lease metadata off an issue, normalizing value types.
 * Writers stamp metadata as strings but bd may round-trip numbers, so every
 * value is coerced defensively.
 *
 * @param {{ metadata?: Record<string, unknown> | null }} issue
 * @returns {WorkgraphMeta}
 */
export function workgraphMeta(issue) {
  const md =
    issue && typeof issue.metadata === 'object' && issue.metadata !== null
      ? issue.metadata
      : {};
  const phase_raw = asString(md['workgraph_phase']);
  const expires_raw = asString(md['lease_expires_at']);
  /** @type {number | null} */
  let expires_ms = null;
  if (expires_raw) {
    const parsed = Date.parse(expires_raw);
    expires_ms = Number.isFinite(parsed) ? parsed : null;
  }
  return {
    phase: phase_raw && KNOWN_PHASES.has(phase_raw) ? phase_raw : null,
    risk_tier: asString(md['workgraph_risk_tier']),
    workflow_class: asString(md['workgraph_workflow_class']),
    lease_holder: asString(md['lease_holder']),
    lease_expires_at_ms: expires_ms
  };
}

/**
 * Whether the issue carries a lease that has not expired yet. Issues with a
 * holder but a past (or unparseable) expiry are treated as not held — an
 * expired lease is reclaimable by convention.
 *
 * @param {{ metadata?: Record<string, unknown> | null }} issue
 * @param {number} [now_ms]
 */
export function hasLiveLease(issue, now_ms = Date.now()) {
  const meta = workgraphMeta(issue);
  return (
    meta.lease_holder !== null &&
    meta.lease_expires_at_ms !== null &&
    meta.lease_expires_at_ms > now_ms
  );
}

/**
 * Create a lifecycle-phase badge, or null when the issue has no known
 * `workgraph_phase`.
 *
 * @param {{ metadata?: Record<string, unknown> | null }} issue
 * @returns {HTMLSpanElement | null}
 */
export function createPhaseBadge(issue) {
  const meta = workgraphMeta(issue);
  if (!meta.phase) {
    return null;
  }
  const el = document.createElement('span');
  el.className = `wg-badge wg-badge--phase is-${meta.phase}`;
  el.setAttribute('role', 'img');
  const label = meta.risk_tier
    ? `Workgraph phase: ${meta.phase} (risk ${meta.risk_tier})`
    : `Workgraph phase: ${meta.phase}`;
  el.setAttribute('title', label);
  el.setAttribute('aria-label', label);
  el.textContent = meta.phase;
  return el;
}

/**
 * Create a lease badge showing the holder and remaining time, or null when
 * the issue has no live lease.
 *
 * @param {{ metadata?: Record<string, unknown> | null }} issue
 * @param {number} [now_ms]
 * @returns {HTMLSpanElement | null}
 */
export function createLeaseBadge(issue, now_ms = Date.now()) {
  if (!hasLiveLease(issue, now_ms)) {
    return null;
  }
  const meta = workgraphMeta(issue);
  const holder = String(meta.lease_holder);
  const remaining = leaseRemainingLabel(
    /** @type {number} */ (meta.lease_expires_at_ms),
    now_ms
  );
  const el = document.createElement('span');
  el.className = 'wg-badge wg-badge--lease';
  el.setAttribute('role', 'img');
  const label = `Leased by ${holder}, ${remaining} remaining`;
  el.setAttribute('title', label);
  el.setAttribute('aria-label', label);
  el.textContent = `\u{1F512} ${shortHolder(holder)} · ${remaining}`;
  return el;
}

/**
 * Compact "time remaining" label: 45s, 12m, 3h, 2d.
 *
 * @param {number} expires_ms
 * @param {number} now_ms
 */
export function leaseRemainingLabel(expires_ms, now_ms) {
  const remaining_s = Math.max(0, Math.round((expires_ms - now_ms) / 1000));
  if (remaining_s < 60) {
    return `${remaining_s}s`;
  }
  const remaining_m = Math.round(remaining_s / 60);
  if (remaining_m < 60) {
    return `${remaining_m}m`;
  }
  const remaining_h = Math.round(remaining_m / 60);
  if (remaining_h < 48) {
    return `${remaining_h}h`;
  }
  return `${Math.round(remaining_h / 24)}d`;
}

/**
 * Shorten a holder identity for card display: keep the part before any `/`
 * (e.g. `garen@mbp/1f3a9c2e` → `garen@mbp`, `workgraph-run/abc` → `workgraph-run`).
 *
 * @param {string} holder
 */
function shortHolder(holder) {
  const idx = holder.indexOf('/');
  return idx > 0 ? holder.slice(0, idx) : holder;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asString(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}
