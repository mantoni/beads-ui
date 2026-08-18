import { describe, expect, test } from 'vitest';
import {
  createLeaseBadge,
  createPhaseBadge,
  hasLiveLease,
  leaseRemainingLabel,
  workgraphMeta
} from './workgraph-badge.js';

const NOW = Date.parse('2026-08-18T12:00:00Z');

describe('utils/workgraph-badge', () => {
  test('reads phase and lease keys off issue metadata', () => {
    const issue = {
      metadata: {
        workgraph_phase: 'implementing',
        workgraph_risk_tier: 'medium',
        lease_holder: 'garen@mbp/1f3a9c2e',
        lease_expires_at: '2026-08-18T12:05:00Z'
      }
    };

    const meta = workgraphMeta(issue);

    expect(meta.phase).toBe('implementing');
    expect(meta.risk_tier).toBe('medium');
    expect(meta.lease_holder).toBe('garen@mbp/1f3a9c2e');
    expect(meta.lease_expires_at_ms).toBe(Date.parse('2026-08-18T12:05:00Z'));
  });

  test('returns null phase for unknown phase values', () => {
    const meta = workgraphMeta({ metadata: { workgraph_phase: 'yolo' } });

    expect(meta.phase).toBe(null);
  });

  test('tolerates missing metadata and numeric round-trips', () => {
    expect(workgraphMeta({}).phase).toBe(null);
    expect(workgraphMeta({ metadata: null }).lease_holder).toBe(null);
    expect(workgraphMeta({ metadata: { lease_holder: 42 } }).lease_holder).toBe(
      '42'
    );
  });

  test('reports a live lease only when the expiry is in the future', () => {
    const live = {
      metadata: {
        lease_holder: 'w',
        lease_expires_at: '2026-08-18T12:05:00Z'
      }
    };
    const expired = {
      metadata: {
        lease_holder: 'w',
        lease_expires_at: '2026-08-18T11:55:00Z'
      }
    };

    expect(hasLiveLease(live, NOW)).toBe(true);
    expect(hasLiveLease(expired, NOW)).toBe(false);
    expect(hasLiveLease({}, NOW)).toBe(false);
  });

  test('treats a holder without a parseable expiry as not held', () => {
    const issue = {
      metadata: { lease_holder: 'w', lease_expires_at: 'garbage' }
    };

    expect(hasLiveLease(issue, NOW)).toBe(false);
  });

  test('formats remaining time compactly', () => {
    expect(leaseRemainingLabel(NOW + 45_000, NOW)).toBe('45s');
    expect(leaseRemainingLabel(NOW + 12 * 60_000, NOW)).toBe('12m');
    expect(leaseRemainingLabel(NOW + 3 * 3_600_000, NOW)).toBe('3h');
    expect(leaseRemainingLabel(NOW + 72 * 3_600_000, NOW)).toBe('3d');
  });

  test('creates a phase badge with phase class and text', () => {
    const el = createPhaseBadge({
      metadata: { workgraph_phase: 'judging', workgraph_risk_tier: 'high' }
    });

    expect(el).not.toBe(null);
    expect(el?.className).toBe('wg-badge wg-badge--phase is-judging');
    expect(el?.textContent).toBe('judging');
    expect(el?.getAttribute('title')).toBe(
      'Workgraph phase: judging (risk high)'
    );
  });

  test('returns null phase badge without workgraph metadata', () => {
    expect(createPhaseBadge({})).toBe(null);
    expect(createPhaseBadge({ metadata: { lease_holder: 'w' } })).toBe(null);
  });

  test('creates a lease badge with shortened holder and remaining time', () => {
    const el = createLeaseBadge(
      {
        metadata: {
          lease_holder: 'workgraph-run/abc123',
          lease_expires_at: '2026-08-18T12:12:00Z'
        }
      },
      NOW
    );

    expect(el).not.toBe(null);
    expect(el?.className).toBe('wg-badge wg-badge--lease');
    expect(el?.textContent).toBe('\u{1F512} workgraph-run · 12m');
    expect(el?.getAttribute('title')).toBe(
      'Leased by workgraph-run/abc123, 12m remaining'
    );
  });

  test('returns null lease badge for an expired lease', () => {
    const el = createLeaseBadge(
      {
        metadata: {
          lease_holder: 'w',
          lease_expires_at: '2026-08-18T11:00:00Z'
        }
      },
      NOW
    );

    expect(el).toBe(null);
  });
});
