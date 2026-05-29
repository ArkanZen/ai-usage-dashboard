# AI Usage Dashboard

A lightweight local dashboard that reads your AI CLI tool logs and gives you a clear view of token usage, session activity, projects, and model distribution — all without sending any data anywhere.

Supports **Claude Code (Claude CLI)**, **OpenAI Codex CLI**, and **Gemini CLI**.

## Features

- Monthly overview: total tokens, sessions, tool calls, cache ratio
- Daily trend bar chart with per-day drill-down
- Monthly calendar heatmap (with weekend highlights)
- Project-level breakdown with per-model sparklines
- Model distribution table
- Filter by tool (Claude / Codex / Gemini) or view all together
- Day-detail modal with project/model breakdown
- Custom data root paths and timezone via query params
- Zero dependencies — pure Node.js ESM, no build step

## Quick Start

```bash
node src/server.js
```

Then open [http://localhost:4173](http://localhost:4173).

Or with the npm alias:

```bash
npm start
```

## Data Sources

The server scans local JSONL log files **read-only**. No keys, tokens, or credentials are ever read.

| Tool | Default log path |
|------|-----------------|
| Claude CLI | `~/.claude/projects/**/*.jsonl` |
| Codex CLI | `~/.codex/sessions/YYYY/MM/*.jsonl` |
| Gemini CLI | `~/.gemini/tmp/*/chats/*.jsonl` |

### Custom paths

Append query params to override defaults:

```
/api/usage?month=2026-05&claudeRoot=/path/to/.claude&codexRoot=/path/to/.codex&geminiRoot=/path/to/.gemini&timeZone=America/New_York
```

## Requirements

- Node.js ≥ 20
- No `npm install` needed — zero external dependencies

## Tests

```bash
npm test
```

To run a single file:

```bash
node --test test/usageParser.test.js
```

## Architecture

```
src/
  server.js        # HTTP server, two API endpoints + static serving
  usageParser.js   # JSONL log parsing for all three CLI tools
public/
  index.html       # Single-page UI shell
  app.js           # Vanilla JS — API calls, charts, modal wiring
  modal.js         # Day/project detail modal with keyboard nav
  styles.css       # Dark-theme CSS, no framework
test/
  usageParser.test.js
  fixtures/        # Deterministic JSONL fixtures for all three parsers
```

API:

- `GET /api/usage?month=YYYY-MM` — parse logs and return aggregated report (5-min cache; pass `refresh=1` to bust)
- `GET /api/months` — list of recent 18 months for the month picker

## License

MIT
