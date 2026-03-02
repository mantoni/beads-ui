/**
 * Create a reusable, copy-to-clipboard issue ID renderer.
 * Looks like the current inline ID (monospace `#123`) but acts as a button
 * that copies the full, prefixed ID (e.g., `UI-123`) when activated.
 * Shows transient "Copied" feedback and then restores the ID.
 *
 * @param {string} id - Full issue id including the prefix (e.g., "UI-123").
 * @param {{ class_name?: string, duration_ms?: number }} [opts]
 * @returns {HTMLButtonElement}
 */
export function createIssueIdRenderer(id, opts) {
  /** @type {number} */
  const duration =
    typeof opts?.duration_ms === 'number' ? opts.duration_ms : 1200;
  /** @type {HTMLButtonElement} */
  const btn = document.createElement('button');
  // Visual: match inline ID look; keep it neutral and text-like
  btn.className =
    (opts?.class_name ? opts.class_name + ' ' : '') + 'mono id-copy';
  btn.type = 'button';
  btn.setAttribute('aria-live', 'polite');
  btn.setAttribute('title', 'Copy issue ID');
  btn.setAttribute('aria-label', `Copy issue ID ${id}`);
  btn.textContent = id;

  /** Copy handler with feedback. */
  async function doCopy() {
    try {
      let copied = false;
      if (
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === 'function'
      ) {
        await navigator.clipboard.writeText(String(id));
        copied = true;
      } else {
        // Fallback for non-secure contexts (HTTP, non-localhost)
        // where navigator.clipboard is undefined.
        const ta = document.createElement('textarea');
        ta.value = String(id);
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.opacity = '0';
        // Append inside the nearest open <dialog> if any — showModal()
        // creates a top-layer that makes document.body inert.
        const container = btn.closest('dialog[open]') || document.body;
        container.appendChild(ta);
        ta.focus();
        ta.select();
        try {
          copied = document.execCommand('copy');
        } finally {
          container.removeChild(ta);
        }
      }
      if (copied) {
        btn.textContent = 'Copied';
        const oldAria = btn.getAttribute('aria-label') || '';
        btn.setAttribute('aria-label', 'Copied');
        setTimeout(
          () => {
            btn.textContent = id;
            btn.setAttribute('aria-label', oldAria);
          },
          Math.max(80, duration)
        );
      }
    } catch {
      // On failure, leave text as-is; no throw to avoid disruptive UX
    }
  }

  btn.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    void doCopy();
  });
  btn.addEventListener('keydown', (ev) => {
    // Ensure keyboard activation works even in non-interactive test envs
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      ev.stopPropagation();
      void doCopy();
    }
  });

  return btn;
}
