# AI 使用洞察仪表盘

本项目用于在本机查看 Codex 与 Claude CLI 的使用情况，按月份聚合每日 token、会话、调用、项目和模型分布。

## 启动

```bash
npm start
```

默认地址：

```text
http://localhost:4173
```

## 数据源

- Codex：`~/.codex/sessions`
- Claude CLI：`~/.claude/projects`

服务端只读扫描本地 JSONL 日志，不读取密钥、Token、密码等敏感配置。

## 测试

```bash
npm test
```
