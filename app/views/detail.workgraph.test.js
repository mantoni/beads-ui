import { describe, expect, test, vi } from 'vitest';
import { createDetailView } from './detail.js';

/** @type {(impl: (type: string, payload?: unknown) => Promise<any>) => (type: string, payload?: unknown) => Promise<any>} */
const mockSend = (impl) => vi.fn(impl);

/**
 * Mount the detail view with a given issue object and return the mount element.
 *
 * @param {Record<string, unknown> & { id: string }} issue
 * @returns {Promise<HTMLElement>}
 */
async function mountIssue(issue) {
  document.body.innerHTML =
    '<section class="panel"><div id="mount"></div></section>';
  const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
  const client_id = `detail:${issue.id}`;
  const stores = {
    /** @param {string} id */
    snapshotFor(id) {
      return id === client_id ? [issue] : [];
    },
    subscribe() {
      return () => {};
    }
  };
  const send = mockSend(async () => {
    throw new Error('Unexpected send');
  });
  const view = createDetailView(mount, send, undefined, stores);
  await view.load(issue.id);
  return mount;
}

/**
 * Find the Agent card root element.
 *
 * @param {HTMLElement} mount
 * @returns {Element | null}
 */
function agentCard(mount) {
  const titles = Array.from(mount.querySelectorAll('.props-card__title'));
  const title = titles.find((t) => t.textContent === 'Agent');
  return title ? title.closest('.props-card') : null;
}

/**
 * Return the value text for a labeled row inside a card.
 *
 * @param {Element} card
 * @param {string} label
 * @returns {string | null}
 */
function rowValue(card, label) {
  const rows = Array.from(card.querySelectorAll('.prop'));
  for (const row of rows) {
    const l = row.querySelector('.label');
    if (l && l.textContent === label) {
      const v = row.querySelector('.value');
      return v ? (v.textContent || '').trim() : '';
    }
  }
  return null;
}

describe('views/detail Agent card', () => {
  test('renders phase, workflow, risk, holder and live lease badge', async () => {
    const expires = new Date(Date.now() + 10 * 60_000).toISOString();
    const mount = await mountIssue({
      id: 'WG-1',
      title: 'wg issue',
      status: 'in_progress',
      priority: 1,
      issue_type: 'task',
      created_at: Date.now(),
      updated_at: Date.now(),
      metadata: {
        workgraph_phase: 'implementing',
        workgraph_workflow_class: 'reviewed',
        workgraph_risk_tier: 'medium',
        lease_holder: 'workgraph-run/abc123',
        lease_expires_at: expires
      }
    });

    const card = agentCard(mount);

    expect(card).not.toBe(null);
    const c = /** @type {Element} */ (card);
    expect(rowValue(c, 'Phase')).toBe('implementing');
    expect(rowValue(c, 'Workflow')).toBe('reviewed');
    expect(rowValue(c, 'Risk')).toBe('medium');
    expect(rowValue(c, 'Holder')).toBe('workgraph-run/abc123');
    expect(rowValue(c, 'Lease')).toContain('workgraph-run');
    expect(rowValue(c, 'Expires')).not.toBe('');
  });

  test('shows expired lease as muted text without a badge', async () => {
    const mount = await mountIssue({
      id: 'WG-2',
      title: 'stale',
      status: 'in_progress',
      priority: 2,
      issue_type: 'bug',
      created_at: Date.now(),
      updated_at: Date.now(),
      metadata: {
        lease_holder: 'workgraph-run/dead',
        lease_expires_at: '2020-01-01T00:00:00Z'
      }
    });

    const card = agentCard(mount);

    expect(card).not.toBe(null);
    const c = /** @type {Element} */ (card);
    expect(rowValue(c, 'Lease')).toBe('expired');
    expect(c.querySelector('.wg-badge--lease')).toBe(null);
    expect(rowValue(c, 'Holder')).toBe('workgraph-run/dead');
  });

  test('renders no Agent card without workgraph metadata', async () => {
    const mount = await mountIssue({
      id: 'PLAIN-1',
      title: 'plain',
      status: 'open',
      priority: 2,
      issue_type: 'task',
      created_at: Date.now(),
      updated_at: Date.now()
    });

    expect(agentCard(mount)).toBe(null);
  });
});
