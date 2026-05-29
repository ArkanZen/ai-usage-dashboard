import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUsageReport, validateMonth } from '../src/usageParser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(__dirname, 'fixtures');

test('按月份聚合 Codex 与 Claude CLI 用量', async () => {
  const report = await buildUsageReport({
    month: '2026-05',
    timeZone: 'Asia/Shanghai',
    codexRoot: path.join(fixtureRoot, 'codex'),
    claudeRoot: path.join(fixtureRoot, 'claude'),
    geminiRoot: path.join(fixtureRoot, 'gemini')
  });

  const day = report.daily.find((item) => item.date === '2026-05-06');
  assert.equal(day.totalTokens, 328);
  assert.equal(day.inputTokens, 220);
  assert.equal(day.cachedInputTokens, 45);
  assert.equal(day.outputTokens, 78);
  assert.equal(day.toolCalls, 2);
  assert.equal(day.userMessages, 1);
  assert.equal(report.summary.calls, 3);
  assert.equal(report.summary.sessions, 3);
  assert.deepEqual(report.tools.map((tool) => tool.name).sort(), ['Claude CLI', 'Codex', 'Gemini CLI']);
});

test('拒绝非法月份格式', () => {
  assert.throws(() => validateMonth('2026-13'), /月份必须/);
  assert.throws(() => validateMonth('202605'), /月份格式/);
});
