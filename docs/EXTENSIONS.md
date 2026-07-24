# Papyrus 扩展开发指南

Papyrus 支持通过 REST API 进行扩展开发。你可以开发浏览器插件、桌面应用、CLI 工具或任何能与 HTTP API 通信的程序来扩展 Papyrus 的功能。

## 目录

- [快速开始](#快速开始)
- [API 概览](#api-概览)
- [MCP 扩展接口](#mcp-扩展接口)
- [Markdown 渲染接口](#markdown-渲染接口)
- [示例代码](#示例代码)
- [开发工具](#开发工具)
- [最佳实践](#最佳实践)

---

## 快速开始

### 1. 启动 Papyrus

确保 Papyrus 应用正在运行，后端服务默认在 `http://127.0.0.1:8000`。

### 2. 测试连接

```bash
curl http://127.0.0.1:8000/api/health
```

返回 `{"status": "ok"}` 表示服务正常。

### 3. 获取笔记列表

```bash
curl http://127.0.0.1:8000/api/mcp/notes
```

---

## API 概览

所有 API 均以 `/api` 为前缀，支持 CORS，可从浏览器扩展或本地应用调用。

| 接口类型 | 前缀 | 说明 |
|---------|------|------|
| MCP 扩展接口 | `/api/mcp/*` | 笔记 CRUD、搜索、Vault 操作 |
| Markdown 渲染 | `/api/markdown/*` | Markdown 转 HTML |
| 核心 API | `/api/*` | 卡片、复习等其他功能 |

---

## MCP 扩展接口

MCP (Model Context Protocol) 接口为扩展提供了完整的笔记管理能力。

### 基础信息

- **Base URL**: `http://127.0.0.1:8000/api/mcp`
- **Content-Type**: `application/json`
- **Auth（Electron / 写操作）**: 请求头携带 `Authorization: Bearer <token>`（与 `PAPYRUS_AUTH_TOKEN` 一致）。本地纯开发模式可能未启用 token，以实际后端配置为准。

### 接口列表

#### 1. 获取笔记列表

```http
GET /api/mcp/notes
```

**响应示例：**
```json
{
  "notes": [
    {
      "id": "note-uuid-1",
      "title": "我的笔记",
      "created_at": "2026-03-29T10:00:00",
      "updated_at": "2026-03-29T10:30:00",
      "word_count": 150,
      "tags": ["标签1", "标签2"],
      "has_attachments": false
    }
  ],
  "total": 1
}
```

#### 2. 获取单篇笔记

```http
GET /api/mcp/notes/{note_id}
```

**响应示例：**
```json
{
  "id": "note-uuid-1",
  "title": "我的笔记",
  "content": "# 标题\n\n正文内容...",
  "created_at": "2026-03-29T10:00:00",
  "updated_at": "2026-03-29T10:30:00",
  "word_count": 150,
  "tags": ["标签1"],
  "links": ["其他笔记ID"],
  "attachments": []
}
```

#### 3. 创建笔记

```http
POST /api/mcp/notes
Content-Type: application/json

{
  "title": "新笔记标题",
  "content": "# 标题\n\n正文",
  "tags": ["标签1", "标签2"]
}
```

**响应示例：**
```json
{
  "success": true,
  "id": "new-note-uuid",
  "message": "Note created successfully"
}
```

#### 4. 更新笔记

```http
PATCH /api/mcp/notes/{note_id}
Content-Type: application/json

{
  "title": "更新后的标题",
  "content": "更新后的内容"
}
```

#### 5. 删除笔记

```http
DELETE /api/mcp/notes/{note_id}
```

#### 6. 搜索笔记

```http
POST /api/mcp/notes/search
Content-Type: application/json

{
  "query": "关键词",
  "search_content": true,
  "limit": 10
}
```

**响应示例：**
```json
{
  "results": [
    {
      "id": "note-uuid-1",
      "title": "匹配的笔记",
      "content_preview": "...关键词附近的内容...",
      "score": 0.95
    }
  ]
}
```

#### 7. Vault 索引（批量获取元数据）

```http
POST /api/mcp/vault/index
Content-Type: application/json

{
  "include_outline": true,
  "include_links": true
}
```

**用途：** 扩展启动时批量获取所有笔记的元数据，用于建立本地索引。

#### 8. Vault 读取（批量获取内容）

```http
POST /api/mcp/vault/read
Content-Type: application/json

{
  "note_ids": ["id1", "id2"],
  "format": "full"
}
```

**用途：** 按需加载特定笔记的完整内容。

---

## Markdown 渲染接口

将 Markdown 文本渲染为 HTML。

### 接口详情

```http
POST /api/markdown/render
Content-Type: application/json

{
  "content": "# 标题\n\n**粗体** 和 *斜体*"
}
```

**响应：**
```json
{
  "success": true,
  "html": "<h1>标题</h1>\n<p><strong>粗体</strong> 和 <em>斜体</em></p>\n"
}
```

**支持的 Markdown 语法：**
- 标准 Markdown（标题、列表、链接、图片等）
- 代码块（支持语法高亮）
- 表格
- 任务列表 `- [ ]`

---

## 示例代码

### Python 扩展示例

```python
import requests

class PapyrusExtension:
    def __init__(self, base_url="http://127.0.0.1:8000"):
        self.base_url = base_url
        self.api_prefix = f"{base_url}/api"
    
    def health_check(self):
        """检查 Papyrus 是否运行"""
        r = requests.get(f"{self.api_prefix}/health")
        return r.json()["status"] == "ok"
    
    def get_all_notes(self):
        """获取所有笔记列表"""
        r = requests.get(f"{self.api_prefix}/mcp/notes")
        return r.json()["notes"]
    
    def create_note(self, title, content, tags=None):
        """创建新笔记"""
        data = {
            "title": title,
            "content": content,
            "tags": tags or []
        }
        r = requests.post(f"{self.api_prefix}/mcp/notes", json=data)
        return r.json()
    
    def search_notes(self, query):
        """搜索笔记"""
        data = {
            "query": query,
            "search_content": True,
            "limit": 20
        }
        r = requests.post(f"{self.api_prefix}/mcp/notes/search", json=data)
        return r.json()["results"]
    
    def render_markdown(self, content):
        """渲染 Markdown 为 HTML"""
        r = requests.post(
            f"{self.api_prefix}/markdown/render",
            json={"content": content}
        )
        return r.json()["html"]

# 使用示例
if __name__ == "__main__":
    ext = PapyrusExtension()
    
    # 检查连接
    if ext.health_check():
        print("✓ Papyrus 已连接")
    
    # 创建笔记
    result = ext.create_note(
        title="来自扩展的笔记",
        content="# 你好\n\n这是通过 API 创建的笔记",
        tags=[["extension", "api"]]
    )
    print(f"创建成功: {result['id']}")
    
    # 搜索笔记
    results = ext.search_notes("扩展")
    for note in results:
        print(f"- {note['title']}")
```

### JavaScript/浏览器扩展示例

```javascript
class PapyrusExtension {
  constructor(baseUrl = 'http://127.0.0.1:8000') {
    this.baseUrl = baseUrl;
    this.apiPrefix = `${baseUrl}/api`;
  }

  async healthCheck() {
    const r = await fetch(`${this.apiPrefix}/health`);
    const data = await r.json();
    return data.status === 'ok';
  }

  async getAllNotes() {
    const r = await fetch(`${this.apiPrefix}/mcp/notes`);
    const data = await r.json();
    return data.notes;
  }

  async createNote(title, content, tags = []) {
    const r = await fetch(`${this.apiPrefix}/mcp/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content, tags })
    });
    return r.json();
  }

  async searchNotes(query, limit = 10) {
    const r = await fetch(`${this.apiPrefix}/mcp/notes/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        query, 
        search_content: true, 
        limit 
      })
    });
    const data = await r.json();
    return data.results;
  }

  async renderMarkdown(content) {
    const r = await fetch(`${this.apiPrefix}/markdown/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    const data = await r.json();
    return data.html;
  }
}

// 使用示例
const ext = new PapyrusExtension();

// 检查连接
ext.healthCheck().then(ok => {
  if (ok) console.log('✓ Papyrus 已连接');
});

// 创建笔记
ext.createNote(
  '浏览器扩展笔记',
  '# 快速笔记\n\n从浏览器直接创建',
  ['browser', 'clipper']
).then(result => {
  console.log('创建成功:', result.id);
});
```

### 浏览器书签工具（Bookmarklet）

```javascript
// 将当前网页保存到 Papyrus
javascript:(function(){
  const data = {
    title: document.title,
    content: `# ${document.title}\n\n来源: ${location.href}\n\n## 选中内容\n\n${window.getSelection().toString() || '无选中内容'}`,
    tags: ['clipper', 'web']
  };
  
  fetch('http://127.0.0.1:8000/api/mcp/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  .then(r => r.json())
  .then(result => {
    if (result.success) {
      alert('已保存到 Papyrus!');
    }
  })
  .catch(() => {
    alert('保存失败，请确保 Papyrus 正在运行');
  });
})();
```

---

## 开发工具

### HTTP 客户端推荐

- **VS Code**: REST Client 插件
- **命令行**: `curl` 或 `httpie`
- **GUI**: Postman, Insomnia, Bruno

### VS Code REST Client 示例

创建 `test.http` 文件：

```http
### 健康检查
GET http://127.0.0.1:8000/api/health

### 获取笔记列表
GET http://127.0.0.1:8000/api/mcp/notes

### 创建笔记
POST http://127.0.0.1:8000/api/mcp/notes
Content-Type: application/json

{
  "title": "测试笔记",
  "content": "# 标题\n\n内容",
  "tags": ["test"]
}

### 搜索笔记
POST http://127.0.0.1:8000/api/mcp/notes/search
Content-Type: application/json

{
  "query": "测试",
  "limit": 5
}

### 渲染 Markdown
POST http://127.0.0.1:8000/api/markdown/render
Content-Type: application/json

{
  "content": "# Hello\n\n**World**"
}
```

---

## 最佳实践

### 1. 错误处理

始终检查 HTTP 状态码和响应：

```python
try:
    r = requests.get(f"{api_url}/mcp/notes/{note_id}")
    r.raise_for_status()  # 抛出 4xx/5xx 错误
    data = r.json()
except requests.exceptions.ConnectionError:
    print("错误: Papyrus 未运行")
except requests.exceptions.HTTPError as e:
    if e.response.status_code == 404:
        print("错误: 笔记不存在")
    else:
        print(f"HTTP 错误: {e}")
```

### 2. 批量操作

需要处理大量笔记时，使用 Vault 接口而非逐个请求：

```python
# ❌ 低效：逐个获取
for note_id in note_ids:
    note = ext.get_note(note_id)  # N 次请求

# ✅ 高效：批量获取
notes = ext.vault_read(note_ids)  # 1 次请求
```

### 3. 本地缓存

扩展应缓存笔记元数据，减少 API 调用：

```python
class CachedExtension:
    def __init__(self):
        self.cache = {}
        self.last_sync = None
    
    def sync(self):
        """定期同步笔记列表"""
        notes = self.get_all_notes()
        self.cache = {n["id"]: n for n in notes}
        self.last_sync = time.time()
```

### 4. 标签管理

使用标签区分扩展创建的笔记：

```python
# 为每个扩展使用唯一标签
EXTENSION_TAG = "my-extension"

# 创建时添加
def create_note(self, title, content):
    return super().create_note(
        title=title,
        content=content,
        tags=[EXTENSION_TAG, "auto-created"]
    )

# 只获取自己创建的笔记
def get_my_notes(self):
    return [n for n in self.get_all_notes() 
            if EXTENSION_TAG in n.get("tags", [])]
```

### 5. 跨域注意事项

从网页调用 API 时，Papyrus 已配置 CORS 允许 `localhost` 访问：

```javascript
// 浏览器扩展的 content script 可以直接调用
fetch('http://127.0.0.1:8000/api/mcp/notes')
```

如需从其他域名访问，可修改 `backend/src/api/server.ts` 中的 CORS 配置（本地应用默认仅绑定 `127.0.0.1`）。

---

## 故障排除

| 问题 | 可能原因 | 解决方案 |
|------|---------|---------|
| `Connection refused` | Papyrus 未运行 | 启动 Papyrus 应用 |
| `404 Not Found` | 笔记不存在 | 检查 note_id 是否正确 |
| `CORS error` | 浏览器安全限制 | 确保从 localhost 访问 |
| 返回 HTML 而非 JSON | 路由错误 | 检查 URL 是否以 `/api` 开头 |

---

## 示例扩展项目

### Web Clipper（网页剪藏）

浏览器扩展，一键保存网页到 Papyrus。

**功能：**
- 保存当前页面（标题、URL、选中内容）
- 自动添加 `clipper` 标签
- 支持选择保存范围（全文/选中/链接）

### Daily Note（每日笔记）

自动在每天创建一篇日记笔记。

**功能：**
- 定时任务创建 `YYYY-MM-DD` 标题的笔记
- 自动插入日期模板
- 添加 `daily` 标签便于汇总

### Sync Bridge（同步桥）

将 Papyrus 笔记同步到其他平台（如 Notion、GitHub）。

**功能：**
- 监听本地文件变化
- 双向同步
- 冲突处理

---

## 获取帮助

- **API 文档**: 启动 Papyrus 后访问 `http://127.0.0.1:8000/docs` (Swagger UI)
- **问题反馈**: 在 GitHub Issues 提交问题
- **功能建议**: 欢迎提交 PR 扩展 MCP 接口

---

Happy extending! 🚀
