# AI 使用洞察仪表盘

本地仪表盘，读取 AI CLI 工具的本地日志，聚合展示 token 用量、会话活跃度、项目分布和模型分布——数据不离开本机。

支持 **Claude Code（Claude CLI）**、**OpenAI Codex CLI** 和 **Gemini CLI**。

## 功能

- 月度总览：总 token、会话数、工具调用次数、缓存命中率
- 每日趋势柱状图，点击任意一天可查看当日明细
- 月度日历热力图（周末特殊背景标识）
- 项目维度明细，含各模型 sparkline 迷你趋势图
- 模型分布统计表
- 按工具筛选（Claude / Codex / Gemini）或全部合并查看
- 日期详情弹窗，含项目/模型拆分，支持键盘左右切换
- 自定义数据目录和时区（通过 URL 参数传入）
- 零外部依赖——纯 Node.js ESM，无构建步骤

## 快速启动

```bash
node src/server.js
```

浏览器打开 [http://localhost:4173](http://localhost:4173)。

也可以用 npm 别名：

```bash
npm start
```

## 数据源

服务端**只读**扫描本地 JSONL 日志文件，不读取任何密钥、Token 或密码。

| 工具 | 默认日志路径 |
|------|-------------|
| Claude CLI | `~/.claude/projects/**/*.jsonl` |
| Codex CLI | `~/.codex/sessions/YYYY/MM/*.jsonl` |
| Gemini CLI | `~/.gemini/tmp/*/chats/*.jsonl` |

### 自定义路径

通过 URL 参数覆盖默认目录：

```
/api/usage?month=2026-05&claudeRoot=/path/to/.claude&codexRoot=/path/to/.codex&geminiRoot=/path/to/.gemini&timeZone=Asia/Shanghai
```

## 环境要求

- Node.js ≥ 20
- 无需 `npm install`——零外部依赖

## 测试

```bash
npm test
```

单文件运行：

```bash
node --test test/usageParser.test.js
```

## 项目结构

```
src/
  server.js        # HTTP 服务，两个 API 端点 + 静态文件服务
  usageParser.js   # 三种 CLI 工具的 JSONL 日志解析与聚合
public/
  index.html       # 单页面 UI 框架
  app.js           # 原生 JS——API 请求、图表渲染、弹窗逻辑
  modal.js         # 日期/项目详情弹窗，支持键盘导航
  styles.css       # 暗色主题 CSS，无框架
test/
  usageParser.test.js
  fixtures/        # 三种解析器的确定性 JSONL 测试数据
```

API 端点：

- `GET /api/usage?month=YYYY-MM` — 解析日志并返回聚合报告（5 分钟缓存，传 `refresh=1` 强制刷新）
- `GET /api/months` — 返回最近 18 个月列表，供月份选择器使用

## License

MIT
