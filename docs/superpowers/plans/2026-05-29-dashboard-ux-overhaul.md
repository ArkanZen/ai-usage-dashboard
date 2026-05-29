# Dashboard UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply 7 UX fixes and replace the inline detail panels with modal overlays that support prev/next navigation and keyboard shortcuts.

**Architecture:** New `public/modal.js` ES module manages all modal DOM, state, and keyboard handling. `app.js` imports `openModal` and calls it from click handlers. CSS and HTML are updated to add modal rules and remove the old `detail-grid` section.

**Tech Stack:** Vanilla JS (ES modules), no build system. Server tests via `node --test`. Frontend verified manually in browser at `http://localhost:4173`.

---

### Task 1: Create public/modal.js

**Files:**
- Create: `public/modal.js`

- [ ] **Step 1: Write the file**

```js
let _state = { items: [], index: 0, renderContent: null, open: false };

const overlay = document.createElement('div');
overlay.id = 'modal-overlay';
overlay.setAttribute('role', 'dialog');
overlay.setAttribute('aria-modal', 'true');
overlay.innerHTML = `
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
`;
document.body.appendChild(overlay);

const elClose = overlay.querySelector('.modal-close');
const elPrev = overlay.querySelector('.modal-prev');
const elNext = overlay.querySelector('.modal-next');
const elHeading = overlay.querySelector('#modal-heading');
const elChip = overlay.querySelector('#modal-chip');
const elBody = overlay.querySelector('#modal-body');

function paint() {
  const { items, index, renderContent } = _state;
  const { heading, chip, bodyHtml } = renderContent(items[index], index, items.length);
  elHeading.textContent = heading;
  elChip.textContent = chip;
  elBody.innerHTML = bodyHtml;
  elPrev.disabled = index === 0;
  elNext.disabled = index === items.length - 1;
}

export function openModal({ items, index, renderContent }) {
  _state = { items, index, renderContent, open: true };
  paint();
  overlay.classList.add('visible');
  document.body.classList.add('modal-open');
  elClose.focus();
}

export function closeModal() {
  _state.open = false;
  overlay.classList.remove('visible');
  document.body.classList.remove('modal-open');
}

elClose.addEventListener('click', closeModal);
overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

elPrev.addEventListener('click', () => {
  if (_state.index > 0) { _state.index -= 1; paint(); }
});
elNext.addEventListener('click', () => {
  if (_state.index < _state.items.length - 1) { _state.index += 1; paint(); }
});

document.addEventListener('keydown', (e) => {
  if (!_state.open) return;
  if (e.key === 'Escape') { closeModal(); return; }
  if (e.key === 'ArrowLeft' && _state.index > 0) { _state.index -= 1; paint(); }
  if (e.key === 'ArrowRight' && _state.index < _state.items.length - 1) { _state.index += 1; paint(); }
});
```

- [ ] **Step 2: Confirm file exists**

Run: `ls public/modal.js`  
Expected: file listed.

- [ ] **Step 3: Commit**

```bash
git add public/modal.js
git commit -m "feat: add modal.js — overlay with prev/next and keyboard navigation"
```

---

### Task 2: Update public/styles.css

**Files:**
- Modify: `public/styles.css`

- [ ] **Step 1: Add modal styles**

Append the following block to the end of `styles.css` (before the last `@media` block):

```css
/* ── modal ──────────────────────────────────────────── */

body.modal-open {
  overflow: hidden;
}

#modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: none;
  align-items: center;
  justify-content: center;
  background: rgba(7, 9, 13, 0.82);
  backdrop-filter: blur(4px);
  padding: 24px;
}

#modal-overlay.visible {
  display: flex;
}

.modal {
  width: min(720px, calc(100vw - 48px));
  max-height: 80vh;
  overflow-y: auto;
  background: linear-gradient(180deg, rgba(16, 21, 29, 0.99), rgba(7, 9, 13, 0.99));
  border: 1px solid var(--line);
  box-shadow: 0 0 48px rgba(57, 200, 255, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  position: relative;
  padding: 24px 24px 28px;
  display: grid;
  gap: 20px;
}

.modal-close {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 28px;
  height: 28px;
  background: transparent;
  border: 1px solid var(--line);
  color: var(--muted);
  cursor: pointer;
  font-size: 16px;
  display: grid;
  place-items: center;
  padding: 0;
  line-height: 1;
}

.modal-close:hover {
  color: var(--text);
  border-color: var(--muted);
}

.modal-nav {
  display: grid;
  grid-template-columns: 36px 1fr 36px;
  gap: 10px;
  align-items: center;
  padding-right: 36px;
}

.modal-prev,
.modal-next {
  height: 36px;
  background: var(--panel);
  border: 1px solid var(--line);
  color: var(--muted);
  cursor: pointer;
  font-size: 16px;
  display: grid;
  place-items: center;
  padding: 0;
}

.modal-prev:hover:not(:disabled),
.modal-next:hover:not(:disabled) {
  color: var(--cyan);
  border-color: rgba(57, 200, 255, 0.4);
}

.modal-prev:disabled,
.modal-next:disabled {
  opacity: 0.28;
  cursor: not-allowed;
}

.modal-title {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.modal-title h3 {
  margin: 0;
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.modal-body {
  display: grid;
  gap: 14px;
}

.modal-body h4 {
  margin: 0 0 -6px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

/* ── selected states ─────────────────────────────────── */

.data-row.selected {
  background: rgba(65, 240, 162, 0.06);
  border-left: 2px solid var(--green);
  padding-left: 10px;
}

.day.selected {
  border-color: var(--cyan) !important;
  box-shadow: 0 0 0 1px var(--cyan), inset 0 0 10px rgba(57, 200, 255, 0.08);
}

/* ── expand button ───────────────────────────────────── */

.expand-btn {
  display: block;
  width: 100%;
  margin-top: 6px;
  padding: 8px;
  background: transparent;
  border: 1px dashed rgba(38, 50, 65, 0.9);
  color: var(--muted);
  cursor: pointer;
  font-size: 12px;
  text-align: center;
  font-family: inherit;
}

.expand-btn:hover {
  color: var(--green);
  border-color: rgba(65, 240, 162, 0.4);
}
```

- [ ] **Step 2: Remove detail-grid CSS rules**

Find and delete these four rule blocks (they are replaced by `.modal-body` equivalents added above):

```css
.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 16px;
}

.detail-panel {
  min-height: 320px;
}

.detail-body {
  display: grid;
  gap: 12px;
}

.detail-body h4 {
  margin: 2px 0 -4px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
}
```

**Do NOT remove** `.detail-summary` or `.sparkline` — they are reused inside modal body HTML.

- [ ] **Step 3: Run server tests to confirm no breakage**

Run: `npm test`  
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add public/styles.css
git commit -m "style: add modal, selected-state, expand-btn CSS; remove detail-grid rules"
```

---

### Task 3: public/app.js — timezone fix, selected re-apply, sidebar nav observer, sidebar paths

**Files:**
- Modify: `public/app.js`

- [ ] **Step 1: Add `getFirstWeekday` helper**

Add this function anywhere before `renderCalendar` (e.g., after `calendarLevel`):

```js
function getFirstWeekday(month, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' })
    .formatToParts(new Date(`${month}-01T12:00:00Z`));
  const day = parts.find((p) => p.type === 'weekday').value;
  return { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[day] ?? 0;
}
```

- [ ] **Step 2: Fix timezone bug in `renderCalendar`**

Replace lines (currently ~371-372):
```js
const firstDate = new Date(`${view.month}-01T00:00:00+08:00`);
const leadingEmptyDays = (firstDate.getDay() + 6) % 7;
```
with:
```js
const leadingEmptyDays = getFirstWeekday(view.month, state.report.timeZone);
```

- [ ] **Step 3: Re-apply selected class in `renderProjects`**

In `renderProjects`, the existing `querySelectorAll` block after setting `innerHTML` is:
```js
elements.projectList.querySelectorAll('.data-row[data-name]').forEach((node) => {
  node.addEventListener('click', () => {
    state.selectedProject = node.dataset.name;
    renderProjectDetail(view);
  });
});
```

Replace with (adds the `.selected` re-application line; keeps the click handler intact for now):
```js
elements.projectList.querySelectorAll('.data-row[data-name]').forEach((node) => {
  if (node.dataset.name === state.selectedProject) node.classList.add('selected');
  node.addEventListener('click', () => {
    state.selectedProject = node.dataset.name;
    renderProjectDetail(view);
  });
});
```

- [ ] **Step 4: Re-apply selected class in `renderCalendar`**

In `renderCalendar`, the existing `querySelectorAll` block is:
```js
elements.calendarGrid.querySelectorAll('.day[data-date]').forEach((node) => {
  node.addEventListener('click', () => {
    state.selectedDate = node.dataset.date;
    renderDayDetail(view);
  });
});
```

Replace with:
```js
elements.calendarGrid.querySelectorAll('.day[data-date]').forEach((node) => {
  if (node.dataset.date === state.selectedDate) node.classList.add('selected');
  node.addEventListener('click', () => {
    state.selectedDate = node.dataset.date;
    renderDayDetail(view);
  });
});
```

- [ ] **Step 5: Add `bindScrollObserver` function**

Add this new function after `bindEvents`:

```js
function bindScrollObserver() {
  const navLinks = [...document.querySelectorAll('.nav a')];
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const id = entry.target.id;
      navLinks.forEach((link) => {
        link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
      });
    });
  }, { rootMargin: '0px 0px -75% 0px', threshold: 0 });
  ['overview', 'trend', 'projects', 'calendar', 'models', 'source'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) observer.observe(el);
  });
}
```

- [ ] **Step 6: Call `bindScrollObserver` from `init`**

In `init`, after `bindEvents()`:
```js
async function init() {
  bindEvents();
  bindScrollObserver();   // ← add this line
  renderSourceSettings();
  await loadMonths();
  await loadReport();
}
```

- [ ] **Step 7: Remove static `active` class from HTML nav link**

In `public/index.html`, find:
```html
<a class="active" href="#overview">总览</a>
```
Replace with:
```html
<a href="#overview">总览</a>
```

- [ ] **Step 8: Add `updateSidebarPaths` function and call it from `renderSourceSettings`**

Add this function after `getDefaultSourceSettings`:

```js
function updateSidebarPaths() {
  const defaults = ['~/.codex', '~/.claude', '~/.gemini'];
  const values = [state.settings.codexRoot, state.settings.claudeRoot, state.settings.geminiRoot];
  const tools = ['Codex', 'Claude', 'Gemini'];
  document.querySelectorAll('.sidebar-note strong').forEach((el, i) => {
    const raw = values[i] || defaults[i];
    const display = raw.length > 22 ? `…${raw.slice(-20)}` : raw;
    el.textContent = `${tools[i]} · ${display}`;
  });
}
```

At the end of `renderSourceSettings`, add a call:
```js
function renderSourceSettings() {
  elements.codexRoot.value = state.settings.codexRoot;
  elements.claudeRoot.value = state.settings.claudeRoot;
  elements.geminiRoot.value = state.settings.geminiRoot;
  elements.timezoneSelect.value = state.settings.timeZone;
  updateSidebarPaths();   // ← add this line
}
```

- [ ] **Step 9: Run server tests**

Run: `npm test`  
Expected: all tests pass.

- [ ] **Step 10: Commit**

```bash
git add public/app.js public/index.html
git commit -m "fix: calendar timezone, selected highlights, sidebar nav observer, sidebar paths sync"
```

---

### Task 4: public/app.js — expand buttons for project and model lists

**Files:**
- Modify: `public/app.js`

- [ ] **Step 1: Add expand state to `state`**

The existing state object:
```js
const state = {
  report: null,
  previousReport: null,
  selectedTool: 'all',
  selectedProject: '',
  selectedDate: '',
  settings: loadSourceSettings()
};
```

Replace with:
```js
const state = {
  report: null,
  previousReport: null,
  selectedTool: 'all',
  selectedProject: '',
  selectedDate: '',
  projectsExpanded: false,
  modelsExpanded: false,
  settings: loadSourceSettings()
};
```

- [ ] **Step 2: Reset expand state on filter changes**

In `bindEvents`, find the `monthSelect` listener and add resets:
```js
elements.monthSelect.addEventListener('change', () => {
  state.projectsExpanded = false;
  state.modelsExpanded = false;
  loadReport();
});
```

Find the `toolSelect` listener and add resets:
```js
elements.toolSelect.addEventListener('change', () => {
  state.selectedTool = elements.toolSelect.value;
  state.selectedProject = '';
  state.selectedDate = '';
  state.projectsExpanded = false;
  state.modelsExpanded = false;
  render();
});
```

- [ ] **Step 3: Replace `renderProjects` to support expand**

Replace the entire `renderProjects` function with:

```js
function renderProjects(view) {
  const allRows = visibleRows(view.projects);
  const rows = state.projectsExpanded ? allRows : allRows.slice(0, 8);
  elements.projectList.innerHTML = renderRows(rows, view.summary.totalTokens, 'PROJECT', 'project');
  elements.projectList.querySelectorAll('.data-row[data-name]').forEach((node) => {
    if (node.dataset.name === state.selectedProject) node.classList.add('selected');
    node.addEventListener('click', () => {
      state.selectedProject = node.dataset.name;
      renderProjectDetail(view);
    });
  });
  if (allRows.length > 8) {
    const btn = document.createElement('button');
    btn.className = 'expand-btn';
    btn.textContent = state.projectsExpanded ? '收起' : `展开全部 (${allRows.length})`;
    btn.addEventListener('click', () => {
      state.projectsExpanded = !state.projectsExpanded;
      renderProjects(view);
    });
    elements.projectList.appendChild(btn);
  }
}
```

- [ ] **Step 4: Replace `renderModels` to support expand**

Replace the entire `renderModels` function with:

```js
function renderModels(view) {
  const allRows = visibleRows(view.models);
  const rows = state.modelsExpanded ? allRows : allRows.slice(0, 10);
  elements.modelList.innerHTML = renderRows(rows, view.summary.totalTokens, 'MODEL');
  if (allRows.length > 10) {
    const btn = document.createElement('button');
    btn.className = 'expand-btn';
    btn.textContent = state.modelsExpanded ? '收起' : `展开全部 (${allRows.length})`;
    btn.addEventListener('click', () => {
      state.modelsExpanded = !state.modelsExpanded;
      renderModels(view);
    });
    elements.modelList.appendChild(btn);
  }
}
```

- [ ] **Step 5: Run server tests**

Run: `npm test`  
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add public/app.js
git commit -m "feat: add expand/collapse buttons to project and model lists"
```

---

### Task 5: public/app.js + public/index.html — modal integration and cleanup

**Files:**
- Modify: `public/app.js`
- Modify: `public/index.html`

- [ ] **Step 1: Add import for `openModal` at top of app.js**

Add as the very first line of `public/app.js`:

```js
import { openModal } from './modal.js';
```

- [ ] **Step 2: Add `formatDayHeading` helper**

Add after `formatDateTime`:

```js
function formatDayHeading(dateStr, timeZone) {
  const weekday = new Intl.DateTimeFormat('zh-CN', { timeZone, weekday: 'short' })
    .format(new Date(`${dateStr}T12:00:00Z`));
  return `${dateStr}（${weekday}）`;
}
```

- [ ] **Step 3: Add `renderProjectModalContent` function**

Add after `formatDayHeading`:

```js
function renderProjectModalContent(project, index, total, view) {
  const daily = view.daily.map((day) => ({
    date: day.date,
    totalTokens: day.projects?.find((p) => p.name === project.name)?.totalTokens || 0
  }));
  const models = summarizeNestedDimension(view.daily, 'projects', project.name, 'models');
  const base = Math.max(project.totalTokens, 1);
  return {
    heading: project.name,
    chip: `第 ${index + 1} / ${total} 个项目`,
    bodyHtml: `
      <div class="detail-summary">
        <span>总量 <strong>${formatCompactTokens(project.totalTokens)}</strong></span>
        <span>调用 <strong>${formatInteger(project.calls)}</strong></span>
        <span>会话 <strong>${formatInteger(project.sessions)}</strong></span>
      </div>
      <h4>本月每日趋势</h4>
      <div class="sparkline" style="--day-count:${daily.length}">${renderSparkline(daily)}</div>
      <h4>工具拆分</h4>
      <div class="data-list">${renderRows(visibleRows(project.tools || []), base, 'TOOL')}</div>
      <h4>模型拆分</h4>
      <div class="data-list">${renderRows(visibleRows(models).slice(0, 6), base, 'MODEL')}</div>
    `
  };
}
```

- [ ] **Step 4: Add `renderDayModalContent` function**

Add after `renderProjectModalContent`:

```js
function renderDayModalContent(day, index, total, timeZone) {
  return {
    heading: formatDayHeading(day.date, timeZone),
    chip: `第 ${index + 1} / ${total} 个活跃日`,
    bodyHtml: `
      <div class="detail-summary">
        <span>总量 <strong>${formatCompactTokens(day.totalTokens)}</strong></span>
        <span>调用 <strong>${formatInteger(day.calls)}</strong></span>
        <span>会话 <strong>${formatInteger(day.sessions)}</strong></span>
      </div>
      <h4>工具拆分</h4>
      <div class="data-list">${renderRows(visibleRows(day.tools || []), day.totalTokens, 'TOOL')}</div>
      <h4>项目拆分</h4>
      <div class="data-list">${renderRows(visibleRows(day.projects || []).slice(0, 5), day.totalTokens, 'PROJECT')}</div>
      <h4>模型拆分</h4>
      <div class="data-list">${renderRows(visibleRows(day.models || []).slice(0, 5), day.totalTokens, 'MODEL')}</div>
    `
  };
}
```

- [ ] **Step 5: Add `openProjectModal` and `openDayModal` functions**

Add after `renderDayModalContent`:

```js
function openProjectModal(projectName) {
  const view = buildFilteredView(state.report, state.selectedTool);
  const items = visibleRows(view.projects);
  const index = items.findIndex((p) => p.name === projectName);
  if (index === -1) return;
  openModal({ items, index, renderContent: (item, idx, total) => renderProjectModalContent(item, idx, total, view) });
}

function openDayModal(date) {
  const view = buildFilteredView(state.report, state.selectedTool);
  const items = view.daily.filter((d) => d.totalTokens > 0);
  const index = items.findIndex((d) => d.date === date);
  if (index === -1) return;
  openModal({ items, index, renderContent: (item, idx, total) => renderDayModalContent(item, idx, total, state.report.timeZone) });
}
```

- [ ] **Step 6: Update `renderProjects` click handler to open modal**

In `renderProjects`, replace the `querySelectorAll` block:
```js
elements.projectList.querySelectorAll('.data-row[data-name]').forEach((node) => {
  if (node.dataset.name === state.selectedProject) node.classList.add('selected');
  node.addEventListener('click', () => {
    state.selectedProject = node.dataset.name;
    renderProjectDetail(view);
  });
});
```
with:
```js
elements.projectList.querySelectorAll('.data-row[data-name]').forEach((node) => {
  if (node.dataset.name === state.selectedProject) node.classList.add('selected');
  node.addEventListener('click', () => {
    const name = node.dataset.name;
    state.selectedProject = name;
    elements.projectList.querySelectorAll('.data-row').forEach((r) => r.classList.remove('selected'));
    node.classList.add('selected');
    openProjectModal(name);
  });
});
```

- [ ] **Step 7: Update `renderCalendar` click handler to open modal**

In `renderCalendar`, replace the `querySelectorAll` block:
```js
elements.calendarGrid.querySelectorAll('.day[data-date]').forEach((node) => {
  if (node.dataset.date === state.selectedDate) node.classList.add('selected');
  node.addEventListener('click', () => {
    state.selectedDate = node.dataset.date;
    renderDayDetail(view);
  });
});
```
with:
```js
elements.calendarGrid.querySelectorAll('.day[data-date]').forEach((node) => {
  if (node.dataset.date === state.selectedDate) node.classList.add('selected');
  node.addEventListener('click', () => {
    const day = view.daily.find((d) => d.date === node.dataset.date);
    if (!day?.totalTokens) return;
    state.selectedDate = node.dataset.date;
    elements.calendarGrid.querySelectorAll('.day').forEach((d) => d.classList.remove('selected'));
    node.classList.add('selected');
    openDayModal(node.dataset.date);
  });
});
```

- [ ] **Step 8: Update `renderBarChart` to add click handlers on bars**

In `renderBarChart`, find where `elements.barChart.innerHTML` is set. Change the template string to add `data-bar-date` on non-zero bars:

Replace:
```js
return `
  <div class="bar-item" title="${day.date}：${formatFullTokens(day.totalTokens)} tokens">
```
with:
```js
const barDateAttr = day.totalTokens ? ` data-bar-date="${day.date}"` : '';
return `
  <div class="bar-item"${barDateAttr} title="${day.date}：${formatFullTokens(day.totalTokens)} tokens">
```

Then after `elements.barChart.innerHTML = ...`, add:
```js
elements.barChart.querySelectorAll('[data-bar-date]').forEach((node) => {
  node.style.cursor = 'pointer';
  node.addEventListener('click', () => openDayModal(node.dataset.barDate));
});
```

- [ ] **Step 9: Remove `renderProjectDetail` and `renderDayDetail` calls from `render()`**

In `render()`, find and remove these two lines:
```js
renderProjectDetail(view);
renderDayDetail(view);
```

- [ ] **Step 10: Delete `renderProjectDetail` and `renderDayDetail` function definitions**

Remove the entire `renderProjectDetail` function (from `function renderProjectDetail(view) {` to its closing `}`).

Remove the entire `renderDayDetail` function (from `function renderDayDetail(view) {` to its closing `}`).

- [ ] **Step 11: Remove dead element references from `elements` object**

In the `elements` object literal, remove these four lines:
```js
projectDetailChip: document.querySelector('#project-detail-chip'),
projectDetailBody: document.querySelector('#project-detail-body'),
dayDetailChip: document.querySelector('#day-detail-chip'),
dayDetailBody: document.querySelector('#day-detail-body')
```

- [ ] **Step 12: Remove the detail-grid section from index.html**

In `public/index.html`, remove the entire block:
```html
<section class="detail-grid">
  <article class="panel detail-panel" id="project-detail">
    <div class="panel-head">
      <h3>项目详情</h3>
      <span class="chip" id="project-detail-chip">点击项目排行</span>
    </div>
    <div id="project-detail-body" class="detail-body"></div>
  </article>

  <article class="panel detail-panel" id="day-detail">
    <div class="panel-head">
      <h3>日期详情</h3>
      <span class="chip" id="day-detail-chip">点击日历日期</span>
    </div>
    <div id="day-detail-body" class="detail-body"></div>
  </article>
</section>
```

- [ ] **Step 13: Run server tests**

Run: `npm test`  
Expected: all tests pass.

- [ ] **Step 14: Commit**

```bash
git add public/app.js public/index.html
git commit -m "feat: replace detail panels with modal; add bar chart click; wire project/day modals"
```

---

### Task 6: Verify in browser

**Files:** none (read-only verification)

- [ ] **Step 1: Start the server**

Run: `npm start`  
Expected output: `AI 使用洞察仪表盘已启动：http://localhost:4173`

- [ ] **Step 2: Verify modal — project**

Open `http://localhost:4173`. Click any row in "项目用量排行".  
Expected:
- Modal overlay appears with project name as heading
- chip shows `第 N / M 个项目`
- sparkline, 工具拆分, 模型拆分 sections visible
- ← / → buttons navigate to adjacent projects, disable at boundaries
- `←` / `→` keyboard arrows work
- ESC and clicking backdrop close the modal

- [ ] **Step 3: Verify modal — day (calendar)**

Click a non-zero day cell in "月度日历视图".  
Expected:
- Modal appears with `YYYY-MM-DD（周X）` heading
- chip shows `第 N / M 个活跃日`
- 工具拆分, 项目拆分, 模型拆分 sections visible
- Navigation skips zero-token days

- [ ] **Step 4: Verify modal — day (bar chart)**

Click any non-zero bar in "每日 token 趋势".  
Expected: day modal opens for that date.

- [ ] **Step 5: Verify selected highlights**

Click a project row — that row gets a green left border.  
Click a calendar day — that cell gets a cyan border.  
Switch tool filter — highlights clear.

- [ ] **Step 6: Verify sidebar nav scroll**

Scroll down through the page.  
Expected: the active nav link in the sidebar updates as sections scroll into view.

- [ ] **Step 7: Verify sidebar paths**

Open "数据源设置", enter a custom Codex path, click "保存设置".  
Expected: sidebar bottom shows the custom path (truncated if long).

- [ ] **Step 8: Verify expand buttons**

If there are > 8 projects: an "展开全部 (N)" button appears below the list; clicking it shows all rows; clicking "收起" collapses back.

- [ ] **Step 9: Verify timezone fix**

In "数据源设置", change timezone to `America/Los_Angeles`, save, and check that the calendar first day-of-week aligns correctly for the selected month.
