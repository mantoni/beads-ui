/**
 * @import { MessageType } from '../protocol.js'
 */
import { debug } from '../utils/logging.js';

/**
 * Data layer: typed wrappers around the ws transport for mutations and
 * single-issue fetch. List reads have been removed in favor of push-only
 * stores and selectors (see docs/adr/001-push-only-lists.md).
 *
 * @param {(type: MessageType, payload?: unknown) => Promise<unknown>} transport - Request/response function.
 * @returns {{ updateIssue: (input: { id: string, title?: string, acceptance?: string, notes?: string, design?: string, status?: 'open'|'in_progress'|'closed', priority?: number, assignee?: string, issue_type?: string }) => Promise<unknown> }}
 */
export function createDataLayer(transport) {
  const log = debug('data');
  /**
   * Update issue fields by dispatching specific mutations.
   * Supported fields: title, acceptance, notes, design, status, priority, assignee, issue_type.
   * Returns the updated issue on success.
   *
   * @param {{ id: string, title?: string, acceptance?: string, notes?: string, design?: string, status?: 'open'|'in_progress'|'closed', priority?: number, assignee?: string, issue_type?: string }} input
   * @returns {Promise<unknown>}
   */
  async function updateIssue(input) {
    const { id } = input;

    log('updateIssue %s %o', id, Object.keys(input));

    /** @type {unknown} */
    let last = null;
    if (typeof input.title === 'string') {
      last = await transport('edit-text', {
        id,
        field: 'title',
        value: input.title
      });
    }
    if (typeof input.acceptance === 'string') {
      last = await transport('edit-text', {
        id,
        field: 'acceptance',
        value: input.acceptance
      });
    }
    if (typeof input.notes === 'string') {
      last = await transport('edit-text', {
        id,
        field: 'notes',
        value: input.notes
      });
    }
    if (typeof input.design === 'string') {
      last = await transport('edit-text', {
        id,
        field: 'design',
        value: input.design
      });
    }
    if (typeof input.status === 'string') {
      last = await transport('update-status', {
        id,
        status: input.status
      });
    }
    if (typeof input.priority === 'number') {
      last = await transport('update-priority', {
        id,
        priority: input.priority
      });
    }
    if (typeof input.issue_type === 'string') {
      last = await transport('update-type', {
        id,
        type: input.issue_type
      });
    }
    if (typeof input.assignee === 'string') {
      last = await transport('update-assignee', {
        id,
        assignee: input.assignee
      });
    }
    log('updateIssue done %s', id);
    return last;
  }

  return {
    updateIssue
  };
}
