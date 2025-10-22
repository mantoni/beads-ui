import { describe, expect, test } from 'vitest';
import { renderMarkdown } from './markdown.js';

describe('utils/markdown', () => {
  test('returns fragment for empty input', () => {
    const frag = renderMarkdown('');

    expect(frag).toBeInstanceOf(DocumentFragment);
  });

  test('renders headings', () => {
    const frag = renderMarkdown('# Title\n\n### Sub');
    const host = document.createElement('div');

    host.appendChild(frag);

    const h1 = /** @type {HTMLHeadingElement} */ (host.querySelector('h1'));
    const h3 = /** @type {HTMLHeadingElement} */ (host.querySelector('h3'));
    expect(h1.textContent).toBe('Title');
    expect(h3.textContent).toBe('Sub');
  });

  test('renders paragraphs with and without blank lines', () => {
    const frag = renderMarkdown('First line\ncontinues\n\nSecond para');
    const host = document.createElement('div');

    host.appendChild(frag);

    const ps = host.querySelectorAll('p');
    expect(ps.length).toBe(2);
    expect(ps[0].textContent).toBe('First line continues');
    expect(ps[1].textContent).toBe('Second para');
  });

  test('renders unordered list items', () => {
    const frag = renderMarkdown('- a\n- b');
    const host = document.createElement('div');

    host.appendChild(frag);

    const items = host.querySelectorAll('ul li');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toBe('a');
    expect(items[1].textContent).toBe('b');
  });

  test('renders ordered list items', () => {
    const frag = renderMarkdown('1. a\n2. b');
    const host = document.createElement('div');

    host.appendChild(frag);

    const items = host.querySelectorAll('ol li');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toBe('a');
    expect(items[1].textContent).toBe('b');
  });

  test('renders fenced code block', () => {
    const frag = renderMarkdown('```\nline1\nline2\n```');
    const host = document.createElement('div');

    host.appendChild(frag);

    const code = /** @type {HTMLElement} */ (host.querySelector('pre > code'));
    expect(code.textContent).toBe('line1\nline2');
  });

  test('renders inline code', () => {
    const frag = renderMarkdown('text `code` end');
    const host = document.createElement('div');

    host.appendChild(frag);

    const code = /** @type {HTMLElement} */ (host.querySelector('p code'));
    expect(code.textContent).toBe('code');
  });

  test('renders http and mailto links', () => {
    const frag = renderMarkdown('[web](https://example.com) and [mail](mailto:test@example.com)');
    const host = document.createElement('div');

    host.appendChild(frag);

    const hrefs = Array.from(host.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['https://example.com', 'mailto:test@example.com']);
  });

  test('filters unsafe link schemes', () => {
    const frag = renderMarkdown('x [danger](javascript:alert(1)) y');
    const host = document.createElement('div');

    host.appendChild(frag);

    const anchors = host.querySelectorAll('a');
    expect(anchors.length).toBe(0);
    expect(host.textContent || '').toContain('danger (javascript:alert(1))');
  });
});

