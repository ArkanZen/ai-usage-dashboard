# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start        # start server at http://localhost:4173
npm test         # run tests with Node's built-in test runner
```

To run a single test file:
```bash
node --test test/usageParser.test.js
```

No `npm install` needed — this project has zero external dependencies.

## Architecture

**Stack**: Pure Node.js (ESM), no framework, no dependencies.

### Server (`src/server.js`)
Minimal HTTP server with two API endpoints and static file serving from `public/`:
- `GET /api/usage?month=YYYY-MM` — parse logs and return usage report; results cached 5 minutes in-memory; supports `codexRoot`, `claudeRoot`, `geminiRoot`, `timeZone`, and `refresh=1` query params to override defaults
- `GET /api/months` — return array of recent 18 months for the UI picker

### Parser (`src/usageParser.js`)
`buildUsageReport()` scans local JSONL log files for three AI CLI tools and aggregates them into a unified report structure. Each tool has its own parser function:

- **Codex**: reads `~/.codex/sessions/YYYY/MM/*.jsonl`; counts `token_count` payload events, `function_call` for tool calls, `message[role=user]` for user messages; picks up `cwd`/`model` from `session_meta` and `turn_context` events
- **Claude CLI**: reads `~/.claude/projects/**/*.jsonl`; aggregates `assistant` messages with `usage` field, deduplicates by `message.id`; derives project name from `entry.cwd` or the directory name (encoded as hyphen-separated path segments)
- **Gemini CLI**: reads `~/.gemini/tmp/*/chats/*.jsonl`; filters entries where `type === 'gemini'`; deduplicates by `entry.id`

The report shape: `{ month, summary, daily[], tools[], projects[], models[], tokenParts, cache }`. Internally, aggregation uses `Map` buckets and `Set` for session deduplication; these are serialized to counts before the response is sent.

Default timezone for daily bucketing is `Asia/Shanghai`.

### Frontend (`public/`)
Vanilla JS/CSS/HTML — no build step. `app.js` calls the API and renders charts/tables directly in the browser.

### Tests (`test/`)
Uses Node's built-in `node:test` + `node:assert`. Fixture JSONL files under `test/fixtures/{codex,claude,gemini}/` provide deterministic test data covering all three parsers.
