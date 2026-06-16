# Papyrus 项目开发信息

> 版本: 2.0.0-beta.11 | 许可: MIT | 仓库: https://github.com/PapyrusOR/Papyrus_Desktop

## 项目简介

Papyrus（莎草纸）是一款专注于高强度记忆训练的极简、全键盘驱动、AI Agent 加持的**间隔重复（SRS）复习引擎**桌面应用。核心理念为"大道至简"——通过极简交互帮助用户进入深度复习的"心流"状态。

---

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 后端运行时 | Node.js | 24+ |
| 后端语言 | TypeScript | 5 |
| 后端框架 | Fastify | 5 |
| 前端框架 | React | 19.2.4 |
| 前端语言 | TypeScript | 5 |
| 前端构建 | Vite | 8 |
| UI 组件库 | Arco Design (web-react) | 2.66.14 |
| CSS 框架 | Tailwind CSS | 3.4（类名 `tw-` 前缀） |
| 桌面壳 | Electron | 41.1.0 |
| 打包 | electron-builder | 26.8 |
| 算法 | SM-2 间隔重复 | — |
| AI SDK | OpenAI SDK | 4.96 |
| 校验 | Zod | 3.25 |
| 国际化 | i18next / react-i18next | 26 / 17 |
| 后端测试 | Jest + ts-jest | 29 |
| E2E 测试 | Playwright | 1.59 |
| CI/CD | GitHub Actions | — |

---

## 目录结构

```
Papyrus-beta12/
├── backend/                    # Node.js + TypeScript 后端
│   ├── src/
│   │   ├── ai/                 # AI 功能模块
│   │   │   └── tools/          # AI 工具定义 (cards, notes, files, data, relations, settings, extensions)
│   │   ├── api/                # Fastify 路由 & 服务器
│   │   │   ├── server.ts       # 服务入口，注册所有路由
│   │   │   └── routes/         # 20+ 路由模块
│   │   ├── core/               # 核心业务逻辑
│   │   │   ├── cards.ts        # 卡片 CRUD
│   │   │   ├── notes.ts        # 笔记管理
│   │   │   ├── sm2.ts          # SM-2 算法
│   │   │   ├── versioning.ts   # 版本历史
│   │   │   ├── crypto.ts       # AES-GCM 加密
│   │   │   ├── relations.ts    # 关系管理
│   │   │   └── files.ts        # 文件操作
│   │   ├── db/                 # 数据持久化 (JSON)
│   │   ├── integrations/       # 外部集成 (file-watcher/Obsidian)
│   │   ├── mcp/                # MCP 服务端点
│   │   └── utils/              # 工具 (auth, logger, paths, proxy, client-id)
│   └── tests/                  # 测试 (unit/ + integration/)
├── frontend/                   # React 19 前端
│   └── src/
│       ├── StartPage/          # 首页 (今日概览、复习队列、节气主题)
│       ├── ScrollPage/         # 卷轴复习页 (闪卡学习)
│       ├── NotesPage/          # 笔记管理 (关系图、文件夹树)
│       ├── ChartsPage/         # 统计图表
│       ├── FilesPage/          # 文件库
│       ├── ExtensionsPage/     # 扩展管理
│       ├── SettingsPage/       # 设置 (AI配置、无障碍、外观、快捷键)
│       ├── ChatPanel/          # AI 聊天面板
│       ├── components/         # 公共组件 (MarkdownView, ReasoningChain, ToolCallCard...)
│       ├── hooks/              # 自定义 Hooks
│       ├── i18n/               # 国际化配置
│       ├── icons/              # 图标系统 (30+ AI 模型/提供商 Logo)
│       ├── locales/            # 语言包 (zh-CN, en-US, zh-TW, ja-JP)
│       ├── contexts/           # React Context (AccessibilityContext)
│       └── utils/              # 工具函数
├── electron/                   # Electron 主进程
│   ├── main.js                 # 主进程入口
│   ├── preload.js              # 预加载脚本
│   ├── diagnostic-window.js    # 诊断窗口
│   └── diagnostic-preload.js   # 诊断预加载
├── e2e/                        # Playwright E2E 测试
├── scripts/                    # 构建/发布脚本
├── build/                      # Electron 构建资源 (证书、NSIS、macOS 权限)
├── assets/                     # 应用图标 (.ico, .icns, .png, .svg)
├── docs/                       # 项目文档
├── examples/                   # 扩展开发模板
└── tools/                      # 开发工具 (图标生成)
```

---

## 开发命令

### 根目录（Monorepo 协调）

| 命令 | 说明 |
|------|------|
| `.\start-dev.ps1` | 自动检查端口与依赖后启动前后端 |
| `npm run electron:dev` | Electron 开发模式 |
| `npm run build:frontend` | 构建前端生产版本 |
| `npm run build:backend` | 构建后端生产版本 |
| `npm run build:installer` | 完整构建安装包 |
| `npm run electron:build` | 全平台构建 |
| `npm run electron:build:win` | 仅构建 Windows |
| `npm run electron:build:mac` | 仅构建 macOS |
| `npm run electron:build:linux` | 仅构建 Linux |
| `npm run bump:patch/minor/major/beta/release` | 版本号管理 |
| `npm run sync-version` | 同步版本号到子包 |
| `npm run generate-icons` | 生成图标 |
| `npm run generate-cert` | 生成代码签名证书（PowerShell） |

### 后端 (`backend/`)

| 命令 | 说明 |
|------|------|
| `npm run dev` | tsx watch 热重载 Fastify |
| `npm run build` | tsc 编译到 dist/ |
| `npm run start` | 运行编译后的 dist/api/server.js |
| `npm run typecheck` | tsc --noEmit 类型检查 |
| `npm test` | Jest 单元 + 集成测试 |
| `npm run test:watch` | Jest 监听模式 |

### 前端 (`frontend/`)

| 命令 | 说明 |
|------|------|
| `npm run dev` | Vite 开发服务器 (localhost:5173) |
| `npm run build` | 生产构建到 dist/ |
| `npm run typecheck` | TypeScript 类型检查 |

### E2E 测试

| 命令 | 说明 |
|------|------|
| `npx playwright test` | Playwright E2E 测试 |

---

## 架构概览

### 前后端通信

- 后端默认监听 `127.0.0.1:8000`，可通过 `PAPYRUS_PORT` 环境变量覆盖
- 前端开发时通过 Vite proxy 将 `/api` 请求代理到后端
- Electron 模式下通过 `PAPYRUS_AUTH_TOKEN` 进行本地 API 保护
- 用户数据默认存储在 `$HOME/PapyrusData`，可通过 `PAPYRUS_DATA_DIR` 覆盖

### 后端架构

```
backend/src/
├── api/server.ts           # Fastify 应用入口，注册路由、CORS、限流、认证
├── api/routes/             # 20+ 路由模块
├── core/                   # 核心业务逻辑（UI 无关）
│   ├── cards.ts            # 卡片 CRUD
│   ├── notes.ts            # 笔记管理
│   ├── sm2.ts              # SM-2 间隔重复算法
│   ├── versioning.ts       # 版本历史
│   ├── crypto.ts           # AES-GCM 加密
│   ├── relations.ts        # 关系管理
│   └── files.ts            # 文件操作
├── ai/                     # AI Agent 系统
│   ├── config.ts           # AI 配置管理
│   ├── provider.ts         # AI 提供商接口
│   ├── tool-manager.ts     # 工具调用管理
│   ├── llm-cache.ts        # LLM 响应缓存
│   ├── tools.ts            # 工具调用入口
│   └── tools/              # 工具定义与实现
│       ├── registry.ts     # 工具注册表
│       ├── parser.ts       # AI 响应解析
│       ├── cards.ts        # 卡片工具
│       ├── notes.ts        # 笔记工具
│       ├── files.ts        # 文件工具
│       ├── data.ts         # 数据查询工具
│       ├── relations.ts    # 关系工具
│       ├── settings.ts     # 设置工具
│       └── extensions.ts   # 扩展工具
├── db/database.ts          # JSON 数据持久化
├── integrations/           # 外部集成
│   └── file-watcher.ts     # 文件监听（Obsidian Vault）
├── mcp/server.ts           # MCP 服务端点
└── utils/                  # 工具函数
    ├── auth.ts             # 认证
    ├── logger.ts           # 日志
    ├── paths.ts            # 路径常量
    ├── proxy.ts            # 代理配置
    └── client-id.ts        # 客户端标识
```

### 前端架构

```
frontend/src/
├── App.tsx                 # 根组件，管理页面路由
├── main.tsx                # 应用入口
├── api.ts                  # API 接口封装
├── Sidebar.tsx             # 侧边导航栏
├── TitleBar.tsx            # 顶部标题栏
├── StatusBar.tsx           # 状态栏
├── SearchBox.tsx           # 全局搜索
├── StartPage/              # 首页
├── ScrollPage/             # 卷轴复习页
├── NotesPage/              # 笔记管理页
├── ChartsPage/             # 统计图表页
├── FilesPage/              # 文件库页
├── ExtensionsPage/         # 扩展管理页
├── SettingsPage/           # 设置页
├── ChatPanel/              # AI 聊天面板
├── components/             # 公共组件
├── hooks/                  # 自定义 Hooks
├── contexts/               # React Context
├── i18n/                   # 国际化配置
├── icons/                  # 图标系统
├── locales/                # 语言包
└── utils/                  # 工具函数
```

---

## API 路由

后端注册的所有路由（前缀 `/api`）：

| 路由前缀 | 路由文件 | 功能 |
|----------|----------|------|
| `/api/cards` | cards.ts | 卡片 CRUD |
| `/api/review` | review.ts | 间隔重复复习 |
| `/api/notes` | notes.ts | 笔记管理 |
| `/api/search` | search.ts | 全局搜索 |
| `/api/ai-chat` | ai-chat.ts | AI 聊天 |
| `/api/ai-common` | ai-common.ts | AI 公共逻辑 |
| `/api/ai-completion` | ai-completion.ts | AI 补全 |
| `/api/ai-config` | ai-config.ts | AI 配置 |
| `/api/ai-messages` | ai-messages.ts | AI 消息管理 |
| `/api/ai-sessions` | ai-sessions.ts | AI 会话管理 |
| `/api/ai-tools` | ai-tools.ts | AI 工具调用 |
| `/api/progress` | progress.ts | 复习进度 |
| `/api/config/logs` | logs.ts | 日志配置 |
| `/api/markdown` | markdown.ts | Markdown 渲染 |
| `/api/providers` | providers.ts | AI 提供商管理 |
| `/api/update` | update.ts | 应用更新 |
| `/api/mcp` | mcp.ts | MCP 服务 |
| `/api/notes/:noteId` | note-versions.ts | 笔记版本历史 |
| `/api/cards/:cardId` | card-versions.ts | 卡片版本历史 |
| `/api/files` | files.ts | 文件管理 |
| `/api/relations` | relations.ts | 关系管理 |
| `/api/extensions` | extensions.ts | 扩展管理 |
| `/api/health` | (server.ts 内联) | 健康检查 |

---

## AI Agent 工具系统

### 工具分类

| 分类 | 工具文件 | 包含工具 | 读写 |
|------|----------|----------|------|
| cards | cards.ts | 卡片增删改查 | 读写 |
| notes | notes.ts | 笔记操作 | 读写 |
| relations | relations.ts | 关系管理 | 读写 |
| files | files.ts | 文件操作 | 读写 |
| data | data.ts | 数据查询 | 只读 |
| extensions | extensions.ts | 扩展管理 | 读写 |
| settings | settings.ts | 设置读取 | 只读 |

### 工具调用流程

1. 用户发送消息到 AI 聊天面板
2. 后端将消息转发给 AI 提供商（通过 OpenAI SDK）
3. AI 返回工具调用请求（tool_call）
4. `tool-manager.ts` 解析并执行工具
5. 写操作需要用户审批（manual/auto 模式）
6. 工具结果返回给 AI 继续对话

### 支持的 AI 提供商

30+ 兼容提供商，包括：OpenAI、Anthropic、Ollama、Deepseek、Qwen、Gemini、Grok、Moonshot、Mistral、Minimax、OpenRouter、SiliconCloud 等。

### 双模式

- **Chat 模式**：纯对话，不调用工具
- **Agent 模式**：工具调用，可操作卡片/笔记/文件等

---

## 核心功能模块

### SM-2 间隔重复算法

- 实现文件：`backend/src/core/sm2.ts`
- 三级评分：1=忘记 / 2=模糊 / 3=秒杀
- 根据答题表现动态调整复习间隔
- 自动适配旧数据，无需迁移

### 卡片管理

- 卡片 CRUD（创建/编辑/删除/搜索）
- 批量导入（TXT 格式：`问题 === 答案`）
- 标签管理与过滤
- 卡片集合（Collection）管理
- 版本历史与回滚

### 笔记系统

- Markdown 笔记编辑
- 文件夹层级管理
- Obsidian Vault 导入（chokidar 文件监听）
- 笔记关系图（RelationGraph）
- 笔记-卡片双向关联

### 安全特性

- API Key AES-GCM 加密落盘（`backend/src/core/crypto.ts`）
- 写接口强制 auth token（Electron 模式）
- SSRF 防护（AI base URL 校验）
- Rate limiting（5000 req/min/IP）
- 路径遍历防护
- 安全响应头（X-Content-Type-Options, X-Frame-Options, Referrer-Policy）

### 无障碍（a11y）

- WCAG 2.1 AA 全站覆盖，AAA 级对比度方案
- 完整键盘导航（Tab 遍历）
- 屏幕阅读器优化（ARIA 标签、live region）
- 减少动画模式
- AccessibilityContext 与 ScreenReaderAnnouncer

### 国际化（i18n）

- 支持四种语言：简体中文（zh-CN）、英文（en-US）、繁体中文（zh-TW）、日文（ja-JP）
- 默认语言为简体中文
- 语言包位于 `frontend/src/locales/`

---

## 测试

### 后端测试

- 框架：Jest + ts-jest
- 覆盖率阈值：80%（branches/functions/lines/statements）
- 测试文件位于 `backend/tests/unit/` 和 `backend/tests/integration/`
- 20 个测试文件覆盖：AI 配置、AI 工具、认证、卡片、聊天历史、加密、数据库、文件监听、文件操作、LLM 缓存、日志、MCP 服务、笔记、代理、速率限制、关系、SM-2、工具管理器、版本控制
- 运行：`cd backend && npm test`

### E2E 测试

- 框架：Playwright
- 配置：`e2e/playwright.config.ts`
- 使用临时数据目录，自动启动后端服务器，基于 Chromium 运行
- 运行：`npx playwright test`

---

## 构建与发布

### CI/CD

GitHub Actions 工作流（`.github/workflows/release-optimized.yml`）：
- 触发条件：push 到 main/develop/v2.* 分支、push v* tag、手动触发
- 构建矩阵：Windows x64 + macOS arm64 + Linux x64
- 流程：安装依赖 → typecheck → 构建 → 生成 Release Notes → 上传安装包

### 版本管理

- 版本号格式：`2.0.0-beta.12`
- 版本同步：`npm run sync-version`（同步到 frontend/package.json 和 backend/package.json）
- 版本提升：`npm run bump:patch/minor/major/beta/release`

### Electron 构建

- 配置文件：`.electron-builder.config.js`
- Windows：NSIS 安装包
- macOS：DMG
- Linux：AppImage / DEB
- 代码签名：`build/create-cert.ps1`（Windows）

---

## 关键约定

### 代码风格

- TypeScript 严格模式（`strict: true`）
- 后端使用 ES Module（`"type": "module"`）
- 导入路径带 `.js` 后缀（TypeScript ES Module 约定）
- 无 ESLint / Prettier 配置（仅有 `.hintrc`）
- Tailwind CSS 类名带 `tw-` 前缀

#### TypeScript 类型规范

- **禁止显式 `any`**：任何场景下不得使用显式 `any` 声明类型。若类型暂时无法确定，优先使用 `unknown`，并在使用前通过类型守卫（`typeof`、`instanceof`、自定义 guard）或 Zod 等校验库收窄类型。
- **优先 `unknown` 而非 `any`**：`unknown` 强制在使用前进行类型检查，避免绕过 TypeScript 编译时检查。仅在极少数与第三方库交互且无法获得类型定义时，才可在局部使用 `any`，但必须附加说明并在注释中解释原因。
- **`type` 与 `interface` 分工**：`type` 用于联合类型（`A | B`）、元组（`[string, number]`）、条件类型（`T extends U ? X : Y`）、映射类型、交叉类型及复杂类型运算；`interface` 用于定义对象结构、类实现约定及需要扩展合并的实体类型。
- **避免非空断言 `!`**：禁止使用 `!` 进行非空断言。若需确保值存在，应在代码逻辑中通过 `if (value == null)` 或可选链 `?.` 进行空值检查，或借助 Zod 校验保证运行时非空。
- **谨慎使用类型断言 `as`**：类型断言 `as` 会绕过类型检查，仅在以下场景允许使用：（1）从 `unknown` 经校验后收窄类型；（2）与老旧无类型声明的第三方库交互；（3）框架特有的类型推断缺陷（如 React `useRef` 初始化）。每次使用必须附带注释说明为何需要断言以及为何无法通过正常类型推导实现。
- **开启严格模式相关配置**：前后端 `tsconfig.json` 均已启用 `strict: true`。在此基础上，后端额外启用 `noUncheckedIndexedAccess: true`，访问数组或对象索引时必须处理 `undefined` 情况。

#### 导入路径规范

- **优先使用绝对路径或路径别名**：避免使用 `../../` 等多级相对路径，降低重构成本。前端通过 `vite.config.js` 的 `resolve.alias` 配置别名（如 `@/` 映射到 `src/`）；后端通过 `tsconfig.json` 的 `paths` 配置别名，并配合 `tsx` 或 `tsc-alias` 确保编译/运行时解析一致。
- **后端 ES Module 路径**：后端为 ES Module，导入路径必须带 `.js` 后缀（如 `import { foo } from './bar.js'`）。使用路径别名时，别名目标路径同样需保持 `.js` 后缀。

#### 注释规范

- **每个函数、复杂逻辑块或类型定义必须包含以下三类信息**：
  1. **代码的说明**：这段代码做了什么，输入输出是什么。
  2. **为什么这样做**：采用当前方案的业务或技术原因。
  3. **为什么不用其他方式**：简要说明弃用其他方案的理由（如性能、类型安全、可维护性等）。
- **示例**：
  ```typescript
  // 使用 Map 缓存卡片 ID 到复习间隔的映射
  // 原因：Map 的查找时间复杂度为 O(1)，且允许任意类型键，
  //       对象键在此处不频繁变更，Map 比对象更合适。
  // 未使用对象：对象的键会被强制转为字符串，且原型链存在额外开销。
  const intervalCache = new Map<string, number>();
  ```

### 数据存储

- 本地 JSON 文件存储（非数据库）
- 数据目录：`$HOME/PapyrusData`（可通过 `PAPYRUS_DATA_DIR` 覆盖）
- 日志目录：`$HOME/PapyrusData/logs`

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PAPYRUS_PORT` | 后端监听端口 | 8000 |
| `PAPYRUS_DATA_DIR` | 用户数据目录 | `$HOME/PapyrusData` |
| `PAPYRUS_AUTH_TOKEN` | API 认证 token（Electron 模式） | — |
| `PAPYRUS_DEBUG` | 调试模式（1=开启） | — |
| `NODE_ENV` | 运行环境 | — |

### 前端约定

- 页面组件以 `*Page` 命名（StartPage, ScrollPage, NotesPage 等）
- 公共组件放在 `components/`
- 自定义 Hooks 放在 `hooks/`，以 `use` 前缀命名
- 图标组件放在 `icons/`
- 类型定义放在 `types/`
- 国际化 key 在 `locales/*.json` 中维护

### 后端约定

- 路由模块放在 `api/routes/`，每个文件导出 Fastify 插件
- 核心业务逻辑放在 `core/`，保持 UI 无关
- AI 工具定义放在 `ai/tools/`，通过 registry 注册
- 工具分为 read（只读）和 write（写操作需审批）两类
- 日志使用 `PapyrusLogger`，支持事件日志和结构化输出

## 行动约定

在执行整体修改代码操作（如按照plan修改代码，修改bug等）时，自行设定一个五万tokens的goal（如果支持goal模式，），耗尽后需要用户同意才能自动设定goal。
读代码读文件，和简单问题回答，work办公时不适用此规则。
