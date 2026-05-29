import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUsageReport, listRecentMonths, validateMonth } from './usageParser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '..', 'public');
const port = Number(process.env.PORT || 4173);
const usageCache = new Map();
const cacheMaxAgeMs = 5 * 60 * 1000;
const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml; charset=utf-8']
]);

/**
 * 处理 HTTP 请求，负责 API 与静态资源分发。
 * @param {http.IncomingMessage} request HTTP 请求对象。
 * @param {http.ServerResponse} response HTTP 响应对象。
 * @returns {Promise<void>} 无返回值。
 * @throws {Error} 内部异常会转换为 JSON 错误响应。
 */
async function handleRequest(request, response) {
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (url.pathname === '/api/usage') {
      await handleUsageApi(url, response);
      return;
    }
    if (url.pathname === '/api/months') {
      sendJson(response, { months: listRecentMonths(18) });
      return;
    }
    await serveStatic(url.pathname, response);
  } catch (error) {
    sendJson(response, { error: error.message || '服务内部错误' }, 500);
  }
}

/**
 * 处理用量统计 API。
 * @param {URL} url 请求 URL。
 * @param {http.ServerResponse} response HTTP 响应对象。
 * @returns {Promise<void>} 无返回值。
 * @throws {Error} 月份参数非法或日志读取失败时抛出错误。
 */
async function handleUsageApi(url, response) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const month = validateMonth(url.searchParams.get('month') || currentMonth);
  const forceRefresh = url.searchParams.get('refresh') === '1';
  const dataSource = {
    codexRoot: url.searchParams.get('codexRoot') || undefined,
    claudeRoot: url.searchParams.get('claudeRoot') || undefined,
    geminiRoot: url.searchParams.get('geminiRoot') || undefined,
    timeZone: url.searchParams.get('timeZone') || undefined
  };
  const report = await getCachedUsageReport(month, forceRefresh, dataSource);
  sendJson(response, report);
}

/**
 * 获取带缓存的月度用量报表，避免页面刷新时反复扫描完整日志目录。
 * @param {string} month 目标月份，格式为 YYYY-MM。
 * @param {boolean} forceRefresh 是否强制重新扫描本地日志。
 * @param {object} dataSource 页面传入的数据源配置。
 * @returns {Promise<object>} 返回月度用量报表。
 * @throws {Error} 日志读取失败时抛出错误。
 */
async function getCachedUsageReport(month, forceRefresh, dataSource) {
  const cacheKey = createCacheKey(month, dataSource);
  const cached = usageCache.get(cacheKey);
  const now = Date.now();
  if (!forceRefresh && cached && now - cached.cachedAt < cacheMaxAgeMs) {
    return {
      ...cached.report,
      cache: {
        hit: true,
        cachedAt: new Date(cached.cachedAt).toISOString(),
        maxAgeSeconds: Math.round(cacheMaxAgeMs / 1000)
      }
    };
  }

  const report = await buildUsageReport({ month, ...dataSource });
  usageCache.set(cacheKey, { report, cachedAt: now });
  return {
    ...report,
    cache: {
      hit: false,
      cachedAt: new Date(now).toISOString(),
      maxAgeSeconds: Math.round(cacheMaxAgeMs / 1000)
    }
  };
}

/**
 * 生成缓存键，确保不同电脑路径或时区不会共用旧结果。
 * @param {string} month 目标月份。
 * @param {object} dataSource 数据源配置。
 * @returns {string} 返回稳定缓存键。
 * @throws {Error} 不抛出异常。
 */
function createCacheKey(month, dataSource) {
  return JSON.stringify({
    month,
    codexRoot: dataSource.codexRoot || '',
    claudeRoot: dataSource.claudeRoot || '',
    geminiRoot: dataSource.geminiRoot || '',
    timeZone: dataSource.timeZone || ''
  });
}

/**
 * 返回 JSON 响应。
 * @param {http.ServerResponse} response HTTP 响应对象。
 * @param {object} payload JSON 数据。
 * @param {number} [statusCode] HTTP 状态码。
 * @returns {void} 无返回值。
 * @throws {Error} 不抛出异常。
 */
function sendJson(response, payload, statusCode = 200) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  response.end(JSON.stringify(payload));
}

/**
 * 分发 public 目录中的静态文件。
 * @param {string} pathname 请求路径。
 * @param {http.ServerResponse} response HTTP 响应对象。
 * @returns {Promise<void>} 无返回值。
 * @throws {Error} 文件系统读取失败时抛出错误。
 */
async function serveStatic(pathname, response) {
  const requestedPath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.resolve(publicDir, `.${decodeURIComponent(requestedPath)}`);
  if (!filePath.startsWith(publicDir)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    response.writeHead(404);
    response.end('Not Found');
    return;
  }
  const extension = path.extname(filePath);
  response.writeHead(200, {
    'content-type': mimeTypes.get(extension) || 'application/octet-stream',
    'cache-control': 'no-store'
  });
  fs.createReadStream(filePath).pipe(response);
}

http.createServer((request, response) => {
  handleRequest(request, response);
}).listen(port, () => {
  console.log(`AI 使用洞察仪表盘已启动：http://localhost:${port}`);
});
