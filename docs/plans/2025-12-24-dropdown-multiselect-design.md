# Dropdown Multi-Select Filters Design

> Replace filter chips with dropdown multi-selects using checkboxes.

## Overview

Convert the status and type filter chips to dropdown menus with checkboxes, allowing multi-select in a more compact UI.

### Current UI
```
Status: [Ready] [Open] [In Progress] [Closed]
Types:  [Bug] [Feature] [Task] [Epic] [Chore]
```

### New UI
```
[Status: Any ▾] [Types: Any ▾] [Search...]
```

When clicked, dropdown shows checkboxes:
```
┌─────────────────┐
│ ☐ Ready         │
│ ☐ Open          │
│ ☐ In Progress   │
│ ☐ Closed        │
└─────────────────┘
```

## Display Logic

- Nothing selected → "Status: Any" / "Types: Any"
- 1 item selected → "Status: Open" (show the name)
- 2+ items selected → "Status (2)" or "Types (3)"

## Behavior

- Click dropdown button → toggle open/closed
- Click checkbox → toggle that filter (keeps dropdown open)
- Click outside → close dropdown
- Opening one dropdown closes the other
- Multiple selections allowed
- Empty selection = show all

## State Model

Existing filter state (unchanged):
```js
let status_filters = [];   // string[]
let type_filters = [];     // string[]
```

New UI state:
```js
let status_dropdown_open = false;
let type_dropdown_open = false;
```

## Component Structure

```js
html`
  <div class="filter-dropdown ${open ? 'is-open' : ''}">
    <button class="filter-dropdown__trigger" @click=${toggle}>
      ${label}: ${displayText}
      <span class="filter-dropdown__arrow">▾</span>
    </button>
    <div class="filter-dropdown__menu">
      ${options.map(opt => html`
        <label class="filter-dropdown__option">
          <input type="checkbox"
            .checked=${selected.includes(opt.value)}
            @change=${() => onToggle(opt.value)}
          />
          ${opt.label}
        </label>
      `)}
    </div>
  </div>
`
```

## Display Text Helper

```js
function getDisplayText(selected, label) {
  if (selected.length === 0) return 'Any';
  if (selected.length === 1) return formatLabel(selected[0]);
  return `(${selected.length})`;
}
```

## CSS Styling

```css
/* Dropdown container */
.filter-dropdown {
  position: relative;
  display: inline-block;
}

/* Trigger button */
.filter-dropdown__trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 4px 8px;
  font-size: 12px;
  background: var(--panel-bg);
  border: 1px solid var(--border);
  border-radius: var(--badge-radius);
  cursor: pointer;
}

.filter-dropdown__trigger:hover {
  border-color: var(--link);
}

.filter-dropdown__arrow {
  font-size: 10px;
  opacity: 0.6;
}

/* Dropdown menu */
.filter-dropdown__menu {
  display: none;
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  min-width: 140px;
  background: var(--panel-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  z-index: 100;
}

.filter-dropdown.is-open .filter-dropdown__menu {
  display: block;
}

/* Checkbox options */
.filter-dropdown__option {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 6px 10px;
  cursor: pointer;
  font-size: 12px;
}

.filter-dropdown__option:hover {
  background: var(--hover-bg);
}
```

## Event Handling

Toggle handlers:
```js
const toggleStatusDropdown = (e) => {
  e.stopPropagation();
  status_dropdown_open = !status_dropdown_open;
  type_dropdown_open = false;
  doRender();
};

const toggleTypeDropdown = (e) => {
  e.stopPropagation();
  type_dropdown_open = !type_dropdown_open;
  status_dropdown_open = false;
  doRender();
};
```

Click outside to close:
```js
function setupClickOutside() {
  const handler = (e) => {
    if (!e.target.closest('.filter-dropdown')) {
      if (status_dropdown_open || type_dropdown_open) {
        status_dropdown_open = false;
        type_dropdown_open = false;
        doRender();
      }
    }
  };
  document.addEventListener('click', handler);
  return () => document.removeEventListener('click', handler);
}
```

## Files to Change

1. `app/views/list.js` - Replace chips with dropdown template
2. `app/styles.css` - Add `.filter-dropdown` styles
3. `app/views/list.test.js` - Update filter interaction tests

## Testing

- Dropdown opens on trigger click
- Checkbox toggles filter value
- Click outside closes dropdown
- Multi-select displays count correctly
- "Any" displays when nothing selected
- Opening one dropdown closes the other
