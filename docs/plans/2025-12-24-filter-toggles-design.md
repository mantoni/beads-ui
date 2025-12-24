# Filter Toggles Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace dropdown selectors with multi-select toggle chips for filtering issues by status and type.

**Architecture:** Convert single-value string filters to array-based multi-select. Reuse existing badge color system for toggle chips with ghost opacity for inactive state.

**Tech Stack:** lit-html, CSS custom properties, Vitest

**Issue**: [#19 - Categories should be Toggles](https://github.com/mantoni/beads-ui/issues/19)

---

## Task 1: Add CSS for Filter Chips

**Files:**
- Modify: `app/styles.css` (after line ~725, after `.badge-select` styles)

**Step 1: Add filter chip base styles**

Add after the `.badge-select:focus` rule (around line 741):

```css
/* Filter chip toggles */
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
}

.filter-group {
  display: flex;
  gap: var(--space-1);
  align-items: center;
}

.filter-group__label {
  font-size: 11px;
  color: var(--muted);
  margin-right: var(--space-1);
}

.filter-chip {
  display: inline-block;
  padding: 0 8px;
  line-height: 20px;
  height: 20px;
  border-radius: var(--badge-radius);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  border: none;
  transition: opacity 0.15s ease;
}

.filter-chip:not(.is-active) {
  opacity: 0.35;
}

.filter-chip:hover:not(.is-active) {
  opacity: 0.6;
}

.filter-chip.is-active {
  opacity: 1;
}

.filter-chip:focus {
  outline: 2px solid color-mix(in srgb, var(--link) 50%, transparent);
  outline-offset: var(--outline-offset-m);
}

/* Status filter chips */
.filter-chip--ready {
  background: var(--badge-bg-open);
  color: var(--badge-fg-open);
}

.filter-chip--open {
  background: var(--badge-bg-open);
  color: var(--badge-fg-open);
}

.filter-chip--in_progress {
  background: var(--badge-bg-in-progress);
  color: var(--badge-fg-in-progress);
}

.filter-chip--closed {
  background: var(--badge-bg-closed);
  color: var(--badge-fg-closed);
}

/* Type filter chips */
.filter-chip--bug {
  background: var(--badge-bg-bug);
  color: var(--badge-fg-bug);
}

.filter-chip--feature {
  background: var(--badge-bg-feature);
  color: var(--badge-fg-feature);
}

.filter-chip--task {
  background: var(--badge-bg-task);
  color: var(--badge-fg-task);
}

.filter-chip--epic {
  background: var(--badge-bg-epic);
  color: var(--badge-fg-epic);
}

.filter-chip--chore {
  background: var(--badge-bg-chore);
  color: var(--badge-fg-chore);
}
```

**Step 2: Run build to verify CSS is valid**

Run: `npm run build`
Expected: Build succeeds with no CSS errors

**Step 3: Commit**

```bash
git add app/styles.css
git commit -m "style: add filter chip CSS for toggle filters"
```

---

## Task 2: Write Failing Test for Multi-Select Status Filter

**Files:**
- Modify: `app/views/list.test.js`

**Step 1: Add test for multi-select status filtering**

Add after the last test (around line 595):

```js
test('filters by multiple statuses with toggle chips', async () => {
  document.body.innerHTML = '<aside id="mount" class="panel"></aside>';
  const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
  const issues = [
    { id: 'UI-1', title: 'Alpha', status: 'open', priority: 1 },
    { id: 'UI-2', title: 'Beta', status: 'in_progress', priority: 2 },
    { id: 'UI-3', title: 'Gamma', status: 'closed', priority: 3 }
  ];
  const issueStores = createTestIssueStores();
  issueStores.getStore('tab:issues').applyPush({
    type: 'snapshot',
    id: 'tab:issues',
    revision: 1,
    issues
  });
  const view = createListView(
    mount,
    async () => [],
    undefined,
    undefined,
    undefined,
    issueStores
  );
  await view.load();

  // Find status filter chips
  const openChip = mount.querySelector('.filter-chip--open');
  const inProgressChip = mount.querySelector('.filter-chip--in_progress');

  expect(openChip).not.toBeNull();
  expect(inProgressChip).not.toBeNull();

  // Click open chip to select it
  openChip?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await Promise.resolve();

  // Should show only open issues
  let rows = Array.from(mount.querySelectorAll('tr.issue-row')).map(
    (el) => el.getAttribute('data-issue-id') || ''
  );
  expect(rows).toEqual(['UI-1']);

  // Click in_progress chip to add it (multi-select)
  inProgressChip?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await Promise.resolve();

  // Should show both open and in_progress
  rows = Array.from(mount.querySelectorAll('tr.issue-row')).map(
    (el) => el.getAttribute('data-issue-id') || ''
  );
  expect(rows).toEqual(['UI-1', 'UI-2']);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run app/views/list.test.js`
Expected: FAIL - filter chips don't exist yet

**Step 3: Commit failing test**

```bash
git add app/views/list.test.js
git commit -m "test: add failing test for multi-select status filter"
```

---

## Task 3: Convert Status Filter to Array and Add Toggle Chips

**Files:**
- Modify: `app/views/list.js`

**Step 1: Change status_filter from string to array**

In `app/views/list.js`, change line 50:

```js
// Before:
let status_filter = 'all';

// After:
/** @type {string[]} */
let status_filters = [];
```

**Step 2: Add normalizeFilters helper for migration**

Add after line 60 (after `let unsubscribe = null;`):

```js
/**
 * Normalize legacy string filter to array format.
 * @param {string | string[] | undefined} val
 * @returns {string[]}
 */
function normalizeStatusFilter(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string' && val !== '' && val !== 'all') return [val];
  return [];
}
```

**Step 3: Update store initialization**

Change lines 126-133:

```js
// Before:
if (store) {
  const s = store.getState();
  if (s && s.filters && typeof s.filters === 'object') {
    status_filter = s.filters.status || 'all';
    search_text = s.filters.search || '';
    type_filter = typeof s.filters.type === 'string' ? s.filters.type : '';
  }
}

// After:
if (store) {
  const s = store.getState();
  if (s && s.filters && typeof s.filters === 'object') {
    status_filters = normalizeStatusFilter(s.filters.status);
    search_text = s.filters.search || '';
    type_filter = typeof s.filters.type === 'string' ? s.filters.type : '';
  }
}
```

**Step 4: Add toggle handler**

Replace `onStatusChange` function (lines 81-92):

```js
/**
 * Toggle a status filter chip.
 * @param {string} status
 */
const toggleStatusFilter = async (status) => {
  if (status_filters.includes(status)) {
    status_filters = status_filters.filter((s) => s !== status);
  } else {
    status_filters = [...status_filters, status];
  }
  log('status toggle %s -> %o', status, status_filters);
  if (store) {
    store.setState({ filters: { status: status_filters } });
  }
  await load();
};
```

**Step 5: Update filter logic in template function**

Change lines 142-147:

```js
// Before:
let filtered = issues_cache;
if (status_filter !== 'all' && status_filter !== 'ready') {
  filtered = filtered.filter(
    (it) => String(it.status || '') === status_filter
  );
}

// After:
let filtered = issues_cache;
if (status_filters.length > 0 && !status_filters.includes('ready')) {
  filtered = filtered.filter((it) =>
    status_filters.includes(String(it.status || ''))
  );
}
```

**Step 6: Update closed sorting condition**

Change line 162:

```js
// Before:
if (status_filter === 'closed') {

// After:
if (status_filters.length === 1 && status_filters[0] === 'closed') {
```

**Step 7: Replace status select with filter chips in template**

Replace lines 168-174 (the status select):

```js
// Before:
<select @change=${onStatusChange} .value=${status_filter}>
  <option value="all">All</option>
  <option value="ready">Ready</option>
  <option value="open">${statusLabel('open')}</option>
  <option value="in_progress">${statusLabel('in_progress')}</option>
  <option value="closed">${statusLabel('closed')}</option>
</select>

// After:
<div class="filter-group">
  <span class="filter-group__label">Status:</span>
  <button
    class="filter-chip filter-chip--ready ${status_filters.includes('ready') ? 'is-active' : ''}"
    @click=${() => toggleStatusFilter('ready')}
  >Ready</button>
  <button
    class="filter-chip filter-chip--open ${status_filters.includes('open') ? 'is-active' : ''}"
    @click=${() => toggleStatusFilter('open')}
  >${statusLabel('open')}</button>
  <button
    class="filter-chip filter-chip--in_progress ${status_filters.includes('in_progress') ? 'is-active' : ''}"
    @click=${() => toggleStatusFilter('in_progress')}
  >${statusLabel('in_progress')}</button>
  <button
    class="filter-chip filter-chip--closed ${status_filters.includes('closed') ? 'is-active' : ''}"
    @click=${() => toggleStatusFilter('closed')}
  >${statusLabel('closed')}</button>
</div>
```

**Step 8: Update store subscription handler**

Change lines 425-436:

```js
// Before:
if (s.filters && typeof s.filters === 'object') {
  const next_status = s.filters.status;
  ...
  if (next_status !== status_filter) {
    status_filter = next_status;
    void load();
    return;
  }

// After:
if (s.filters && typeof s.filters === 'object') {
  const next_status = normalizeStatusFilter(s.filters.status);
  const next_search = s.filters.search || '';
  const next_type =
    typeof s.filters.type === 'string' ? s.filters.type : '';
  let needs_render = false;
  const status_changed = JSON.stringify(next_status) !== JSON.stringify(status_filters);
  if (status_changed) {
    status_filters = next_status;
    void load();
    return;
  }
```

**Step 9: Run test to verify it passes**

Run: `npm test -- --run app/views/list.test.js`
Expected: The new multi-select status test passes

**Step 10: Commit**

```bash
git add app/views/list.js
git commit -m "feat: convert status filter to multi-select toggle chips"
```

---

## Task 4: Write Failing Test for Multi-Select Type Filter

**Files:**
- Modify: `app/views/list.test.js`

**Step 1: Add test for multi-select type filtering**

Add after the previous test:

```js
test('filters by multiple types with toggle chips', async () => {
  document.body.innerHTML = '<aside id="mount" class="panel"></aside>';
  const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
  const issues = [
    { id: 'UI-1', title: 'A', status: 'open', issue_type: 'bug' },
    { id: 'UI-2', title: 'B', status: 'open', issue_type: 'feature' },
    { id: 'UI-3', title: 'C', status: 'open', issue_type: 'task' },
    { id: 'UI-4', title: 'D', status: 'open', issue_type: 'epic' }
  ];
  const issueStores = createTestIssueStores();
  issueStores.getStore('tab:issues').applyPush({
    type: 'snapshot',
    id: 'tab:issues',
    revision: 1,
    issues
  });
  const view = createListView(
    mount,
    async () => [],
    undefined,
    undefined,
    undefined,
    issueStores
  );
  await view.load();

  // Find type filter chips
  const bugChip = mount.querySelector('.filter-chip--bug');
  const featureChip = mount.querySelector('.filter-chip--feature');

  expect(bugChip).not.toBeNull();
  expect(featureChip).not.toBeNull();

  // Click bug chip
  bugChip?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await Promise.resolve();

  let rows = Array.from(mount.querySelectorAll('tr.issue-row')).map(
    (el) => el.getAttribute('data-issue-id') || ''
  );
  expect(rows).toEqual(['UI-1']);

  // Click feature chip to add it
  featureChip?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await Promise.resolve();

  rows = Array.from(mount.querySelectorAll('tr.issue-row')).map(
    (el) => el.getAttribute('data-issue-id') || ''
  );
  expect(rows).toEqual(['UI-1', 'UI-2']);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run app/views/list.test.js`
Expected: FAIL - type filter chips don't exist yet

**Step 3: Commit failing test**

```bash
git add app/views/list.test.js
git commit -m "test: add failing test for multi-select type filter"
```

---

## Task 5: Convert Type Filter to Array and Add Toggle Chips

**Files:**
- Modify: `app/views/list.js`

**Step 1: Change type_filter from string to array**

Change line 56:

```js
// Before:
let type_filter = '';

// After:
/** @type {string[]} */
let type_filters = [];
```

**Step 2: Add normalizeTypeFilter helper**

Add after `normalizeStatusFilter`:

```js
/**
 * Normalize legacy string filter to array format.
 * @param {string | string[] | undefined} val
 * @returns {string[]}
 */
function normalizeTypeFilter(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string' && val !== '') return [val];
  return [];
}
```

**Step 3: Update store initialization for type**

In the store init block, change:

```js
// Before:
type_filter = typeof s.filters.type === 'string' ? s.filters.type : '';

// After:
type_filters = normalizeTypeFilter(s.filters.type);
```

**Step 4: Replace onTypeChange with toggle handler**

Replace `onTypeChange` function:

```js
/**
 * Toggle a type filter chip.
 * @param {string} type
 */
const toggleTypeFilter = (type) => {
  if (type_filters.includes(type)) {
    type_filters = type_filters.filter((t) => t !== type);
  } else {
    type_filters = [...type_filters, type];
  }
  log('type toggle %s -> %o', type, type_filters);
  if (store) {
    store.setState({ filters: { type: type_filters } });
  }
  doRender();
};
```

**Step 5: Update type filter logic in template**

Change the type filtering block:

```js
// Before:
if (type_filter) {
  filtered = filtered.filter(
    (it) => String(it.issue_type || '') === String(type_filter)
  );
}

// After:
if (type_filters.length > 0) {
  filtered = filtered.filter((it) =>
    type_filters.includes(String(it.issue_type || ''))
  );
}
```

**Step 6: Replace type select with filter chips**

Replace the type select element:

```js
// Before:
<select
  @change=${onTypeChange}
  .value=${type_filter}
  aria-label="Filter by type"
>
  <option value="">All types</option>
  ${ISSUE_TYPES.map(
    (t) =>
      html`<option value=${t} ?selected=${type_filter === t}>
        ${typeLabel(t)}
      </option>`
  )}
</select>

// After:
<div class="filter-group">
  <span class="filter-group__label">Types:</span>
  ${ISSUE_TYPES.map(
    (t) => html`
      <button
        class="filter-chip filter-chip--${t} ${type_filters.includes(t) ? 'is-active' : ''}"
        @click=${() => toggleTypeFilter(t)}
      >${typeLabel(t)}</button>
    `
  )}
</div>
```

**Step 7: Update store subscription for type filter**

In the subscription handler, update type comparison:

```js
// Before:
if (next_type !== type_filter) {
  type_filter = next_type;
  needs_render = true;
}

// After:
const next_type_arr = normalizeTypeFilter(s.filters.type);
const type_changed = JSON.stringify(next_type_arr) !== JSON.stringify(type_filters);
if (type_changed) {
  type_filters = next_type_arr;
  needs_render = true;
}
```

**Step 8: Run tests**

Run: `npm test -- --run app/views/list.test.js`
Expected: All tests pass

**Step 9: Commit**

```bash
git add app/views/list.js
git commit -m "feat: convert type filter to multi-select toggle chips"
```

---

## Task 6: Wrap Filter Bar in Container

**Files:**
- Modify: `app/views/list.js`

**Step 1: Wrap filter groups in filter-bar container**

In the template, wrap the two filter groups and search in a filter-bar div:

```js
<div class="panel__header">
  <div class="filter-bar">
    <div class="filter-group">
      <span class="filter-group__label">Status:</span>
      <!-- status chips -->
    </div>
    <div class="filter-group">
      <span class="filter-group__label">Types:</span>
      <!-- type chips -->
    </div>
  </div>
  <input type="search" ... />
</div>
```

**Step 2: Run tests**

Run: `npm test -- --run`
Expected: All tests pass

**Step 3: Commit**

```bash
git add app/views/list.js
git commit -m "feat: wrap filter chips in filter-bar container"
```

---

## Task 7: Update Existing Tests for New Filter UI

**Files:**
- Modify: `app/views/list.test.js`

**Step 1: Update tests that use select elements**

Tests that query `select` elements for filtering need to be updated to use filter chips instead. Update the following tests:

- `filters by status and search` - click filter chips instead of changing select value
- `filters by issue type and combines with search` - use type chips
- `applies type filters after Ready reload` - use chips
- `initializes type filter from store and reflects in controls` - check chip active state
- `ready filter via select composes from push membership` - use ready chip
- `switching ready → all reloads full list` - use chips
- `applies persisted filters from store on initial load` - check chip states

**Step 2: Run all tests**

Run: `npm test -- --run`
Expected: All tests pass

**Step 3: Commit**

```bash
git add app/views/list.test.js
git commit -m "test: update filter tests for toggle chip UI"
```

---

## Task 8: Add Test for Empty Selection Shows All

**Files:**
- Modify: `app/views/list.test.js`

**Step 1: Add test for deselection behavior**

```js
test('deselecting all chips shows all issues', async () => {
  document.body.innerHTML = '<aside id="mount" class="panel"></aside>';
  const mount = /** @type {HTMLElement} */ (document.getElementById('mount'));
  const issues = [
    { id: 'UI-1', title: 'A', status: 'open' },
    { id: 'UI-2', title: 'B', status: 'closed' }
  ];
  const issueStores = createTestIssueStores();
  issueStores.getStore('tab:issues').applyPush({
    type: 'snapshot',
    id: 'tab:issues',
    revision: 1,
    issues
  });
  const view = createListView(
    mount,
    async () => [],
    undefined,
    undefined,
    undefined,
    issueStores
  );
  await view.load();

  // Initially all shown
  expect(mount.querySelectorAll('tr.issue-row').length).toBe(2);

  // Click open to filter
  const openChip = mount.querySelector('.filter-chip--open');
  openChip?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await Promise.resolve();
  expect(mount.querySelectorAll('tr.issue-row').length).toBe(1);

  // Click open again to deselect - should show all
  openChip?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await Promise.resolve();
  expect(mount.querySelectorAll('tr.issue-row').length).toBe(2);
});
```

**Step 2: Run test**

Run: `npm test -- --run app/views/list.test.js`
Expected: PASS

**Step 3: Commit**

```bash
git add app/views/list.test.js
git commit -m "test: add test for empty filter selection showing all"
```

---

## Task 9: Final Integration Test

**Files:**
- None (manual testing)

**Step 1: Run full test suite**

Run: `npm test -- --run`
Expected: All tests pass

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Manual testing**

Run: `npm run dev`

Test:
1. Click status chips - verify multi-select works
2. Click type chips - verify multi-select works
3. Combine status + type filters
4. Verify inactive chips have ghost appearance
5. Verify active chips have full color
6. Verify hover effect on inactive chips

**Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address integration issues"
```

---

## Summary

**Files changed:**
1. `app/styles.css` - Add filter chip styles
2. `app/views/list.js` - Convert filters to multi-select arrays, add toggle chips
3. `app/views/list.test.js` - Update tests for new UI

**Key changes:**
- `status_filter: string` → `status_filters: string[]`
- `type_filter: string` → `type_filters: string[]`
- `<select>` elements → `<button class="filter-chip">` toggles
- Filter logic: `=== value` → `.includes(value)`
- Empty array = show all (no explicit "All" option)
