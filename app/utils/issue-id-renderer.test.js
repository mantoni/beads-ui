import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createIssueIdRenderer } from './issue-id-renderer.js';

describe('utils/issue-id-renderer', () => {
  /** @type {any} */
  let origClipboard;

  beforeEach(() => {
    vi.useFakeTimers();
    origClipboard = navigator.clipboard;
    // @ts-ignore
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) }
    });
  });

  afterEach(() => {
    // @ts-ignore
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: origClipboard
    });
    vi.useRealTimers();
  });

  test('renders monospace button and copies full id on click', async () => {
    const el = createIssueIdRenderer('UI-123');
    document.body.appendChild(el);

    expect(el.tagName).toBe('BUTTON');
    expect(el.classList.contains('mono')).toBe(true);
    expect(el.textContent).toBe('UI-123');

    el.click();
    // Await microtask tick for async handler
    await Promise.resolve();
    // Clipboard called with full id
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('UI-123');
    // Immediate feedback (after microtask)
    expect(el.textContent).toBe('Copied');

    // Revert after default duration
    vi.advanceTimersByTime(1200);
    expect(el.textContent).toBe('UI-123');
  });

  test('applies custom class and duration', async () => {
    const el = createIssueIdRenderer('UI-9', {
      class_name: 'extra',
      duration_ms: 100
    });
    expect(el.classList.contains('extra')).toBe(true);
    el.click();
    // Await microtask tick for async handler
    await Promise.resolve();
    expect(el.textContent).toBe('Copied');
    vi.advanceTimersByTime(100);
    expect(el.textContent).toBe('UI-9');
  });

  test('keyboard activation via Enter/Space copies', () => {
    const el = createIssueIdRenderer('P-42');
    document.body.appendChild(el);
    // Enter
    el.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('P-42');
    // Space
    el.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('P-42');
  });

  test('falls back to execCommand when clipboard API is unavailable', async () => {
    // Simulate non-secure context: navigator.clipboard is undefined
    // @ts-ignore
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined
    });
    // jsdom does not define execCommand; provide a mock implementation
    document.execCommand = vi.fn().mockReturnValue(true);

    const el = createIssueIdRenderer('FB-1');
    document.body.appendChild(el);
    el.click();
    await Promise.resolve();

    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(el.textContent).toBe('Copied');

    vi.advanceTimersByTime(1200);
    expect(el.textContent).toBe('FB-1');
    // @ts-ignore
    delete document.execCommand;
  });

  test('does not show Copied when fallback execCommand fails', async () => {
    // @ts-ignore
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined
    });
    document.execCommand = vi.fn().mockReturnValue(false);

    const el = createIssueIdRenderer('FB-2');
    document.body.appendChild(el);
    el.click();
    await Promise.resolve();

    expect(el.textContent).toBe('FB-2');
    // @ts-ignore
    delete document.execCommand;
  });
});
