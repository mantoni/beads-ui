import { html, render } from 'lit-html';
import { beforeEach, describe, expect, test } from 'vitest';
import { columnSpacerCell, createColumnResizer } from './column-resize.js';

/**
 * @import { ColumnSpec } from './column-resize.js'
 */

const STORAGE_KEY = 'test.columns';

/** @type {ColumnSpec[]} */
const COLUMNS = [
  { key: 'id', label: 'ID', width: 100 },
  { key: 'title', label: 'Title', width: 320, flex: true },
  { key: 'status', label: 'Status', width: 120 }
];

/**
 * Render one or more resizable tables sharing a single resizer.
 *
 * @param {number} [table_count]
 */
function setup(table_count = 1) {
  document.body.innerHTML = '<div id="mount"></div>';
  const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
  const resizer = createColumnResizer({
    mount_element: mount,
    storage_key: STORAGE_KEY,
    columns: COLUMNS,
    requestRender: () => doRender()
  });

  function doRender() {
    render(
      html`${Array.from(
        { length: table_count },
        () =>
          html`<table class="table">
            ${resizer.colgroup()}
            <thead>
              <tr>
                ${resizer.headerCells()}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>1</td>
                <td>2</td>
                <td>3</td>
                ${columnSpacerCell()}
              </tr>
            </tbody>
          </table>`
      )}`,
      mount
    );
  }

  doRender();
  return { mount, resizer };
}

/**
 * Widths of the rendered `<col>` elements of the nth table.
 *
 * @param {HTMLElement} mount
 * @param {number} [table_index]
 */
function colWidths(mount, table_index = 0) {
  const table = mount.querySelectorAll('table.table')[table_index];
  return Array.from(table.querySelectorAll('colgroup > col')).map(
    (col) => /** @type {HTMLElement} */ (col).style.width
  );
}

/**
 * Drag the resize handle of a column by `dx` pixels.
 *
 * @param {HTMLElement} mount
 * @param {number} index
 * @param {number} dx
 * @param {{ drop?: boolean }} [options]
 */
function drag(mount, index, dx, options = {}) {
  const handle = mount.querySelectorAll('.col-resizer')[index];
  handle.dispatchEvent(
    new MouseEvent('pointerdown', { clientX: 500, bubbles: true })
  );
  window.dispatchEvent(new MouseEvent('pointermove', { clientX: 500 + dx }));
  if (options.drop !== false) {
    window.dispatchEvent(new MouseEvent('pointerup', {}));
  }
}

describe('views/column-resize', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('renders a col per column plus a trailing spacer', () => {
    const { mount } = setup();

    const widths = colWidths(mount);

    expect(widths).toEqual(['100px', '', '120px', '0px']);
  });

  test('renders a resize handle in every header cell', () => {
    const { mount } = setup();

    const handles = mount.querySelectorAll('th .col-resizer');

    expect(handles.length).toBe(COLUMNS.length);
    expect(handles[0].getAttribute('aria-label')).toBe('Resize ID column');
  });

  test('renders a spacer cell in header and body rows', () => {
    const { mount } = setup();

    const spacers = mount.querySelectorAll('.col-spacer');

    expect(spacers.length).toBe(3);
  });

  test('widens a column on drag', () => {
    const { mount, resizer } = setup();

    drag(mount, 0, 60);

    expect(resizer.widths()).toEqual([160, null, 120]);
    expect(colWidths(mount)[0]).toBe('160px');
  });

  test('narrows a column on drag', () => {
    const { mount, resizer } = setup();

    drag(mount, 2, -20);

    expect(resizer.widths()).toEqual([100, null, 100]);
  });

  test('clamps a column to the minimum width', () => {
    const { mount, resizer } = setup();

    drag(mount, 0, -400);

    expect(resizer.widths()).toEqual([48, null, 120]);
  });

  test('updates the column while dragging, before the drop', () => {
    const { mount, resizer } = setup();

    drag(mount, 0, 40, { drop: false });

    expect(colWidths(mount)[0]).toBe('140px');
    expect(resizer.widths()).toEqual([100, null, 120]);
  });

  test('keeps all tables in the mount in sync while dragging', () => {
    const { mount } = setup(2);

    drag(mount, 0, 40, { drop: false });

    expect(colWidths(mount, 1)[0]).toBe('140px');
  });

  test('gives the auto column an explicit width when resized', () => {
    const { mount, resizer } = setup();
    const cell = /** @type {HTMLElement} */ (mount.querySelectorAll('th')[1]);
    cell.getBoundingClientRect = () =>
      /** @type {DOMRect} */ (/** @type {unknown} */ ({ width: 300 }));

    drag(mount, 1, 25);

    expect(resizer.widths()).toEqual([100, 325, 120]);
  });

  test('stretches the spacer column once no column is auto sized', () => {
    const { mount } = setup();

    drag(mount, 1, 10);

    expect(colWidths(mount)[3]).toBe('');
  });

  test('resizes with the arrow keys', () => {
    const { mount, resizer } = setup();
    const handle = mount.querySelectorAll('.col-resizer')[0];

    handle.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
    );
    handle.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
    );

    expect(resizer.widths()).toEqual([132, null, 120]);
  });

  test('ignores unrelated keys on the resize handle', () => {
    const { mount, resizer } = setup();
    const handle = mount.querySelectorAll('.col-resizer')[0];

    handle.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    );

    expect(resizer.widths()).toEqual([100, null, 120]);
  });

  test('restores the default width on double click', () => {
    const { mount, resizer } = setup();
    drag(mount, 0, 60);

    mount
      .querySelectorAll('.col-resizer')[0]
      .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    expect(resizer.widths()).toEqual([100, null, 120]);
  });

  test('restores auto sizing of the flex column on double click', () => {
    const { mount, resizer } = setup();
    drag(mount, 1, 20);

    mount
      .querySelectorAll('.col-resizer')[1]
      .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    expect(resizer.widths()).toEqual([100, null, 120]);
  });

  test('persists widths to local storage', () => {
    const { mount } = setup();

    drag(mount, 0, 60);

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('[160,null,120]');
  });

  test('restores persisted widths', () => {
    window.localStorage.setItem(STORAGE_KEY, '[200,null,90]');

    const { mount } = setup();

    expect(colWidths(mount)).toEqual(['200px', '', '90px', '0px']);
  });

  test('clamps persisted widths to the allowed range', () => {
    window.localStorage.setItem(STORAGE_KEY, '[5,null,5000]');

    const { resizer } = setup();

    expect(resizer.widths()).toEqual([48, null, 1000]);
  });

  test('falls back to defaults for a stale column count', () => {
    window.localStorage.setItem(STORAGE_KEY, '[200,300]');

    const { resizer } = setup();

    expect(resizer.widths()).toEqual([100, null, 120]);
  });

  test('falls back to defaults for invalid stored data', () => {
    window.localStorage.setItem(STORAGE_KEY, 'not json');

    const { resizer } = setup();

    expect(resizer.widths()).toEqual([100, null, 120]);
  });

  test('stops tracking pointer moves after destroy', () => {
    const { mount, resizer } = setup();
    drag(mount, 0, 40, { drop: false });

    resizer.destroy();
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 900 }));

    expect(colWidths(mount)[0]).toBe('140px');
  });
});
