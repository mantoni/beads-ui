import { html, render } from 'lit-html';
import { describe, expect, test } from 'vitest';
import { createIssueRowRenderer } from './issue-row.js';

/**
 * Render one issue row into a table body and return it.
 *
 * @param {import('./issue-row.js').IssueRowData} it
 * @returns {HTMLElement}
 */
function renderRow(it) {
  document.body.innerHTML = '<table><tbody id="tb"></tbody></table>';
  const tbody = /** @type {HTMLElement} */ (document.getElementById('tb'));
  const rowTemplate = createIssueRowRenderer({
    navigate: () => {},
    onUpdate: async () => {},
    requestRender: () => {}
  });
  render(html`${rowTemplate(it)}`, tbody);
  return tbody;
}

describe('views/issue-row workgraph metadata', () => {
  test('renders phase and lease badges in the title cell', () => {
    const tbody = renderRow({
      id: 'WG-1',
      title: 'wg issue',
      status: 'in_progress',
      priority: 1,
      issue_type: 'task',
      metadata: {
        workgraph_phase: 'judging',
        lease_holder: 'workgraph-run/abc123',
        lease_expires_at: new Date(Date.now() + 10 * 60_000).toISOString()
      }
    });

    const phase = tbody.querySelector('.wg-badge--phase');
    const lease = tbody.querySelector('.wg-badge--lease');

    expect(phase?.textContent).toBe('judging');
    expect(lease?.textContent).toContain('workgraph-run');
  });

  test('renders no badges without workgraph metadata', () => {
    const tbody = renderRow({
      id: 'PLAIN-1',
      title: 'plain',
      status: 'open',
      priority: 2,
      issue_type: 'task'
    });

    expect(tbody.querySelector('.wg-badge')).toBe(null);
  });
});
