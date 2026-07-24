# Papyrus 项目结构说明

## 项目概览

> 最后更新: 2026-07-10（v2.0.0-beta.12）

Papyrus 是一款现代化的桌面学习应用，采用 **Node.js + Fastify 后端 + React 19 TypeScript 前端 + Electron 41 桌面壳** 架构。

---

## 目录结构

```text
Papyrus/
├── backend/                       # Node.js + TypeScript 后端 (Fastify)
│   ├── src/
│   │   ├── api/                   # Fastify 路由 & 服务器入口
│   │   │   ├── server.ts          # 服务入口，注册所有路由
│   │   │   └── routes/            # 20+ 路由模块
│   │   ├── core/                  # 核心业务逻辑（UI 无关）
│   │   │   ├── cards.ts           # 卡片 CRUD
│   │   │   ├── notes.ts           # 笔记管理
│   │   │   ├── sm2.ts             # SM-2 间隔重复算法
│   │   │   ├── versioning.ts      # 版本历史
│   │   │   ├── crypto.ts          # AES-GCM 加密
│   │   │   ├── relations.ts       # 关系管理
│   │   │   └── files.ts           # 文件操作
│   │   ├── ai/                    # AI Agent 系统
│   │   │   ├── config.ts          # AI 配置管理
│   │   │   ├── provider.ts        # AI 提供商接口
│   │   │   ├── tool-manager.ts    # 工具调用管理
│   │   │   ├── llm-cache.ts       # LLM 响应缓存
│   │   │   ├── tools.ts           # 工具调用入口
│   │   │   └── tools/             # 工具定义与实现
│   │   │       ├── registry.ts    # 工具注册表
│   │   │       ├── parser.ts      # AI 响应解析
│   │   │       ├── cards.ts       # 卡片工具
│   │   │       ├── notes.ts       # 笔记工具
│   │   │       ├── files.ts       # 文件工具
│   │   │       ├── data.ts        # 数据查询工具
│   │   │       ├── relations.ts   # 关系工具
│   │   │       ├── settings.ts    # 设置工具
│   │   │       └── extensions.ts  # 扩展工具
│   │   ├── db/                    # SQLite（node:sqlite，WAL）
│   │   │   └── database.ts        # 数据库操作与 schema
│   │   ├── cli/                   # Desktop CLI 管理辅助
│   │   ├── integrations/          # 外部集成
│   │   │   └── file-watcher.ts    # 文件监听（Obsidian Vault）
│   │   ├── mcp/                   # MCP 服务端点
│   │   │   └── server.ts          # MCP 服务器
│   │   └── utils/                 # 工具函数
│   │       ├── auth.ts            # 认证
│   │       ├── logger.ts          # 日志
│   │       ├── paths.ts           # 路径常量
│   │       ├── proxy.ts           # 代理配置
│   │       └── client-id.ts       # 客户端标识
│   ├── tests/                     # 测试（unit/ + integration/）
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/                      # React 19 + TypeScript 前端 (Vite)
│   ├── src/
│   │   ├── StartPage/             # 首页（今日概览、复习队列、节气主题）
│   │   ├── ScrollPage/            # 卷轴复习页（闪卡学习）
│   │   ├── NotesPage/             # 笔记管理（关系图、文件夹树）
│   │   ├── ChartsPage/            # 统计图表
│   │   ├── FilesPage/             # 文件库
│   │   ├── ExtensionsPage/        # 扩展管理
│   │   ├── SettingsPage/          # 设置（AI配置、无障碍、外观、快捷键）
│   │   ├── ChatPanel/             # AI 聊天面板
│   │   ├── DesktopPage/           # 画布/白板占位（尚未接入路由）
│   │   ├── components/            # 公共组件
│   │   ├── hooks/                 # 自定义 Hooks
│   │   ├── contexts/              # React Context
│   │   ├── i18n/                  # 国际化配置
│   │   ├── icons/                 # 图标系统（30+ AI 模型/提供商 Logo）
│   │   ├── locales/               # 语言包（zh-CN, en-US, zh-TW, ja-JP）
│   │   ├── types/                 # 类型定义
│   │   └── utils/                 # 工具函数
│   ├── package.json
│   └── vite.config.js
│
├── electron/                      # Electron 主进程
│   ├── main.js                    # 主进程入口
│   ├── preload.js                 # 预加载脚本
│   ├── diagnostic-window.js       # 诊断窗口
│   └── diagnostic-preload.js      # 诊断预加载
│
├── e2e/                           # Playwright E2E 测试
│
├── scripts/                       # 构建/发布脚本
│   ├── build-electron.js          # 统一构建脚本
│   ├── bump-version.js            # 版本号管理
│   ├── extract-changelog.js       # 更新日志提取
│   └── ...
│
├── docs/                          # 项目文档
│
├── examples/                      # 扩展开发模板
│   └── extension-template/
│
├── assets/                        # 应用图标（.ico, .icns, .png, .svg）
│
├── build/                         # Electron 构建资源
│
└── tools/                         # 开发工具（图标生成）
```

---

## 前端架构

### 技术栈
- **框架**: React 19.2.4 + TypeScript 5
- **UI 库**: Arco Design (web-react) 2.66.14
- **构建工具**: Vite 8
- **样式**: Tailwind CSS 3.4（类名带 `tw-` 前缀）

### 无障碍（a11y）文件

| 文件 | 说明 |
|------|------|
| `frontend/src/contexts/AccessibilityContext.tsx` | 无障碍上下文 |
| `frontend/src/components/ScreenReaderAnnouncer.tsx` | 屏幕阅读器播报 |
| `docs/guides/ACCESSIBILITY_GUIDE.md` | 无障碍开发指南与验证清单 |
| `docs/guides/A11Y_SETTINGS.md` | 无障碍设置说明 |

### 核心组件

| 组件 | 功能 |
|------|------|
| `App.tsx` | 应用根组件，管理页面路由 |
| `Sidebar.tsx` | 侧边导航栏 |
| `TitleBar.tsx` | 顶部标题栏 |
| `SearchBox.tsx` | 全局搜索 |
| `ChatPanel/` | AI 聊天面板（目录组件） |
| `SettingsPage/` | 设置页面 |
| `StartPage/` | 开始页面 |
| `ScrollPage/` | 卷轴复习页面 |
| `NotesPage/` | 笔记管理页面 |
| `FilesPage/` | 文件库 |
| `ExtensionsPage/` | 扩展管理 |

---

## 后端架构

### 技术栈
- **框架**: Fastify 5
- **语言**: TypeScript 5（ES Module，导入带 `.js` 后缀）
- **存储**: SQLite via `node:sqlite`（WAL），默认 `$HOME/PapyrusData/papyrus.db`
- **算法**: SM-2 间隔重复
- **测试**: Jest + ts-jest

### 核心模块

| 模块 | 功能 |
|------|------|
| `core/cards.ts` | 卡片 CRUD 操作 |
| `core/notes.ts` | 笔记管理 |
| `core/sm2.ts` | SM-2 算法实现 |
| `core/versioning.ts` | 版本历史与回滚 |
| `core/crypto.ts` | AES-GCM 加密 |
| `core/relations.ts` | 关系管理 |
| `core/files.ts` | 文件操作 |
| `db/database.ts` | SQLite 持久化 |
| `cli/` | Desktop CLI 管理 |

### API 端点

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/health` | GET | 健康检查 |
| `/api/cards` | GET/POST | 卡片列表/创建 |
| `/api/cards/:id` | GET/PATCH/DELETE | 卡片操作 |
| `/api/review/next` | GET | 获取下一张待复习卡片 |
| `/api/review/:id/rate` | POST | 评分卡片 |
| `/api/notes` | GET/POST | 笔记列表/创建 |
| `/api/notes/:id` | GET/PATCH/DELETE | 笔记操作 |
| `/api/notes/import/obsidian` | POST | Obsidian 导入 |
| `/api/files` | GET/POST/DELETE | 文件管理 |
| `/api/notes/:noteId/relations` | GET/POST | 笔记关系 |
| `/api/relations/:id` | PATCH/DELETE | 关系更新/删除 |
| `/api/extensions` | GET/POST/DELETE | 扩展管理 |
| `/api/search` | GET | 全局搜索 |
| `/api/chat` | POST | AI 聊天（SSE） |
| `/api/sessions` | GET/POST/DELETE | AI 会话 |
| `/api/tools/*` | GET/POST | AI 工具目录/审批/历史 |
| `/api/config/ai` | GET/POST | AI 配置 |
| `/api/completion` | POST | AI 补全 |
| `/api/providers` | GET/POST/DELETE | AI 提供商管理 |
| `/api/progress/*` | GET | 复习进度 |
| `/api/backup` | POST | 数据库备份 |
| `/api/export` | GET | 数据导出 |
| `/api/import` | POST | 数据导入 |
| `/api/data/reset` | POST | 清空数据 |
| `/api/cli/*` | GET/POST | Desktop CLI 状态/安装/更新/运行 |
| `/api/ui-settings` | GET/POST | UI 设置 |
| `/api/mcp/*` | — | MCP 服务 |

---

## 文档导航

### 用户指南
- [快速启动](guides/QUICKSTART.md)
- [无障碍设置](guides/A11Y_SETTINGS.md)
- [版本信息](guides/VERSION.md)
- [更新日志](../CHANGELOG.md)

### 开发指南
- [环境要求](guides/ENVIRONMENT_REQUIREMENTS.md)
- [UI 设计变量](guides/UI_TOKENS.md)
- [无障碍开发指南](guides/ACCESSIBILITY_GUIDE.md)
- [API 文档](API.md)
- [CLI Manager 设计](CLI_MANAGER_DESIGN.md)

### AI 功能
- [AI 功能说明](AI_README.md)

---

## 如何运行

### 开发模式

**一键启动前后端**
```bash
npm run dev
```

**分别启动**
```bash
# 终端 1 - 后端
cd backend && npm run dev

# 终端 2 - 前端
cd frontend && npm run dev
```

访问 http://localhost:5173

**带 Electron 壳**
```bash
npm run electron:dev
```

### 构建生产版本

```bash
npm run build:frontend   # 构建前端
npm run build:backend    # 构建后端
npm run electron:build   # 全平台构建
```

---

## 最近更新

### 2026-07 v2.0.0-beta.12
- ✅ SQLite（`node:sqlite`，WAL）作为主存储
- ✅ `/api/cli`、`/api/ui-settings`、backup/export/import 等数据路由
- ✅ 翻译模型选择、聊天窄面板与安全加固

### 2026-05 Node.js/Fastify 后端重写完成
- ✅ Node.js 24 + TypeScript 5 + Fastify 5 后端
- ✅ React 19 + Vite 8 + Arco Design 前端
- ✅ Electron 41 桌面封装
- ✅ AI Agent 工具系统（7 类工具）
- ✅ 30+ AI 提供商支持
- ✅ MCP 服务端点
- ✅ Jest 后端测试 + Playwright E2E 测试
- ✅ 国际化（4 种语言）
