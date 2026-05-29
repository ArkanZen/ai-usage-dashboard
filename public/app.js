const state = {
  report: null,
  previousReport: null,
  selectedTool: 'all',
  selectedProject: '',
  selectedDate: '',
  settings: loadSourceSettings()
};

const colors = {
  codex: 'var(--green)',
  claude: 'var(--yellow)',
  gemini: 'var(--cyan)',
  cached: 'var(--violet)',
  output: 'var(--cyan)'
};

const elements = {
  monthSelect: document.querySelector('#month-select'),
  toolSelect: document.querySelector('#tool-select'),
  refreshButton: document.querySelector('#refresh-button'),
  codexRoot: document.querySelector('#codex-root'),
  claudeRoot: document.querySelector('#claude-root'),
  geminiRoot: document.querySelector('#gemini-root'),
  timezoneSelect: document.querySelector('#timezone-select'),
  saveSourceButton: document.querySelector('#save-source-button'),
  resetSourceButton: document.querySelector('#reset-source-button'),
  loadingOverlay: document.querySelector('#loading-overlay'),
  loadingText: document.querySelector('#loading-text'),
  pageTitle: document.querySelector('#page-title'),
  status: document.querySelector('#status'),
  totalTokens: document.querySelector('#total-tokens'),
  tokenDetail: document.querySelector('#token-detail'),
  activeDays: document.querySelector('#active-days'),
  peakDay: document.querySelector('#peak-day'),
  calls: document.querySelector('#calls'),
  sessions: document.querySelector('#sessions'),
  projectCount: document.querySelector('#project-count'),
  modelCount: document.querySelector('#model-count'),
  barChart: document.querySelector('#bar-chart'),
  calendarGrid: document.querySelector('#calendar-grid'),
  projectList: document.querySelector('#project-list'),
  modelList: document.querySelector('#model-list'),
  toolShare: document.querySelector('#tool-share'),
  tokenParts: document.querySelector('#token-parts'),
  projectDetailChip: document.querySelector('#project-detail-chip'),
  projectDetailBody: document.querySelector('#project-detail-body'),
  dayDetailChip: document.querySelector('#day-detail-chip'),
  dayDetailBody: document.querySelector('#day-detail-body')
};

/**
 * 初始化页面事件和默认数据。
 * @returns {Promise<void>} 无返回值。
 * @throws {Error} API 请求失败时会在页面状态中展示错误。
 */
async function init() {
  bindEvents();
  renderSourceSettings();
  await loadMonths();
  await loadReport();
}

/**
 * 绑定筛选与刷新按钮事件。
 * @returns {void} 无返回值。
 * @throws {Error} 不抛出异常。
 */
function bindEvents() {
  elements.refreshButton.addEventListener('click', () => loadReport({ forceRefresh: true }));
  elements.saveSourceButton.addEventListener('click', () => {
    state.settings = readSourceSettings();
    saveSourceSettings(state.settings);
    loadReport({ forceRefresh: true });
  });
  elements.resetSourceButton.addEventListener('click', () => {
    state.settings = getDefaultSourceSettings();
    saveSourceSettings(state.settings);
    renderSourceSettings();
    loadReport({ forceRefresh: true });
  });
  elements.monthSelect.addEventListener('change', () => loadReport());
  elements.toolSelect.addEventListener('change', () => {
    state.selectedTool = elements.toolSelect.value;
    state.selectedProject = '';
    state.selectedDate = '';
    render();
  });
}

/**
 * 加载可筛选月份列表。
 * @returns {Promise<void>} 无返回值。
 * @throws {Error} API 请求失败时抛出异常。
 */
async function loadMonths() {
  const response = await fetch('/api/months');
  const data = await response.json();
  const currentMonth = new Date().toISOString().slice(0, 7);
  elements.monthSelect.innerHTML = data.months
    .map((month) => `<option value="${month}" ${month === currentMonth ? 'selected' : ''}>${month}</option>`)
    .join('');
}

/**
 * 按当前筛选条件加载用量报表。
 * @returns {Promise<void>} 无返回值。
 * @throws {Error} API 请求失败时会在页面状态中展示错误。
 */
async function loadReport({ forceRefresh = false } = {}) {
  setLoading(true, forceRefresh ? '正在重新扫描本地日志...' : '正在读取月度缓存或聚合本地日志...');
  setStatus(forceRefresh ? '正在重新扫描本地日志...' : '正在读取本地日志...');
  try {
    const month = elements.monthSelect.value || new Date().toISOString().slice(0, 7);
    const response = await fetch(`/api/usage?${buildUsageQuery(month, forceRefresh)}`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || '读取失败');
    }
    state.report = data;
    state.previousReport = await loadPreviousReport(month);
    render();
    const cacheText = data.cache?.hit ? `使用缓存：${formatDateTime(data.cache.cachedAt)}` : `重新聚合：${formatDateTime(data.generatedAt)}`;
    setStatus(`${cacheText}，统计时区：${data.timeZone}`);
  } catch (error) {
    setStatus(`读取失败：${error.message}`);
  } finally {
    setLoading(false);
  }
}

/**
 * 加载上月报表，用于顶部卡片环比展示；失败时返回空值避免影响主报表。
 * @param {string} month 当前月份。
 * @returns {Promise<object|null>} 返回上月报表或空值。
 * @throws {Error} 不向外抛出异常。
 */
async function loadPreviousReport(month) {
  try {
    const previousMonth = getPreviousMonth(month);
    const response = await fetch(`/api/usage?${buildUsageQuery(previousMonth, false)}`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * 计算上一个月份。
 * @param {string} month 当前月份，格式 YYYY-MM。
 * @returns {string} 返回上月字符串。
 * @throws {Error} 不抛出异常。
 */
function getPreviousMonth(month) {
  const [yearText, monthText] = month.split('-');
  const date = new Date(Date.UTC(Number(yearText), Number(monthText) - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * 构建用量 API 查询参数，包含月份、刷新标记、日志目录和时区。
 * @param {string} month 当前月份。
 * @param {boolean} forceRefresh 是否强制重新扫描。
 * @returns {string} 返回 URL 查询字符串。
 * @throws {Error} 不抛出异常。
 */
function buildUsageQuery(month, forceRefresh) {
  const params = new URLSearchParams({ month });
  if (forceRefresh) params.set('refresh', '1');
  if (state.settings.codexRoot) params.set('codexRoot', state.settings.codexRoot);
  if (state.settings.claudeRoot) params.set('claudeRoot', state.settings.claudeRoot);
  if (state.settings.geminiRoot) params.set('geminiRoot', state.settings.geminiRoot);
  if (state.settings.timeZone) params.set('timeZone', state.settings.timeZone);
  return params.toString();
}

/**
 * 将当前数据源设置渲染到表单。
 * @returns {void} 无返回值。
 * @throws {Error} 不抛出异常。
 */
function renderSourceSettings() {
  elements.codexRoot.value = state.settings.codexRoot;
  elements.claudeRoot.value = state.settings.claudeRoot;
  elements.geminiRoot.value = state.settings.geminiRoot;
  elements.timezoneSelect.value = state.settings.timeZone;
}

/**
 * 从表单读取数据源设置。
 * @returns {object} 返回数据源设置。
 * @throws {Error} 不抛出异常。
 */
function readSourceSettings() {
  return {
    codexRoot: elements.codexRoot.value.trim(),
    claudeRoot: elements.claudeRoot.value.trim(),
    geminiRoot: elements.geminiRoot.value.trim(),
    timeZone: elements.timezoneSelect.value
  };
}

/**
 * 从浏览器本地存储读取数据源设置。
 * @returns {object} 返回数据源设置。
 * @throws {Error} 不抛出异常，损坏配置会恢复默认值。
 */
function loadSourceSettings() {
  try {
    return { ...getDefaultSourceSettings(), ...JSON.parse(localStorage.getItem('ai-usage-source-settings') || '{}') };
  } catch {
    return getDefaultSourceSettings();
  }
}

/**
 * 保存数据源设置到浏览器本地存储。
 * @param {object} settings 数据源设置。
 * @returns {void} 无返回值。
 * @throws {Error} 不抛出异常。
 */
function saveSourceSettings(settings) {
  localStorage.setItem('ai-usage-source-settings', JSON.stringify(settings));
}

/**
 * 获取默认数据源设置。
 * @returns {object} 返回默认设置。
 * @throws {Error} 不抛出异常。
 */
function getDefaultSourceSettings() {
  return {
    codexRoot: '',
    claudeRoot: '',
    geminiRoot: '',
    timeZone: 'Asia/Shanghai'
  };
}

/**
 * 渲染完整仪表盘。
 * @returns {void} 无返回值。
 * @throws {Error} 不抛出异常。
 */
function render() {
  if (!state.report) return;
  const view = buildFilteredView(state.report, state.selectedTool);
  renderSummary(view);
  renderBarChart(view);
  renderCalendar(view);
  renderProjects(view);
  renderModels(view);
  renderToolShare(view);
  renderTokenParts(view);
  renderProjectDetail(view);
  renderDayDetail(view);
}

/**
 * 根据工具筛选生成前端视图数据。
 * @param {object} report 原始报表。
 * @param {string} selectedTool 当前工具筛选值。
 * @returns {object} 返回筛选后的视图数据。
 * @throws {Error} 不抛出异常。
 */
function buildFilteredView(report, selectedTool) {
  if (selectedTool === 'all') {
    return report;
  }
  const daily = report.daily.map((day) => {
    const selectedDay = day.tools.find((tool) => tool.name === selectedTool) || emptyDimension(selectedTool);
    return {
      ...selectedDay,
      date: day.date,
      tools: selectedDay.totalTokens ? [selectedDay] : [],
      projects: filterDimensionsByTool(day.projects || [], selectedTool),
      models: filterDimensionsByTool(day.models || [], selectedTool)
    };
  });
  const selected = report.tools.find((tool) => tool.name === selectedTool) || emptyDimension(selectedTool);
  return {
    ...report,
    summary: {
      ...selected,
      activeDays: daily.filter((day) => day.totalTokens > 0).length
    },
    daily,
    tools: [selected],
    projects: filterDimensionsByTool(report.projects, selectedTool),
    models: filterDimensionsByTool(report.models, selectedTool),
    tokenParts: {
      inputTokens: selected.inputTokens,
      cachedInputTokens: selected.cachedInputTokens,
      outputTokens: selected.outputTokens,
      reasoningOutputTokens: selected.reasoningOutputTokens
    }
  };
}

/**
 * 按工具过滤项目或模型维度，确保排行与当前工具筛选一致。
 * @param {object[]} dimensions 原始项目或模型维度数组。
 * @param {string} selectedTool 当前工具筛选值。
 * @returns {object[]} 返回只包含当前工具用量的维度数组。
 * @throws {Error} 不抛出异常。
 */
function filterDimensionsByTool(dimensions, selectedTool) {
  return dimensions
    .map((dimension) => {
      const toolBucket = dimension.tools?.find((tool) => tool.name === selectedTool);
      return toolBucket ? { ...toolBucket, name: dimension.name, tools: [toolBucket], models: filterDimensionsByTool(dimension.models || [], selectedTool) } : null;
    })
    .filter(Boolean)
    .sort((left, right) => right.totalTokens - left.totalTokens);
}

/**
 * 渲染顶部核心指标。
 * @param {object} view 当前视图数据。
 * @returns {void} 无返回值。
 * @throws {Error} 不抛出异常。
 */
function renderSummary(view) {
  const peak = view.daily.reduce((current, day) => day.totalTokens > current.totalTokens ? day : current, view.daily[0]);
  const previousView = state.previousReport ? buildFilteredView(state.previousReport, state.selectedTool) : null;
  elements.pageTitle.textContent = `${view.month} AI 使用洞察`;
  elements.totalTokens.textContent = formatCompactTokens(view.summary.totalTokens);
  elements.tokenDetail.textContent = `环比上月 ${formatMonthOverMonth(view.summary.totalTokens, previousView?.summary.totalTokens)}`;
  elements.activeDays.textContent = String(view.summary.activeDays || 0);
  elements.peakDay.textContent = peak?.totalTokens ? `峰值 ${peak.date.slice(5)}：${formatCompactTokens(peak.totalTokens)} / 环比 ${formatMonthOverMonth(view.summary.activeDays, previousView?.summary.activeDays)}` : '本月暂无用量';
  elements.calls.textContent = formatInteger(view.summary.calls);
  elements.sessions.textContent = `环比 ${formatMonthOverMonth(view.summary.calls, previousView?.summary.calls)} / 会话 ${formatInteger(view.summary.sessions)}`;
  elements.projectCount.textContent = String(view.projects.length);
  elements.modelCount.textContent = `环比 ${formatMonthOverMonth(view.projects.length, previousView?.projects.length)} / 模型 ${view.models.length}`;
}

/**
 * 渲染每日 token 柱状图，柱子顶部显示具体 token。
 * @param {object} view 当前视图数据。
 * @returns {void} 无返回值。
 * @throws {Error} 不抛出异常。
 */
function renderBarChart(view) {
  const maxTokens = Math.max(...view.daily.map((day) => day.totalTokens), 1);
  elements.barChart.style.setProperty('--day-count', view.daily.length);
  elements.barChart.innerHTML = view.daily.map((day) => {
    const height = day.totalTokens ? Math.max(2, Math.round((day.totalTokens / maxTokens) * 100)) : 2;
    const dominantTool = dominantToolName(view, day);
    const className = day.totalTokens === 0 ? 'bar zero' : dominantTool === 'Claude CLI' ? 'bar claude' : dominantTool === 'Gemini CLI' ? 'bar gemini' : 'bar';
    return `
      <div class="bar-item" title="${day.date}：${formatFullTokens(day.totalTokens)} tokens">
        <div class="bar-track">
          <div class="bar-value" style="bottom:calc(${height}% + 6px)">${formatCompactTokens(day.totalTokens)}</div>
          <div class="${className}" style="height:${height}%"></div>
        </div>
        <div class="bar-day">${day.date.slice(-2)}</div>
      </div>
    `;
  }).join('');
}

/**
 * 渲染月度日历视图，每个日期显示具体 token 数。
 * @param {object} view 当前视图数据。
 * @returns {void} 无返回值。
 * @throws {Error} 不抛出异常。
 */
function renderCalendar(view) {
  const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const firstDate = new Date(`${view.month}-01T00:00:00+08:00`);
  const leadingEmptyDays = (firstDate.getDay() + 6) % 7;
  const maxTokens = Math.max(...view.daily.map((day) => day.totalTokens), 1);
  const weekdayHtml = weekdays.map((day) => `<div class="weekday">${day}</div>`).join('');
  const emptyHtml = Array.from({ length: leadingEmptyDays }, () => '<div class="day empty"></div>').join('');
  const dayHtml = view.daily.map((day) => {
    const level = calendarLevel(day.totalTokens, maxTokens);
    const tool = dominantToolName(view, day);
    return `
      <div class="day ${level}" data-date="${day.date}" title="${day.date}：${formatFullTokens(day.totalTokens)} tokens">
        <span class="date">${day.date.slice(-2)}</span>
        <span class="tokens">${formatCompactTokens(day.totalTokens)}</span>
        <span class="tools">${day.totalTokens ? toolLabel(tool) : '-'}</span>
      </div>
    `;
  }).join('');
  elements.calendarGrid.innerHTML = `${weekdayHtml}${emptyHtml}${dayHtml}`;
  elements.calendarGrid.querySelectorAll('.day[data-date]').forEach((node) => {
    node.addEventListener('click', () => {
      state.selectedDate = node.dataset.date;
      renderDayDetail(view);
    });
  });
}

/**
 * 渲染项目排行列表。
 * @param {object} view 当前视图数据。
 * @returns {void} 无返回值。
 * @throws {Error} 不抛出异常。
 */
function renderProjects(view) {
  elements.projectList.innerHTML = renderRows(visibleRows(view.projects).slice(0, 8), view.summary.totalTokens, 'PROJECT', 'project');
  elements.projectList.querySelectorAll('.data-row[data-name]').forEach((node) => {
    node.addEventListener('click', () => {
      state.selectedProject = node.dataset.name;
      renderProjectDetail(view);
    });
  });
}

/**
 * 渲染模型维度列表。
 * @param {object} view 当前视图数据。
 * @returns {void} 无返回值。
 * @throws {Error} 不抛出异常。
 */
function renderModels(view) {
  elements.modelList.innerHTML = renderRows(visibleRows(view.models).slice(0, 10), view.summary.totalTokens, 'MODEL');
}

/**
 * 过滤掉没有 token 用量的排行项，避免工具调用占位数据出现在维度列表。
 * @param {object[]} rows 原始排行数组。
 * @returns {object[]} 返回有实际 token 用量的排行数组。
 * @throws {Error} 不抛出异常。
 */
function visibleRows(rows) {
  return rows.filter((row) => row.totalTokens > 0);
}

/**
 * 渲染工具占比。
 * @param {object} view 当前视图数据。
 * @returns {void} 无返回值。
 * @throws {Error} 不抛出异常。
 */
function renderToolShare(view) {
  const total = Math.max(...view.tools.map((tool) => tool.totalTokens), view.summary.totalTokens, 1);
  elements.toolShare.innerHTML = view.tools.length
    ? view.tools.map((tool) => renderMetricLine(tool.name, tool.totalTokens, total, colorForTool(tool.name))).join('')
    : renderMetricLine('暂无数据', 0, 1, colors.codex);
}

/**
 * 渲染 token 构成。
 * @param {object} view 当前视图数据。
 * @returns {void} 无返回值。
 * @throws {Error} 不抛出异常。
 */
function renderTokenParts(view) {
  const parts = [
    ['输入', view.tokenParts.inputTokens, colors.codex],
    ['缓存', view.tokenParts.cachedInputTokens, colors.cached],
    ['输出', view.tokenParts.outputTokens, colors.output],
    ['推理输出', view.tokenParts.reasoningOutputTokens, colors.claude]
  ];
  const total = Math.max(parts.reduce((sum, item) => sum + item[1], 0), 1);
  elements.tokenParts.innerHTML = parts.map(([name, value, color]) => renderMetricLine(name, value, total, color, { minVisiblePercent: 3 })).join('');
}

/**
 * 渲染通用排行行。
 * @param {object[]} rows 排行数据。
 * @param {number} totalTokens 总 token。
 * @param {string} fallbackTag 默认标签。
 * @returns {string} 返回 HTML 字符串。
 * @throws {Error} 不抛出异常。
 */
function renderRows(rows, totalTokens, fallbackTag, rowType = '') {
  if (!rows.length) {
    return '<div class="data-row"><span>暂无数据</span><span>0</span><span class="tag">EMPTY</span></div>';
  }
  return rows.map((row) => {
    const percent = totalTokens ? Math.round((row.totalTokens / totalTokens) * 100) : 0;
    const tag = totalTokens ? `${percent}%` : fallbackTag;
    const typeAttr = rowType ? ` data-type="${rowType}" data-name="${escapeHtml(row.name)}"` : '';
    return `<div class="data-row"${typeAttr}><span>${escapeHtml(row.name)}</span><span>${formatCompactTokens(row.totalTokens)}</span><span class="tag">${tag}</span></div>`;
  }).join('');
}

/**
 * 渲染当前选中项目的工具、模型和每日趋势。
 * @param {object} view 当前视图数据。
 * @returns {void} 无返回值。
 * @throws {Error} 不抛出异常。
 */
function renderProjectDetail(view) {
  const project = view.projects.find((item) => item.name === state.selectedProject) || visibleRows(view.projects)[0];
  if (!project) {
    elements.projectDetailChip.textContent = '暂无项目';
    elements.projectDetailBody.innerHTML = '<p class="empty-text">当前筛选条件下暂无项目数据。</p>';
    return;
  }
  state.selectedProject = project.name;
  const daily = view.daily.map((day) => {
    const item = day.projects?.find((entry) => entry.name === project.name);
    return { date: day.date, totalTokens: item?.totalTokens || 0 };
  });
  const models = summarizeNestedDimension(view.daily, 'projects', project.name, 'models');
  elements.projectDetailChip.textContent = project.name;
  elements.projectDetailBody.innerHTML = `
    <div class="detail-summary">
      <span>总量 <strong>${formatCompactTokens(project.totalTokens)}</strong></span>
      <span>调用 <strong>${formatInteger(project.calls)}</strong></span>
      <span>会话 <strong>${formatInteger(project.sessions)}</strong></span>
    </div>
    <div class="sparkline" style="--day-count:${daily.length}">${renderSparkline(daily)}</div>
    <h4>工具拆分</h4>
    <div class="data-list">${renderRows(visibleRows(project.tools || []).slice(0, 4), project.totalTokens, 'TOOL')}</div>
    <h4>模型拆分</h4>
    <div class="data-list">${renderRows(visibleRows(models).slice(0, 4), project.totalTokens, 'MODEL')}</div>
  `;
}

/**
 * 渲染当前选中日期的工具、项目和模型拆分。
 * @param {object} view 当前视图数据。
 * @returns {void} 无返回值。
 * @throws {Error} 不抛出异常。
 */
function renderDayDetail(view) {
  const day = view.daily.find((item) => item.date === state.selectedDate)
    || view.daily.reduce((current, item) => item.totalTokens > current.totalTokens ? item : current, view.daily[0]);
  if (!day || !day.totalTokens) {
    elements.dayDetailChip.textContent = '暂无日期';
    elements.dayDetailBody.innerHTML = '<p class="empty-text">当前筛选条件下暂无日期数据。</p>';
    return;
  }
  state.selectedDate = day.date;
  elements.dayDetailChip.textContent = day.date;
  elements.dayDetailBody.innerHTML = `
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
  `;
}

/**
 * 汇总选中项目在每日记录中的嵌套维度。
 * @param {object[]} daily 每日记录。
 * @param {string} parentKey 父级维度字段名。
 * @param {string} parentName 父级维度名称。
 * @param {string} childKey 子级维度字段名。
 * @returns {object[]} 返回汇总后的子维度排行。
 * @throws {Error} 不抛出异常。
 */
function summarizeNestedDimension(daily, parentKey, parentName, childKey) {
  const map = new Map();
  for (const day of daily) {
    const parent = day[parentKey]?.find((item) => item.name === parentName);
    for (const child of parent?.[childKey] || []) {
      const current = map.get(child.name) || emptyDimension(child.name);
      current.totalTokens += child.totalTokens;
      current.inputTokens += child.inputTokens;
      current.cachedInputTokens += child.cachedInputTokens;
      current.outputTokens += child.outputTokens;
      current.reasoningOutputTokens += child.reasoningOutputTokens;
      current.calls += child.calls;
      current.sessions += child.sessions;
      map.set(child.name, current);
    }
  }
  return [...map.values()].sort((left, right) => right.totalTokens - left.totalTokens);
}

/**
 * 渲染项目详情中的迷你每日趋势。
 * @param {object[]} daily 每日项目数据。
 * @returns {string} 返回 HTML 字符串。
 * @throws {Error} 不抛出异常。
 */
function renderSparkline(daily) {
  const maxTokens = Math.max(...daily.map((day) => day.totalTokens), 1);
  return daily.map((day) => {
    const height = day.totalTokens ? Math.max(3, Math.round((day.totalTokens / maxTokens) * 40)) : 3;
    return `<span title="${day.date}：${formatFullTokens(day.totalTokens)} tokens" style="height:${height}px"></span>`;
  }).join('');
}

/**
 * 格式化环比上月文案。
 * @param {number} current 当前值。
 * @param {number} previous 上月值。
 * @returns {string} 返回环比文案。
 * @throws {Error} 不抛出异常。
 */
function formatMonthOverMonth(current, previous) {
  if (!previous) return '无上月数据';
  const percent = ((current - previous) / previous) * 100;
  const sign = percent >= 0 ? '+' : '';
  return `${sign}${trimNumber(percent)}%`;
}

/**
 * 渲染横向占比条。
 * @param {string} name 指标名称。
 * @param {number} value 指标数值。
 * @param {number} total 总数值。
 * @param {string} color 填充颜色。
 * @returns {string} 返回 HTML 字符串。
 * @throws {Error} 不抛出异常。
 */
function renderMetricLine(name, value, total, color, options = {}) {
  const actualWidth = total ? (value / total) * 100 : 0;
  const minVisiblePercent = options.minVisiblePercent || 0;
  const width = value && actualWidth < minVisiblePercent ? minVisiblePercent : Math.round(actualWidth);
  return `
    <div class="metric-line">
      <span>${escapeHtml(name)}</span>
      <div class="track" title="实际占比 ${trimNumber(actualWidth)}%">
        <div class="fill ${value && actualWidth < minVisiblePercent ? 'min-visible' : ''}" style="width:${width}%;background:${color}"></div>
      </div>
      <span class="metric-value">${formatCompactTokens(value)}</span>
    </div>
  `;
}

/**
 * 获取日历格颜色强度等级。
 * @param {number} value 当日 token。
 * @param {number} maxTokens 月内最大 token。
 * @returns {string} 返回 CSS 等级类名。
 * @throws {Error} 不抛出异常。
 */
function calendarLevel(value, maxTokens) {
  if (!value) return '';
  const ratio = value / maxTokens;
  if (ratio >= 0.35) return 'hot';
  if (ratio >= 0.08) return 'mid';
  return 'low';
}

/**
 * 推断某天的主导工具名称。
 * @param {object} view 当前视图数据。
 * @param {object} day 每日记录。
 * @returns {string} 返回工具名称。
 * @throws {Error} 不抛出异常。
 */
function dominantToolName(view, day) {
  if (state.selectedTool !== 'all') return state.selectedTool;
  const codex = day.tools?.find((tool) => tool.name === 'Codex')?.totalTokens || 0;
  const claude = day.tools?.find((tool) => tool.name === 'Claude CLI')?.totalTokens || 0;
  const gemini = day.tools?.find((tool) => tool.name === 'Gemini CLI')?.totalTokens || 0;
  if (!day.totalTokens) return '-';
  const activeTools = [codex, claude, gemini].filter(Boolean).length;
  if (activeTools > 1) return 'Mixed';
  if (gemini > codex && gemini > claude) return 'Gemini CLI';
  return claude > codex ? 'Claude CLI' : 'Codex';
}

/**
 * 将工具名称转换为短标签。
 * @param {string} tool 工具名称。
 * @returns {string} 返回短标签。
 * @throws {Error} 不抛出异常。
 */
function toolLabel(tool) {
  if (tool === 'Claude CLI') return 'Claude';
  if (tool === 'Gemini CLI') return 'Gemini';
  if (tool === 'Codex') return 'Codex';
  return 'Mixed';
}

/**
 * 根据工具名称返回对应的图表颜色。
 * @param {string} tool 工具名称。
 * @returns {string} 返回 CSS 颜色变量。
 * @throws {Error} 不抛出异常。
 */
function colorForTool(tool) {
  if (tool === 'Claude CLI') return colors.claude;
  if (tool === 'Gemini CLI') return colors.gemini;
  return colors.codex;
}

/**
 * 创建空维度对象。
 * @param {string} name 维度名称。
 * @returns {object} 返回空维度计数对象。
 * @throws {Error} 不抛出异常。
 */
function emptyDimension(name) {
  return {
    name,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
    calls: 0,
    toolCalls: 0,
    userMessages: 0,
    sessions: 0
  };
}

/**
 * 格式化紧凑 token 数字。
 * @param {number} value token 数值。
 * @returns {string} 返回紧凑显示字符串。
 * @throws {Error} 不抛出异常。
 */
function formatCompactTokens(value) {
  if (!value) return '0';
  if (value >= 1_000_000_000) return `${trimNumber(value / 1_000_000_000)}B`;
  if (value >= 1_000_000) return `${trimNumber(value / 1_000_000)}M`;
  if (value >= 1_000) return `${trimNumber(value / 1_000)}K`;
  return String(Math.round(value));
}

/**
 * 格式化完整 token 数字。
 * @param {number} value token 数值。
 * @returns {string} 返回带千分位的字符串。
 * @throws {Error} 不抛出异常。
 */
function formatFullTokens(value) {
  return Math.round(value || 0).toLocaleString('zh-CN');
}

/**
 * 格式化整数。
 * @param {number} value 整数值。
 * @returns {string} 返回带千分位的字符串。
 * @throws {Error} 不抛出异常。
 */
function formatInteger(value) {
  return Math.round(value || 0).toLocaleString('zh-CN');
}

/**
 * 格式化更新时间。
 * @param {string} isoTime ISO 时间字符串。
 * @returns {string} 返回本地时间字符串。
 * @throws {Error} 不抛出异常。
 */
function formatDateTime(isoTime) {
  return new Date(isoTime).toLocaleString('zh-CN', { hour12: false });
}

/**
 * 去掉小数尾部无效零。
 * @param {number} value 需要格式化的小数。
 * @returns {string} 返回最多一位小数的字符串。
 * @throws {Error} 不抛出异常。
 */
function trimNumber(value) {
  return value.toFixed(1).replace(/\.0$/, '');
}

/**
 * 转义 HTML 文本，避免日志中的项目名影响页面结构。
 * @param {string} value 原始文本。
 * @returns {string} 返回安全 HTML 文本。
 * @throws {Error} 不抛出异常。
 */
function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/**
 * 设置页面底部状态文本。
 * @param {string} message 状态文本。
 * @returns {void} 无返回值。
 * @throws {Error} 不抛出异常。
 */
function setStatus(message) {
  elements.status.textContent = message;
}

/**
 * 设置全局加载态和刷新按钮状态。
 * @param {boolean} isLoading 是否处于加载中。
 * @param {string} [message] 加载提示文本。
 * @returns {void} 无返回值。
 * @throws {Error} 不抛出异常。
 */
function setLoading(isLoading, message = '正在聚合本地 AI 使用日志...') {
  elements.loadingOverlay.classList.toggle('visible', isLoading);
  elements.loadingText.textContent = message;
  elements.refreshButton.disabled = isLoading;
  elements.refreshButton.textContent = isLoading ? '读取中' : '刷新';
  document.body.classList.toggle('is-loading', isLoading);
}

init();
