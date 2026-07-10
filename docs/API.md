# Papyrus API 文档

Base URL: `/api`

后端默认监听 `127.0.0.1:8000`，可通过 `PAPYRUS_PORT` 环境变量覆盖。

持久化：SQLite（`node:sqlite`，WAL），默认 `$HOME/PapyrusData/papyrus.db`。

Electron 模式下写接口通常需要 `Authorization` / auth token（`PAPYRUS_AUTH_TOKEN`）。

---

## 健康检查

### GET /health
检查服务状态。

**响应:**
```json
{ "status": "ok" }
```

---

## 卡片管理 (Cards)

### GET /cards
列出所有卡片。

**响应:**
```json
{
  "success": true,
  "cards": [
    { "id": "...", "q": "问题", "a": "答案", "next_review": 1234567890, "interval": 1.0 }
  ],
  "count": 1
}
```

### POST /cards
创建卡片。

**请求体:**
```json
{ "q": "问题", "a": "答案", "tags": ["标签"] }
```

### GET /cards/:id
获取单个卡片。

### PATCH /cards/:id
更新卡片。

### DELETE /cards/:id
删除卡片。

---

## 复习 (Review)

### GET /review/next
获取下一张到期卡片。

**响应:**
```json
{
  "success": true,
  "card": { ... },
  "due_count": 5,
  "total_count": 100
}
```

### POST /review/:id/rate
评分卡片。

**请求体:**
```json
{ "grade": 1|2|3 }  // 1=忘记, 2=模糊, 3=秒杀
```

---

## 笔记管理 (Notes)

### GET /notes
列出所有笔记。

### POST /notes
创建笔记。

**请求体:**
```json
{
  "title": "标题",
  "folder": "文件夹",
  "content": "内容",
  "tags": ["标签"]
}
```

### GET /notes/:id
获取单个笔记。

### PATCH /notes/:id
更新笔记（部分更新）。

### DELETE /notes/:id
删除笔记。

---

## 导入 (Import)

### POST /notes/import/obsidian
从 Obsidian Vault 导入笔记。

**请求体:**
```json
{
  "vault_path": "/path/to/obsidian/vault",
  "exclude_folders": [".obsidian", ".git"]
}
```

---

## 文件管理 (Files)

### GET /files
列出所有文件。

### POST /files
上传文件。

### DELETE /files/:id
删除文件。

---

## 关系管理 (Relations)

### GET /notes/:noteId/relations
列出指定笔记的关系。

### POST /notes/:noteId/relations
为笔记创建关系。

### GET /notes/:noteId/graph
获取笔记关系图数据。

### PATCH /relations/:relationId
更新关系。

### DELETE /relations/:relationId
删除关系。

---

## 扩展管理 (Extensions)

### GET /extensions
列出已安装扩展。

### POST /extensions
安装 / 注册扩展。

### POST /extensions/install-local
从本地路径安装扩展。

### DELETE /extensions/:id
卸载扩展。

### POST /extensions/:id/enabled
启用 / 禁用扩展。

---

## UI 设置 (UI Settings)

### GET /ui-settings
获取 UI 设置。

### POST /ui-settings
更新 UI 设置。

### GET /ui-settings/sidebar
获取侧边栏设置。

### POST /ui-settings/sidebar
更新侧边栏设置。

---

## 搜索 (Search)

### GET /search?q=关键词
全局搜索卡片和笔记。

---

## 数据备份 / 导入导出

### POST /backup
将当前 SQLite 库备份到 `$PAPYRUS_DATA_DIR/backups/`。

### GET /export
导出数据。

### POST /import
导入数据。

### POST /data/reset
清空应用数据（危险操作）。

---

## Desktop CLI

### GET /cli/status
查询 CLI 安装状态。

### POST /cli/install
安装 CLI。

### POST /cli/update
更新 CLI。

### POST /cli/run
运行 CLI 命令。

---

## AI 功能

### POST /chat
AI 聊天（流式 SSE）。由 `ai.ts` 聚合注册。

### GET /sessions
获取聊天会话列表。

### POST /sessions
创建新会话。

### DELETE /sessions/:sessionId
删除会话。

### GET /tools/catalog
工具目录。

### GET|POST /tools/config
工具配置。

### POST /tools/approve/:callId
批准工具调用。

### POST /tools/reject/:callId
拒绝工具调用。

### GET /config/ai
获取 AI 配置（密钥脱敏）。

### POST /config/ai
更新 AI 配置。

### POST /completion
AI 补全。

---

## AI 提供商

### GET /providers
获取所有提供商和模型列表。

### POST /providers
添加自定义提供商。

### DELETE /providers/:id
删除提供商。

---

## 进度 (Progress)

### GET /progress/streak
连续复习天数。

### GET /progress/history
复习历史。

### GET /progress/heatmap
复习热力图数据。

---

## MCP 服务

### GET /mcp/health
MCP 健康检查。

### GET /mcp/tools
MCP 工具列表。

### POST /mcp/call
调用 MCP 工具。

### GET /mcp/notes
MCP 笔记列表。

### GET /mcp/notes/:id
MCP 单篇笔记。

### POST /mcp/notes
MCP 创建笔记。

### PATCH /mcp/notes/:id
MCP 更新笔记。

### DELETE /mcp/notes/:id
MCP 删除笔记。

### POST /mcp/notes/search
MCP 搜索笔记。

### POST /mcp/vault/index
Vault 索引（批量获取元数据）。

### POST /mcp/vault/read
Vault 读取（批量获取内容）。

---

## Markdown 渲染

### POST /markdown/render
将 Markdown 渲染为 HTML。

**请求体:**
```json
{ "content": "# 标题\n\n**粗体** 和 *斜体*" }
```

---

## 前端调用示例

```typescript
import { api } from './api';

// 获取笔记列表
const { notes } = await api.listNotes();

// 创建笔记
await api.createNote('标题', '文件夹', '内容', ['标签']);

// 更新笔记
await api.updateNote('note-id', { title: '新标题', content: '新内容' });

// 从 Obsidian 导入
const result = await api.importObsidian('/path/to/vault');
console.log(`导入 ${result.imported} 条，跳过 ${result.skipped} 条`);
```

---

## 版本历史

| 版本 | 更新内容 |
|------|----------|
| v2.0.0-beta.12 | 对齐现网路径；补 cli / ui-settings / backup / export / import；注明 SQLite |
| v2.0.0-beta.11 | 补全 API 文档，移除预留标记 |
| v2.0.0-beta.4 | 初始 API 文档 |
