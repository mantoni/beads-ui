/**
 * Minimal, safe Markdown renderer that builds a DOM fragment without innerHTML.
 * Supports headings, paragraphs, lists, code blocks, inline code, and links.
 * This is intentionally conservative to avoid XSS.
 * @function renderMarkdown
 * @param {string} src Markdown source text
 * @returns {DocumentFragment}
 */
export function renderMarkdown(src) {
  /** @type {DocumentFragment} */
  const frag = document.createDocumentFragment();

  /** @type {string[]} */
  const lines = (src || '').replace(/\r\n?/g, '\n').split('\n');

  /** @type {boolean} */
  let in_code = false;
  /** @type {string[]} */
  let code_acc = [];

  /**
   * Stack of open list contexts for nested lists.
   * Each entry keeps the element, type and indentation level in spaces.
   * @type {{ el: HTMLOListElement|HTMLUListElement, type: 'ol'|'ul', indent: number, last_li: HTMLLIElement|null }[]}
   */
  const list_stack = [];

  /**
   * Flush the current open list structure to the fragment.
   */
  function flushLists() {
    if (list_stack.length > 0) {
      frag.appendChild(list_stack[0].el);
      list_stack.length = 0;
    }
  }

  /**
   * Flush current paragraph buffer to <p> if any.
   * @param {string[]} buf
   */
  function flushParagraph(buf) {
    if (buf.length === 0) {
      return;
    }
    const p = document.createElement('p');
    appendInline(p, buf.join(' '));
    frag.appendChild(p);
    buf.length = 0;
  }

  /** @type {string[]} */
  const para = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw;

    // fenced code blocks
    if (/^```/.test(line)) {
      if (!in_code) {
        in_code = true;
        code_acc = [];
      } else {
        // flush code block
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.textContent = code_acc.join('\n');
        pre.appendChild(code);
        frag.appendChild(pre);
        in_code = false;
        code_acc = [];
      }
      continue;
    }
    if (in_code) {
      code_acc.push(raw);
      continue;
    }

    // blank line -> paragraph / list break
    if (/^\s*$/.test(line)) {
      flushParagraph(para);
      flushLists();
      continue;
    }

    // heading
    const hx = /^(#{1,6})\s+(.*)$/.exec(line);
    if (hx) {
      flushParagraph(para);
      flushLists();
      const level = Math.min(6, hx[1].length);
      const h = /** @type {HTMLHeadingElement} */ (
        document.createElement('h' + String(level))
      );
      appendInline(h, hx[2]);
      frag.appendChild(h);
      continue;
    }

    // list item (supports nested via indentation and both "." and ")" markers for ordered)
    /** @type {any} */
    let m = /^(\s*)[-*]\s+(.*)$/.exec(line);
    if (m) {
      const indent = m[1].length;
      const type = /** @type {'ul'} */ ('ul');
      const text = m[2];
      flushParagraph(para);
      // adjust stack based on indentation
      adjustListStack(indent, type);
      // ensure a list at the current level exists
      ensureListAt(indent, type);
      const li = document.createElement('li');
      appendInline(li, text);
      list_stack[list_stack.length - 1].el.appendChild(li);
      list_stack[list_stack.length - 1].last_li = li;
      continue;
    }
    // ordered: allow 1. and 1)
    m = /^(\s*)(\d+)[.).]\s+(.*)$/.exec(line);
    if (m) {
      const indent = m[1].length;
      const type = /** @type {'ol'} */ ('ol');
      const text = m[3];
      flushParagraph(para);
      adjustListStack(indent, type);
      ensureListAt(indent, type);
      const li = document.createElement('li');
      appendInline(li, text);
      list_stack[list_stack.length - 1].el.appendChild(li);
      list_stack[list_stack.length - 1].last_li = li;
      continue;
    }

    // otherwise: paragraph text; accumulate to join with spaces
    para.push(line.trim());
  }

  // flush leftovers
  if (in_code) {
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = code_acc.join('\n');
    pre.appendChild(code);
    frag.appendChild(pre);
  }
  flushParagraph(para);
  flushLists();

  return frag;

  /**
   * Append inline content parsing backticks and links safely.
   * - Inline code: `text`
   * - Links: [text](url) where url starts with http, https, or mailto
   * @param {HTMLElement} el
   * @param {string} text
   */
  function appendInline(el, text) {
    /** @type {RegExp} */
    const re = /(`[^`]+`)|(\[[^\]]+\]\([^)]+\))/g;
    /** @type {number} */
    let last = 0;
    /** @type {any} */
    let match = re.exec(text);
    while (match) {
      const idx = match.index;
      if (idx > last) {
        el.appendChild(document.createTextNode(text.slice(last, idx)));
      }
      const token = match[0];
      if (token[0] === '\u0060') {
        const code = document.createElement('code');
        code.textContent = token.slice(1, -1);
        el.appendChild(code);
      } else if (token[0] === '[') {
        // parse [text](url)
        const m2 = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
        if (m2) {
          const a = document.createElement('a');
          const href = m2[2].trim();
          const allowed = /^(https?:|mailto:)/i.test(href);
          if (allowed) {
            a.setAttribute('href', href);
          } else {
            // if not allowed, render as text to avoid XSS vectors
            a.remove();
            el.appendChild(document.createTextNode(m2[1] + ' (' + href + ')'));
            last = re.lastIndex;
            match = re.exec(text);
            continue;
          }
          a.appendChild(document.createTextNode(m2[1]));
          el.appendChild(a);
        }
      }
      last = re.lastIndex;
      match = re.exec(text);
    }
    if (last < text.length) {
      el.appendChild(document.createTextNode(text.slice(last)));
    }
  }

  /**
   * Ensure there is a list at the desired indentation and type.
   * Creates a new list if the stack top differs or is missing.
   * @param {number} indent
   * @param {'ol'|'ul'} type
   */
  function ensureListAt(indent, type) {
    const top = list_stack[list_stack.length - 1];
    if (!top || top.indent !== indent || top.type !== type) {
      const el = /** @type {HTMLOListElement|HTMLUListElement} */ (
        document.createElement(type)
      );
      if (top) {
        // must attach to the last list item's children if possible, else to the list itself
        const parent_li = top.last_li;
        if (parent_li) {
          parent_li.appendChild(el);
        } else {
          top.el.appendChild(el);
        }
      }
      list_stack.push({ el, type, indent, last_li: null });
    }
  }

  /**
   * Adjust the list stack by popping contexts deeper than the current indent.
   * @param {number} indent
   * @param {'ol'|'ul'} type
   */
  function adjustListStack(indent, type) {
    // pop while stack is deeper than current indent
    while (
      list_stack.length > 0 &&
      list_stack[list_stack.length - 1].indent > indent
    ) {
      list_stack.pop();
    }
    // if same indent but different type, pop to parent at lower indent (or empty)
    const top = list_stack[list_stack.length - 1];
    if (top && top.indent === indent && top.type !== type) {
      list_stack.pop();
    }
  }
}
