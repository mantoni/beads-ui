import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createWorkspacePicker } from './workspace-picker.js';

describe('workspace-picker', () => {
  /** @type {HTMLElement} */
  let mount_element;
  /** @type {any} */
  let mock_store;
  /** @type {Function} */
  let on_workspace_change;

  beforeEach(() => {
    mount_element = document.createElement('div');
    document.body.appendChild(mount_element);

    // Mock store
    mock_store = {
      state: { workspace: { current: null, available: [] } },
      getState: vi.fn(() => mock_store.state),
      subscribe: vi.fn((fn) => {
        const unsub = () => {};
        return unsub;
      })
    };

    on_workspace_change = vi.fn().mockResolvedValue(undefined);
  });

  test('renders nothing when no workspaces available', () => {
    createWorkspacePicker(mount_element, mock_store, on_workspace_change);

    expect(mount_element.textContent).toBe('');
  });

  test('renders single workspace as label', () => {
    mock_store.state = {
      workspace: {
        current: { path: '/home/user/my-project' },
        available: [{ path: '/home/user/my-project', database: 'test.db' }]
      }
    };

    createWorkspacePicker(mount_element, mock_store, on_workspace_change);

    const label = mount_element.querySelector('.workspace-picker__label');
    expect(label).toBeTruthy();
    expect(label.textContent).toBe('my-project');
    expect(label.getAttribute('title')).toBe('/home/user/my-project');
  });

  test('renders dropdown for multiple workspaces', () => {
    mock_store.state = {
      workspace: {
        current: { path: '/home/user/project1' },
        available: [
          { path: '/home/user/project1', database: 'test1.db' },
          { path: '/home/user/project2', database: 'test2.db' }
        ]
      }
    };

    createWorkspacePicker(mount_element, mock_store, on_workspace_change);

    const select = mount_element.querySelector(
      '.workspace-picker__select'
    );
    expect(select).toBeTruthy();
    expect(select.tagName).toBe('SELECT');

    const options = select.querySelectorAll('option');
    expect(options).toHaveLength(2);
    expect(options[0].textContent.trim()).toBe('project1');
    expect(options[1].textContent.trim()).toBe('project2');
  });

  test('marks current workspace as selected', () => {
    mock_store.state = {
      workspace: {
        current: { path: '/home/user/project2' },
        available: [
          { path: '/home/user/project1', database: 'test1.db' },
          { path: '/home/user/project2', database: 'test2.db' }
        ]
      }
    };

    createWorkspacePicker(mount_element, mock_store, on_workspace_change);

    const select = mount_element.querySelector(
      '.workspace-picker__select'
    );
    expect(select.value).toBe('/home/user/project2');

    const options = Array.from(select.querySelectorAll('option'));
    const selected = options.find((o) => o.selected);
    expect(selected.value).toBe('/home/user/project2');
  });

  test('calls onWorkspaceChange when selection changes', async () => {
    mock_store.state = {
      workspace: {
        current: { path: '/home/user/project1' },
        available: [
          { path: '/home/user/project1', database: 'test1.db' },
          { path: '/home/user/project2', database: 'test2.db' }
        ]
      }
    };

    createWorkspacePicker(mount_element, mock_store, on_workspace_change);

    const select = mount_element.querySelector(
      '.workspace-picker__select'
    );
    select.value = '/home/user/project2';
    select.dispatchEvent(new Event('change'));

    // Wait for async handler
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(on_workspace_change).toHaveBeenCalledWith('/home/user/project2');
  });

  test('does not call onWorkspaceChange if value unchanged', async () => {
    mock_store.state = {
      workspace: {
        current: { path: '/home/user/project1' },
        available: [
          { path: '/home/user/project1', database: 'test1.db' },
          { path: '/home/user/project2', database: 'test2.db' }
        ]
      }
    };

    createWorkspacePicker(mount_element, mock_store, on_workspace_change);

    const select = mount_element.querySelector(
      '.workspace-picker__select'
    );
    // Select same workspace
    select.value = '/home/user/project1';
    select.dispatchEvent(new Event('change'));

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(on_workspace_change).not.toHaveBeenCalled();
  });

  test('disables select during workspace switch', async () => {
    mock_store.state = {
      workspace: {
        current: { path: '/home/user/project1' },
        available: [
          { path: '/home/user/project1', database: 'test1.db' },
          { path: '/home/user/project2', database: 'test2.db' }
        ]
      }
    };

    // Make onWorkspaceChange slow to test loading state
    let resolve_switch;
    const switch_promise = new Promise((r) => {
      resolve_switch = r;
    });
    on_workspace_change = vi.fn(() => switch_promise);

    createWorkspacePicker(mount_element, mock_store, on_workspace_change);

    const select = mount_element.querySelector(
      '.workspace-picker__select'
    );
    select.value = '/home/user/project2';
    select.dispatchEvent(new Event('change'));

    // Wait a tick for onChange to start
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Select should be disabled during switch
    expect(select.disabled).toBe(true);

    // Complete the switch
    resolve_switch();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  test('shows loading indicator during workspace switch', async () => {
    mock_store.state = {
      workspace: {
        current: { path: '/home/user/project1' },
        available: [
          { path: '/home/user/project1', database: 'test1.db' },
          { path: '/home/user/project2', database: 'test2.db' }
        ]
      }
    };

    let resolve_switch;
    const switch_promise = new Promise((r) => {
      resolve_switch = r;
    });
    on_workspace_change = vi.fn(() => switch_promise);

    createWorkspacePicker(mount_element, mock_store, on_workspace_change);

    const select = mount_element.querySelector(
      '.workspace-picker__select'
    );
    select.value = '/home/user/project2';
    select.dispatchEvent(new Event('change'));

    await new Promise((resolve) => setTimeout(resolve, 10));

    // Loading indicator should be present
    const loading = mount_element.querySelector(
      '.workspace-picker__loading'
    );
    expect(loading).toBeTruthy();

    resolve_switch();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  test('handles workspace switch errors gracefully', async () => {
    mock_store.state = {
      workspace: {
        current: { path: '/home/user/project1' },
        available: [
          { path: '/home/user/project1', database: 'test1.db' },
          { path: '/home/user/project2', database: 'test2.db' }
        ]
      }
    };

    // onWorkspaceChange rejects
    on_workspace_change = vi
      .fn()
      .mockRejectedValue(new Error('Network error'));

    createWorkspacePicker(mount_element, mock_store, on_workspace_change);

    const select = mount_element.querySelector(
      '.workspace-picker__select'
    );
    select.value = '/home/user/project2';
    select.dispatchEvent(new Event('change'));

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Should not throw, handles error gracefully
    expect(select.disabled).toBe(false);
  });

  test('subscribes to store updates', () => {
    createWorkspacePicker(mount_element, mock_store, on_workspace_change);

    expect(mock_store.subscribe).toHaveBeenCalled();
  });

  test('destroy unsubscribes from store', () => {
    const unsub_fn = vi.fn();
    mock_store.subscribe = vi.fn(() => unsub_fn);

    const picker = createWorkspacePicker(
      mount_element,
      mock_store,
      on_workspace_change
    );

    picker.destroy();

    expect(unsub_fn).toHaveBeenCalled();
  });

  test('destroy clears mount element', () => {
    mock_store.state = {
      workspace: {
        current: { path: '/home/user/project1' },
        available: [{ path: '/home/user/project1', database: 'test.db' }]
      }
    };

    const picker = createWorkspacePicker(
      mount_element,
      mock_store,
      on_workspace_change
    );

    expect(mount_element.textContent).not.toBe('');

    picker.destroy();

    expect(mount_element.textContent).toBe('');
  });

  test('getProjectName extracts directory name from path', () => {
    mock_store.state = {
      workspace: {
        current: null,
        available: [
          { path: '/very/long/path/to/my-awesome-project', database: 'test.db' }
        ]
      }
    };

    createWorkspacePicker(mount_element, mock_store, on_workspace_change);

    const label = mount_element.querySelector('.workspace-picker__label');
    expect(label.textContent).toBe('my-awesome-project');
  });

  test('handles empty workspace path gracefully', () => {
    mock_store.state = {
      workspace: {
        current: null,
        available: [{ path: '', database: 'test.db' }]
      }
    };

    createWorkspacePicker(mount_element, mock_store, on_workspace_change);

    const label = mount_element.querySelector('.workspace-picker__label');
    expect(label.textContent).toBe('Unknown');
  });

  test('re-renders on store updates', () => {
    let subscriber_fn;
    mock_store.subscribe = vi.fn((fn) => {
      subscriber_fn = fn;
      return () => {};
    });

    mock_store.state = {
      workspace: { current: null, available: [] }
    };

    createWorkspacePicker(mount_element, mock_store, on_workspace_change);

    expect(mount_element.textContent).toBe('');

    // Update store state
    mock_store.state = {
      workspace: {
        current: { path: '/home/user/new-project' },
        available: [{ path: '/home/user/new-project', database: 'test.db' }]
      }
    };

    // Trigger subscriber
    subscriber_fn(mock_store.state);

    // Should re-render with new workspace
    const label = mount_element.querySelector('.workspace-picker__label');
    expect(label.textContent).toBe('new-project');
  });
});
