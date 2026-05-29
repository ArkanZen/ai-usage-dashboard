# Dashboard UX Overhaul Design

**Date:** 2026-05-29  
**Status:** Approved

## Overview

Two parallel tracks:

1. **Fix & polish** — seven targeted improvements to existing interactions and bugs
2. **Modal detail views** — replace the inline "项目详情 / 日期详情" dual-panel with overlay modals that support prev/next navigation and keyboard arrows

## Architecture

New file: `public/modal.js` (ES module, imported by `index.html`)  
Changed files: `public/app.js`, `public/styles.css`, `public/index.html`

`modal.js` owns: modal DOM, open/close lifecycle, prev/next state, keyboard handler.  
`app.js` calls `openModal(type, index, dataFn)` — it does not touch modal DOM directly.

---

## Track 1 — Fix & Polish

### 1. Calendar timezone bug

`app.js:371` hardcodes `+08:00` when computing the first weekday of the month:

```js
// before
const firstDate = new Date(`${view.month}-01T00:00:00+08:00`);
```

Fix: use `Intl.DateTimeFormat` with `report.timeZone` to get the day-of-week for the 1st, matching the same method used elsewhere in the parser.

```js
function getFirstWeekday(month, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' })
    .formatToParts(new Date(`${month}-01T12:00:00Z`));
  const day = parts.find(p => p.type === 'weekday').value;
  const map = { Mon:0, Tue:1, Wed:2, Thu:3, Fri:4, Sat:5, Sun:6 };
  return map[day] ?? 0;
}
```

### 2. Project row selected highlight

`renderProjects` adds `class="selected"` to the row whose `data-name` matches `state.selectedProject`.  
CSS: `.data-row.selected` — green left border + faint green background tint.

### 3. Calendar day selected highlight

`renderCalendar` adds `class="selected"` to the `.day` cell whose `data-date` matches `state.selectedDate`.  
CSS: `.day.selected` — cyan border + slightly brighter background, distinct from `.hot/.mid/.low`.

### 4. Sidebar nav follows scroll

`bindEvents` sets up one `IntersectionObserver` watching the six section anchors (`#overview`, `#trend`, `#calendar`, `#projects`, `#models`, `#source`). When a section enters the viewport, its corresponding `<a>` in `.nav` gets `.active`; others lose it.

The static `class="active"` on the `#overview` link in HTML is removed; the observer sets the initial state on first paint.

### 5. Sidebar data source paths sync

`renderSourceSettings` (called on init and after save/reset) also updates the three `<strong>` lines in `.sidebar-note`:

- If a custom root is set → show the custom path (truncated to last 24 chars with `…` prefix if long)
- If empty (default) → show `~/.codex`, `~/.claude`, `~/.gemini`

### 6. Bar chart click → day modal

`renderBarChart` adds `cursor: pointer` and a `click` handler to every `.bar-item` that has `totalTokens > 0`. Clicking calls `openDayModal(dayIndex)`. Zero-token bars remain non-interactive.

### 7. Project / model list expand

When `view.projects.length > 8` (or `view.models.length > 10`), a `<button class="expand-btn">展开全部 (N)</button>` appears below the list. Clicking toggles `state.projectsExpanded` / `state.modelsExpanded` and re-renders with the full list. Button text becomes "收起" when expanded.

The expand state resets to `false` when month or tool filter changes.

---

## Track 2 — Modal Detail Views

### Removal

The `<section class="detail-grid">` block (containing `#project-detail` and `#day-detail` panels) is removed from `index.html`. The corresponding `renderProjectDetail` and `renderDayDetail` functions in `app.js` are replaced by `openProjectModal` and `openDayModal` call sites. The `.detail-grid`, `.detail-panel`, `.detail-body`, `.detail-summary`, `.sparkline` CSS rules are removed.

### modal.js — public API

```js
// Open a modal. type = 'project' | 'day'
// items: ordered array of data objects
// index: which item to show first
export function openModal({ type, items, index, renderContent })

// Close programmatically (also called internally by ESC / backdrop click)
export function closeModal()
```

`renderContent(item, index, total)` → returns `{ heading, chip, bodyHtml }`. modal.js writes `heading` to `#modal-heading`, `chip` to `#modal-chip`, and `bodyHtml` to `#modal-body`. Defined in `app.js`, passed in on open.

### Modal DOM structure

```html
<div id="modal-overlay" role="dialog" aria-modal="true">
  <div class="modal">
    <button class="modal-close" aria-label="关闭">×</button>
    <div class="modal-nav">
      <button class="modal-prev" aria-label="上一个">←</button>
      <div class="modal-title">
        <h3 id="modal-heading"></h3>
        <span class="chip" id="modal-chip"></span>
      </div>
      <button class="modal-next" aria-label="下一个">→</button>
    </div>
    <div class="modal-body" id="modal-body"></div>
  </div>
</div>
```

Injected once into `<body>` by `modal.js` on module load. Hidden via `display:none` / `.visible` toggle.

### Sizing

```css
.modal {
  width: min(720px, calc(100vw - 48px));
  max-height: 80vh;
  overflow-y: auto;
}
```

### Navigation

- Prev/next buttons update the internal index and re-call `renderContent`.
- At index 0: prev button `disabled`. At last index: next button `disabled`.
- `←` / `→` keyboard keys fire prev/next when modal is open.
- `ESC` closes. Clicking `#modal-overlay` (but not `.modal`) closes.
- Focus is trapped inside the modal while open (`modal-close`, `modal-prev`, `modal-next` are the focusable elements).

### Navigation data

**Project modal** — `items` = `view.projects` filtered to `totalTokens > 0`, same order as the project list. Triggered by clicking any project row.

**Day modal** — `items` = `view.daily` filtered to `totalTokens > 0`, in calendar order (01→end of month). Triggered by clicking a calendar day cell OR clicking a bar in the bar chart.

### Modal content: project

```
[ 总量 ]  [ 调用 ]  [ 会话 ]        ← detail-summary 3-cell grid

本月每日趋势
[ sparkline — 31 columns ]

工具拆分
[ metric-line rows with progress bar ]

模型拆分
[ metric-line rows with progress bar ]
```

chip text: `第 N / M 个项目`

### Modal content: day

```
[ 总量 ]  [ 调用 ]  [ 会话 ]

工具拆分
[ metric-line rows ]

项目拆分（top 5）
[ metric-line rows ]

模型拆分（top 5）
[ metric-line rows ]
```

chip text: `第 N / M 个活跃日`  
Title: `YYYY-MM-DD（周X）` — weekday computed via `Intl.DateTimeFormat` with `report.timeZone`.

---

## File Changelist

| File | Change |
|------|--------|
| `public/index.html` | Add `<script type="module" src="/modal.js">`, remove `detail-grid` section |
| `public/modal.js` | New file — modal DOM, lifecycle, keyboard, prev/next |
| `public/app.js` | Fix timezone bug, add selected states, observer nav, sidebar sync, bar click, expand buttons, call `openModal` instead of inline detail render |
| `public/styles.css` | Add modal styles, selected states, expand button; remove detail-grid rules |

---

## Out of Scope

- Multi-month comparison charts
- CSV/JSON export
- Cost estimation ($ per token)
- Mobile-optimised modal layout (existing responsive breakpoints apply)
