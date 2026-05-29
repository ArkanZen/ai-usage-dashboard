import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';

const DEFAULT_TIME_ZONE = 'Asia/Shanghai';
const EMPTY_USAGE = Object.freeze({
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens: 0,
  calls: 0,
  toolCalls: 0,
  userMessages: 0
});

/**
 * 解析指定月份的 AI CLI 本地日志，并输出前端可直接消费的多维度统计。
 * @param {object} options 解析配置。
 * @param {string} options.month 目标月份，格式为 YYYY-MM。
 * @param {string} [options.timeZone] 自然日统计使用的时区。
 * @param {string} [options.codexRoot] Codex 本地数据根目录。
 * @param {string} [options.claudeRoot] Claude CLI 本地数据根目录。
 * @param {string} [options.geminiRoot] Gemini CLI 本地数据根目录。
 * @returns {Promise<object>} 返回月度汇总、每日明细、工具分布、项目分布与模型分布。
 * @throws {Error} 当月份格式非法时抛出错误。
 */
export async function buildUsageReport(options) {
  const month = validateMonth(options.month);
  const timeZone = options.timeZone || DEFAULT_TIME_ZONE;
  const codexRoot = options.codexRoot || path.join(os.homedir(), '.codex');
  const claudeRoot = options.claudeRoot || path.join(os.homedir(), '.claude');
  const geminiRoot = options.geminiRoot || path.join(os.homedir(), '.gemini');

  const days = createMonthDays(month);
  const report = {
    month,
    timeZone,
    generatedAt: new Date().toISOString(),
    summary: createSummary(),
    daily: days.map((day) => createDailyRecord(day)),
    tools: [],
    projects: [],
    models: [],
    tokenParts: createTokenParts()
  };
  const dayMap = new Map(report.daily.map((day) => [day.date, day]));
  const aggregate = createAggregateState();

  await parseCodexLogs({ root: codexRoot, month, timeZone, dayMap, aggregate });
  await parseClaudeLogs({ root: claudeRoot, month, timeZone, dayMap, aggregate });
  await parseGeminiLogs({ root: geminiRoot, month, timeZone, dayMap, aggregate });

  finalizeReport(report, aggregate);
  return report;
}

/**
 * 解析 Gemini CLI 临时聊天日志，按 tokens 字段累加用量。
 * @param {object} context 解析上下文。
 * @param {string} context.root Gemini 数据根目录。
 * @param {string} context.month 目标月份。
 * @param {string} context.timeZone 自然日统计时区。
 * @param {Map<string, object>} context.dayMap 每日记录索引。
 * @param {object} context.aggregate 全局聚合状态。
 * @returns {Promise<void>} 无返回值，结果写入聚合状态。
 * @throws {Error} 文件读取异常会向上抛出。
 */
async function parseGeminiLogs(context) {
  const chatRoot = path.join(context.root, 'tmp');
  const files = (await listFiles(chatRoot, '.jsonl')).filter((file) => file.includes(`${path.sep}chats${path.sep}`));
  const countedMessages = new Set();

  for (const file of files) {
    await readJsonLines(file, (entry) => {
      const timestamp = entry.timestamp;
      if (!timestamp || entry.type !== 'gemini' || !entry.tokens) return;
      const dateKey = formatDateInTimeZone(timestamp, context.timeZone);
      if (!dateKey.startsWith(context.month)) return;

      const messageKey = `${file}:${entry.id || timestamp}`;
      if (countedMessages.has(messageKey)) return;
      countedMessages.add(messageKey);

      const sessionId = path.basename(file);
      const project = projectNameFromPath(path.dirname(path.dirname(file)));
      const model = entry.model || '未知模型';
      addUsage(context, {
        dateKey,
        tool: 'Gemini CLI',
        project,
        model,
        sessionId,
        usage: normalizeGeminiUsage(entry.tokens)
      });

      const toolCallCount = Array.isArray(entry.toolCalls) ? entry.toolCalls.length : 0;
      for (let index = 0; index < toolCallCount; index += 1) {
        addToolCall(context, dateKey, 'Gemini CLI', project, model, sessionId);
      }
    });
  }
}

/**
 * 校验月份字符串并返回规范化结果。
 * @param {string} month 待校验月份，格式为 YYYY-MM。
 * @returns {string} 返回原始月份字符串。
 * @throws {Error} 当月份格式或月份范围非法时抛出错误。
 */
export function validateMonth(month) {
  if (!/^\d{4}-\d{2}$/.test(month || '')) {
    throw new Error('月份格式必须是 YYYY-MM');
  }
  const monthNumber = Number(month.slice(5, 7));
  if (monthNumber < 1 || monthNumber > 12) {
    throw new Error('月份必须在 01 到 12 之间');
  }
  return month;
}

/**
 * 生成当前月份可选列表，默认包含近 12 个月。
 * @param {number} count 需要生成的月份数量。
 * @returns {string[]} 返回从近到远排列的月份数组。
 * @throws {Error} 当数量小于 1 时抛出错误。
 */
export function listRecentMonths(count = 12) {
  if (count < 1) {
    throw new Error('月份数量必须大于 0');
  }
  const months = [];
  const current = new Date();
  for (let index = 0; index < count; index += 1) {
    const date = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - index, 1));
    months.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

/**
 * 解析 Codex 会话日志，按 token_count 事件累加调用用量。
 * @param {object} context 解析上下文。
 * @param {string} context.root Codex 数据根目录。
 * @param {string} context.month 目标月份。
 * @param {string} context.timeZone 自然日统计时区。
 * @param {Map<string, object>} context.dayMap 每日记录索引。
 * @param {object} context.aggregate 全局聚合状态。
 * @returns {Promise<void>} 无返回值，结果写入聚合状态。
 * @throws {Error} 文件读取异常会向上抛出。
 */
async function parseCodexLogs(context) {
  const [year, monthNumber] = context.month.split('-');
  const sessionRoot = path.join(context.root, 'sessions', year, monthNumber);
  const files = await listFiles(sessionRoot, '.jsonl');

  for (const file of files) {
    const session = {
      id: path.basename(file),
      cwd: '未知项目',
      model: '未知模型'
    };
    await readJsonLines(file, (entry) => {
      const timestamp = entry.timestamp;
      if (!timestamp) return;
      const dateKey = formatDateInTimeZone(timestamp, context.timeZone);
      if (!dateKey.startsWith(context.month)) return;

      if (entry.type === 'session_meta') {
        session.cwd = entry.payload?.cwd || session.cwd;
        session.model = entry.payload?.model || entry.payload?.model_provider || session.model;
        return;
      }
      if (entry.type === 'turn_context') {
        session.cwd = entry.payload?.cwd || session.cwd;
        session.model = entry.payload?.model || session.model;
        return;
      }

      const payload = entry.payload || {};
      if (payload.type === 'token_count') {
        const usage = normalizeCodexUsage(payload.info?.last_token_usage);
        addUsage(context, {
          dateKey,
          tool: 'Codex',
          project: projectNameFromPath(session.cwd),
          model: session.model,
          sessionId: session.id,
          usage
        });
      }
      if (payload.type === 'function_call') {
        addToolCall(context, dateKey, 'Codex', projectNameFromPath(session.cwd), session.model, session.id);
      }
      if (payload.type === 'message' && payload.role === 'user') {
        addUserMessage(context, dateKey, 'Codex', projectNameFromPath(session.cwd), session.model, session.id);
      }
    });
  }
}

/**
 * 解析 Claude CLI 项目日志，按 assistant message 的 usage 字段累加用量。
 * @param {object} context 解析上下文。
 * @param {string} context.root Claude 数据根目录。
 * @param {string} context.month 目标月份。
 * @param {string} context.timeZone 自然日统计时区。
 * @param {Map<string, object>} context.dayMap 每日记录索引。
 * @param {object} context.aggregate 全局聚合状态。
 * @returns {Promise<void>} 无返回值，结果写入聚合状态。
 * @throws {Error} 文件读取异常会向上抛出。
 */
async function parseClaudeLogs(context) {
  const projectRoot = path.join(context.root, 'projects');
  const files = await listFiles(projectRoot, '.jsonl');
  const countedMessages = new Set();

  for (const file of files) {
    await readJsonLines(file, (entry) => {
      const timestamp = entry.timestamp;
      if (!timestamp) return;
      const dateKey = formatDateInTimeZone(timestamp, context.timeZone);
      if (!dateKey.startsWith(context.month)) return;

      const message = entry.message;
      const cwd = entry.cwd || projectFromClaudePath(file);
      const project = projectNameFromPath(cwd);
      const model = message?.model || '未知模型';
      const sessionId = entry.sessionId || path.basename(file);

      if (message?.role === 'assistant' && message.usage && message.id) {
        const messageKey = `${sessionId}:${message.id}`;
        if (!countedMessages.has(messageKey)) {
          countedMessages.add(messageKey);
          addUsage(context, {
            dateKey,
            tool: 'Claude CLI',
            project,
            model,
            sessionId,
            usage: normalizeClaudeUsage(message.usage)
          });
        }
      }
      if (Array.isArray(message?.content)) {
        const toolCallCount = message.content.filter((item) => item?.type === 'tool_use').length;
        for (let index = 0; index < toolCallCount; index += 1) {
          addToolCall(context, dateKey, 'Claude CLI', project, model, sessionId);
        }
      }
      if (message?.role === 'user') {
        addUserMessage(context, dateKey, 'Claude CLI', project, model, sessionId);
      }
    });
  }
}

/**
 * 递归列出指定后缀的文件。
 * @param {string} root 需要扫描的根目录。
 * @param {string} extension 文件后缀，例如 .jsonl。
 * @returns {Promise<string[]>} 返回符合后缀的绝对路径列表。
 * @throws {Error} 读取目录失败时抛出错误，目录不存在时返回空数组。
 */
async function listFiles(root, extension) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  const entries = await fs.promises.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const filePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(filePath, extension));
    } else if (entry.isFile() && entry.name.endsWith(extension)) {
      files.push(filePath);
    }
  }
  return files;
}

/**
 * 按行读取 JSONL 文件，跳过无法解析的损坏行。
 * @param {string} file 需要读取的 JSONL 文件路径。
 * @param {(entry: object) => void} onEntry 每条 JSON 记录的处理函数。
 * @returns {Promise<void>} 无返回值。
 * @throws {Error} 文件读取失败时抛出错误。
 */
async function readJsonLines(file, onEntry) {
  const input = fs.createReadStream(file, { encoding: 'utf8' });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    try {
      onEntry(JSON.parse(line));
    } catch {
      // 损坏日志行不会影响其他有效记录的统计。
    }
  }
}

/**
 * 标准化 Codex token 用量字段。
 * @param {object} usage Codex last_token_usage 对象。
 * @returns {object} 返回统一 token 字段。
 * @throws {Error} 不抛出异常，缺失字段按 0 处理。
 */
function normalizeCodexUsage(usage = {}) {
  return {
    inputTokens: numberValue(usage.input_tokens),
    cachedInputTokens: numberValue(usage.cached_input_tokens),
    outputTokens: numberValue(usage.output_tokens),
    reasoningOutputTokens: numberValue(usage.reasoning_output_tokens),
    totalTokens: numberValue(usage.total_tokens),
    calls: 1,
    toolCalls: 0,
    userMessages: 0
  };
}

/**
 * 标准化 Claude CLI token 用量字段。
 * @param {object} usage Claude message.usage 对象。
 * @returns {object} 返回统一 token 字段。
 * @throws {Error} 不抛出异常，缺失字段按 0 处理。
 */
function normalizeClaudeUsage(usage = {}) {
  const inputTokens = numberValue(usage.input_tokens);
  const cachedInputTokens = numberValue(usage.cache_read_input_tokens) + numberValue(usage.cache_creation_input_tokens);
  const outputTokens = numberValue(usage.output_tokens);
  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningOutputTokens: 0,
    totalTokens: inputTokens + cachedInputTokens + outputTokens,
    calls: 1,
    toolCalls: 0,
    userMessages: 0
  };
}

/**
 * 标准化 Gemini CLI token 用量字段。
 * @param {object} tokens Gemini 日志中的 tokens 对象。
 * @returns {object} 返回统一 token 字段。
 * @throws {Error} 不抛出异常，缺失字段按 0 处理。
 */
function normalizeGeminiUsage(tokens = {}) {
  const inputTokens = numberValue(tokens.input);
  const cachedInputTokens = numberValue(tokens.cached);
  const outputTokens = numberValue(tokens.output) + numberValue(tokens.tool);
  const reasoningOutputTokens = numberValue(tokens.thoughts);
  const totalTokens = numberValue(tokens.total) || inputTokens + cachedInputTokens + outputTokens + reasoningOutputTokens;
  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningOutputTokens,
    totalTokens,
    calls: 1,
    toolCalls: 0,
    userMessages: 0
  };
}

/**
 * 累加一次模型调用用量。
 * @param {object} context 聚合上下文。
 * @param {object} event 单次调用事件。
 * @returns {void} 无返回值。
 * @throws {Error} 不抛出异常，未知日期会被忽略。
 */
function addUsage(context, event) {
  const day = context.dayMap.get(event.dateKey);
  if (!day) return;
  addUsageInto(day, event.usage);
  addUsageInto(resolveBucket(day.tools, event.tool), event.usage);
  addUsageIntoDimension(day.projects, event.project, event.tool, event.sessionId, event.usage);
  addUsageIntoNestedDimension(day.projects, event.project, 'models', event.model, event.sessionId, event.usage);
  addUsageIntoDimension(day.models, event.model, event.tool, event.sessionId, event.usage);
  addUsageInto(context.aggregate.summary, event.usage);
  addUsageInto(resolveBucket(context.aggregate.tools, event.tool), event.usage);
  addUsageIntoDimension(context.aggregate.projects, event.project, event.tool, event.sessionId, event.usage);
  addUsageIntoNestedDimension(context.aggregate.projects, event.project, 'models', event.model, event.sessionId, event.usage);
  addUsageIntoDimension(context.aggregate.models, event.model, event.tool, event.sessionId, event.usage);
  day.sessions.add(event.sessionId);
  resolveBucket(day.tools, event.tool).sessions.add(event.sessionId);
  resolveBucket(context.aggregate.tools, event.tool).sessions.add(event.sessionId);
}

/**
 * 将用量累加到维度桶的嵌套子维度中，例如项目下的模型拆分。
 * @param {Map<string, object>} map 父级维度 Map。
 * @param {string} parentName 父级维度名称。
 * @param {string} childKey 子级维度字段名。
 * @param {string} childName 子级维度名称。
 * @param {string} sessionId 会话编号。
 * @param {object} usage 本次用量。
 * @returns {void} 无返回值。
 * @throws {Error} 不抛出异常。
 */
function addUsageIntoNestedDimension(map, parentName, childKey, childName, sessionId, usage) {
  const parent = resolveBucket(map, parentName);
  if (!(parent[childKey] instanceof Map)) {
    parent[childKey] = new Map();
  }
  const child = resolveBucket(parent[childKey], childName);
  addUsageInto(child, usage);
  child.sessions.add(sessionId);
}

/**
 * 累加一次工具调用次数。
 * @param {object} context 聚合上下文。
 * @param {string} dateKey 日期键。
 * @param {string} tool 工具名称。
 * @param {string} project 项目名称。
 * @param {string} model 模型名称。
 * @param {string} sessionId 会话编号。
 * @returns {void} 无返回值。
 * @throws {Error} 不抛出异常，未知日期会被忽略。
 */
function addToolCall(context, dateKey, tool, project, model, sessionId) {
  incrementDimension(context, dateKey, tool, project, model, sessionId, 'toolCalls');
}

/**
 * 累加一次用户消息次数。
 * @param {object} context 聚合上下文。
 * @param {string} dateKey 日期键。
 * @param {string} tool 工具名称。
 * @param {string} project 项目名称。
 * @param {string} model 模型名称。
 * @param {string} sessionId 会话编号。
 * @returns {void} 无返回值。
 * @throws {Error} 不抛出异常，未知日期会被忽略。
 */
function addUserMessage(context, dateKey, tool, project, model, sessionId) {
  incrementDimension(context, dateKey, tool, project, model, sessionId, 'userMessages');
}

/**
 * 在每日和各维度中递增指定计数字段。
 * @param {object} context 聚合上下文。
 * @param {string} dateKey 日期键。
 * @param {string} tool 工具名称。
 * @param {string} project 项目名称。
 * @param {string} model 模型名称。
 * @param {string} sessionId 会话编号。
 * @param {string} key 需要递增的字段名。
 * @returns {void} 无返回值。
 * @throws {Error} 不抛出异常，未知日期会被忽略。
 */
function incrementDimension(context, dateKey, tool, project, model, sessionId, key) {
  const day = context.dayMap.get(dateKey);
  if (!day) return;
  day[key] += 1;
  resolveBucket(day.tools, tool)[key] += 1;
  incrementDimensionBucket(day.projects, project, tool, sessionId, key);
  incrementDimensionBucket(day.models, model, tool, sessionId, key);
  context.aggregate.summary[key] += 1;
  day.sessions.add(sessionId);
  resolveBucket(day.tools, tool).sessions.add(sessionId);
  const toolBucket = resolveBucket(context.aggregate.tools, tool);
  toolBucket[key] += 1;
  toolBucket.sessions.add(sessionId);
  incrementDimensionBucket(context.aggregate.projects, project, tool, sessionId, key);
  incrementDimensionBucket(context.aggregate.models, model, tool, sessionId, key);
}

/**
 * 将用量累加到项目或模型维度，并同步记录该维度下的工具拆分。
 * @param {Map<string, object>} map 项目或模型维度 Map。
 * @param {string} name 维度名称。
 * @param {string} tool 工具名称。
 * @param {string} sessionId 会话编号。
 * @param {object} usage 本次用量。
 * @returns {void} 无返回值。
 * @throws {Error} 不抛出异常。
 */
function addUsageIntoDimension(map, name, tool, sessionId, usage) {
  const bucket = resolveBucket(map, name);
  const toolBucket = resolveBucket(bucket.tools, tool);
  addUsageInto(bucket, usage);
  addUsageInto(toolBucket, usage);
  bucket.sessions.add(sessionId);
  toolBucket.sessions.add(sessionId);
}

/**
 * 将计数字段累加到项目或模型维度，并同步记录该维度下的工具拆分。
 * @param {Map<string, object>} map 项目或模型维度 Map。
 * @param {string} name 维度名称。
 * @param {string} tool 工具名称。
 * @param {string} sessionId 会话编号。
 * @param {string} key 需要递增的字段名。
 * @returns {void} 无返回值。
 * @throws {Error} 不抛出异常。
 */
function incrementDimensionBucket(map, name, tool, sessionId, key) {
  const bucket = resolveBucket(map, name);
  const toolBucket = resolveBucket(bucket.tools, tool);
  bucket[key] += 1;
  toolBucket[key] += 1;
  bucket.sessions.add(sessionId);
  toolBucket.sessions.add(sessionId);
}

/**
 * 将统一用量对象累加到目标对象。
 * @param {object} target 被累加的目标对象。
 * @param {object} usage 本次用量。
 * @returns {void} 无返回值。
 * @throws {Error} 不抛出异常。
 */
function addUsageInto(target, usage) {
  target.inputTokens += usage.inputTokens;
  target.cachedInputTokens += usage.cachedInputTokens;
  target.outputTokens += usage.outputTokens;
  target.reasoningOutputTokens += usage.reasoningOutputTokens;
  target.totalTokens += usage.totalTokens;
  target.calls += usage.calls;
}

/**
 * 获取或创建维度聚合桶。
 * @param {Map<string, object>} map 维度聚合 Map。
 * @param {string} name 维度名称。
 * @returns {object} 返回聚合桶。
 * @throws {Error} 不抛出异常。
 */
function resolveBucket(map, name) {
  const key = name || '未知';
  if (!map.has(key)) {
    map.set(key, { name: key, ...createUsageCounters(), sessions: new Set(), tools: new Map() });
  }
  return map.get(key);
}

/**
 * 完成报表派生字段计算。
 * @param {object} report 待完成的报表对象。
 * @param {object} aggregate 聚合状态。
 * @returns {void} 无返回值。
 * @throws {Error} 不抛出异常。
 */
function finalizeReport(report, aggregate) {
  report.summary = serializeCounters(aggregate.summary);
  report.summary.activeDays = report.daily.filter((day) => day.totalTokens > 0).length;
  report.summary.sessions = new Set(report.daily.flatMap((day) => [...day.sessions])).size;
  report.daily = report.daily.map((day) => serializeCounters(day));
  report.tools = sortBuckets(aggregate.tools);
  report.projects = sortBuckets(aggregate.projects);
  report.models = sortBuckets(aggregate.models);
  report.tokenParts = {
    inputTokens: report.summary.inputTokens,
    cachedInputTokens: report.summary.cachedInputTokens,
    outputTokens: report.summary.outputTokens,
    reasoningOutputTokens: report.summary.reasoningOutputTokens
  };
}

/**
 * 对维度桶按 token 总量排序并序列化。
 * @param {Map<string, object>} map 维度聚合 Map。
 * @returns {object[]} 返回排序后的维度数组。
 * @throws {Error} 不抛出异常。
 */
function sortBuckets(map) {
  return [...map.values()]
    .map((bucket) => serializeCounters(bucket))
    .sort((left, right) => right.totalTokens - left.totalTokens);
}

/**
 * 将内部 Set 字段转换为前端可读的数量。
 * @param {object} counters 内部计数对象。
 * @returns {object} 返回纯 JSON 计数对象。
 * @throws {Error} 不抛出异常。
 */
function serializeCounters(counters) {
  const { sessions, tools, projects, models, ...rest } = counters;
  const output = {
    ...rest,
    sessions: sessions instanceof Set ? sessions.size : numberValue(sessions)
  };
  if (tools instanceof Map) {
    output.tools = sortBuckets(tools);
  }
  if (projects instanceof Map) {
    output.projects = sortBuckets(projects);
  }
  if (models instanceof Map) {
    output.models = sortBuckets(models);
  }
  return output;
}

/**
 * 创建全局聚合状态。
 * @returns {object} 返回包含汇总和各维度 Map 的状态对象。
 * @throws {Error} 不抛出异常。
 */
function createAggregateState() {
  return {
    summary: { ...createUsageCounters(), sessions: new Set() },
    tools: new Map(),
    projects: new Map(),
    models: new Map()
  };
}

/**
 * 创建汇总计数器。
 * @returns {object} 返回汇总对象。
 * @throws {Error} 不抛出异常。
 */
function createSummary() {
  return {
    ...createUsageCounters(),
    activeDays: 0,
    sessions: 0
  };
}

/**
 * 创建 token 构成对象。
 * @returns {object} 返回 token 构成对象。
 * @throws {Error} 不抛出异常。
 */
function createTokenParts() {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0
  };
}

/**
 * 创建基础用量计数器。
 * @returns {object} 返回基础计数字段。
 * @throws {Error} 不抛出异常。
 */
function createUsageCounters() {
  return { ...EMPTY_USAGE };
}

/**
 * 创建每日统计记录。
 * @param {string} date 日期字符串，格式为 YYYY-MM-DD。
 * @returns {object} 返回每日统计对象。
 * @throws {Error} 不抛出异常。
 */
function createDailyRecord(date) {
  return {
    date,
    ...createUsageCounters(),
    sessions: new Set(),
    tools: new Map(),
    projects: new Map(),
    models: new Map()
  };
}

/**
 * 生成目标月份的每日日期数组。
 * @param {string} month 目标月份，格式为 YYYY-MM。
 * @returns {string[]} 返回当月所有日期。
 * @throws {Error} 当月份格式非法时抛出错误。
 */
function createMonthDays(month) {
  const [yearText, monthText] = validateMonth(month).split('-');
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const days = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return Array.from({ length: days }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`);
}

/**
 * 将 ISO 时间转换为指定时区的日期键。
 * @param {string} timestamp ISO 时间字符串。
 * @param {string} timeZone 时区名称。
 * @returns {string} 返回 YYYY-MM-DD 日期键。
 * @throws {Error} 当时间无法解析时抛出错误。
 */
function formatDateInTimeZone(timestamp, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

/**
 * 从路径中提取项目名称。
 * @param {string} cwd 工作目录路径。
 * @returns {string} 返回项目名称。
 * @throws {Error} 不抛出异常。
 */
function projectNameFromPath(cwd) {
  if (!cwd || cwd === '未知项目') return '未知项目';
  return path.basename(cwd.replace(/\/$/, '')) || cwd;
}

/**
 * 从 Claude projects 目录名推导项目路径。
 * @param {string} file Claude JSONL 文件路径。
 * @returns {string} 返回推导后的项目名称或路径。
 * @throws {Error} 不抛出异常。
 */
function projectFromClaudePath(file) {
  const parent = path.basename(path.dirname(file));
  return parent.replace(/^-/, '/').replaceAll('-', '/');
}

/**
 * 将任意值转换为安全数字。
 * @param {unknown} value 待转换值。
 * @returns {number} 返回有限数字，非法值返回 0。
 * @throws {Error} 不抛出异常。
 */
function numberValue(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}
