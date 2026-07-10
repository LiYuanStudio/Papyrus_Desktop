# Papyrus 改动导航 (Change Guide)

> **作用**：让开发者（和 AI）在不翻遍仓库的情况下，知道"改 X 应该 touch 哪些文件"。
> 
> **使用方式**：按场景查找对应章节，按"涉及文件 → 改动方式 → 常见陷阱"的顺序执行。
> 
> **维护约定**：每次新增高频改动场景，在本文件追加章节；若文件路径变更，同步更新此处。

---

## 目录

- [版本号同步](#版本号同步)
- [AI 配置与提供商](#ai-配置与提供商)
- [国际化 (i18n)](#国际化-i18n)
- [新增 API 路由](#新增-api-路由)
- [新增前端页面 / 组件](#新增前端页面--组件)
- [数据库 Schema 变更](#数据库-schema-变更)
- [构建与打包配置](#构建与打包配置)
- [CI/CD 工作流](#cicd-工作流)
- [新增脚本工具](#新增脚本工具)
- [测试](#测试)

---

## 版本号同步

### 问题背景

Papyrus 的版本号至少散落在 6 个位置，手动修改极易遗漏，导致"设置-应用"、"关于界面"、"后端 API"三者版本不一致。

### 涉及文件（按消费方分类）

| 消费方 | 文件 | 说明 |
|--------|------|------|
| Electron 主进程 | `package.json` -> `version` | `app.getVersion()` 读取，控制应用本身版本 |
| 前端 About 页面 | `frontend/vite.config.js` -> `__APP_VERSION__` | 构建时注入，AboutView.tsx 回退显示 |
| 前端 About 页面 | `frontend/src/SettingsPage/views/AboutView.tsx` | 运行时从 `/api/update/version` 获取，失败时回退到 `__APP_VERSION__` |
| 后端版本 API | `backend/src/api/routes/update.ts` -> `CURRENT_VERSION` | `/api/update/version` 返回，About 页面调用 |
| 子包元数据 | `frontend/package.json` -> `version` | 独立 npm 包，需与根版本保持一致 |
| 子包元数据 | `backend/package.json` -> `version` | 独立 npm 包，需与根版本保持一致 |
| Lock 文件 | `package-lock.json` -> `version` | npm 元数据，不一致会导致 CI lock 校验失败 |
| Lock 文件 | `frontend/package-lock.json` | 子包 lock，bump-version.js 会重生 |
| Lock 文件 | `backend/package-lock.json` | 子包 lock，bump-version.js 会重生 |

### 正确做法

**不要手动改任何一个 `package.json` 的 version 字段。**

使用现有脚本：

```bash
# 场景 1：直接设置版本号（适合发布前定版）
npm run set-version 2.0.0-beta.12
# 或
node scripts/set-version.js 2.0.0-beta.12

# 场景 2：基于当前版本自动 bump（适合日常迭代）
npm run bump:patch    # 2.0.0 -> 2.0.1
npm run bump:minor    # 2.0.0 -> 2.1.0
npm run bump:major    # 2.0.0 -> 3.0.0
npm run bump:beta     # 2.0.0-beta.7 -> 2.0.0-beta.8
npm run bump:release  # 2.0.0-beta.8 -> 2.0.0

# 场景 3：只同步不 bump（根版本已改，子包没跟上）
npm run sync-version
# 或
node scripts/sync-version.js
```

### 脚本行为对照

| 脚本 | 改根 pkg | 改 frontend pkg | 改 backend pkg | 改 lock | 打 git tag | 推送到 origin |
|------|---------|----------------|---------------|---------|-----------|--------------|
| `set-version.js` | yes | yes | yes | yes(根) | no | no |
| `bump-version.js` | yes | yes | yes | yes(三份) | yes | 可选 |
| `sync-version.js` | no(读取) | yes | yes | no | no | no |

### 常见陷阱

- **只改根 `package.json`** -> About 页面仍显示旧版本，因为 `frontend/package.json` 和 `backend/package.json` 没同步。
- **改了 package.json 但没改 lock** -> CI 构建时 `npm ci` 可能因 lock 版本不一致而失败。
- **直接字符串替换** -> 可能误伤其他含版本号的依赖声明。必须通过 JSON 解析后写回。
- **AboutView.tsx 里的硬编码回退值** -> `sync-version.js` 会尝试同步，但如果组件已改用 `__APP_VERSION__`，则无需处理。
- **Vite 构建缓存** -> 改了 `package.json` 后，前端若显示旧版本，可能是 Vite 缓存。清缓存重编：
  `cd frontend && rm -rf node_modules/.vite && npm run build`

### 验证方法

```bash
# 1. 确认三份 package.json 一致
node -e "const r=require('./package.json').version, f=require('./frontend/package.json').version, b=require('./backend/package.json').version; console.log(r===f && f===b ? '一致: ' + r : '不一致: 根='+r+' 前端='+f+' 后端='+b)"

# 2. 确认 lock 文件已更新
grep -m1 '"version"' package-lock.json

# 3. 运行版本相关测试
npm run test:bump
npm run test:version-updater
npm run test:set-version

# 4. 启动应用，检查设置-关于页面版本号
npm run electron:dev
```

---

## AI 配置与提供商

### 问题背景

Papyrus 支持 30+ AI 提供商，配置分散在前后端。新增/修改提供商、调整模型列表、修改默认参数时，容易遗漏前后端同步点。

### 涉及文件

**后端（真相源）**：
- `backend/src/ai/config.ts` — AI 配置的读写、加密/解密、默认值定义
- `backend/src/ai/provider.ts` — 提供商接口抽象、HTTP 调用、流式处理
- `backend/src/ai/tool-manager.ts` — 工具调用管理、Agent 模式调度
- `backend/src/api/routes/ai-config.ts` — `/api/config/ai` 路由，前端通过此处读写配置
- `backend/src/api/routes/providers.ts` — `/api/providers` 路由，返回可用提供商/模型列表

**前端（消费方）**：
- `frontend/src/SettingsPage/views/ChatView/` — AI 设置面板（提供商、模型、参数）
- `frontend/src/ChatPanel/` — AI 聊天面板（模型选择、消息发送）
- `frontend/src/types/ai.ts` — 共享 AI 类型定义（前后端接口契约）
- `frontend/src/api.ts` — API 客户端封装，含 `getAIConfig()`、`updateAIConfig()`、`getProviders()`

**数据存储**：
- `PapyrusData/ai_config.json` — 运行时配置落盘（AES-GCM 加密后的 API Key）
- `PapyrusData/.master_key` — 加密主密钥

### 正确做法

#### 新增 AI 提供商

1. **后端**：在 `backend/src/ai/config.ts` 的 `LOCAL_PROVIDERS` 或相应逻辑中注册
2. **后端**：确保 `backend/src/ai/provider.ts` 能处理该提供商的 base_url 格式
3. **前端**：在 `frontend/src/types/ai.ts` 补充类型（如需）
4. **前端**：在 `frontend/src/SettingsPage/views/ChatView/components/ProvidersSection.tsx` 或相关组件添加 UI
5. **验证**：启动应用，在设置面板添加该提供商，测试连通性

#### 修改默认模型参数

1. **后端**：改 `backend/src/ai/config.ts` 中的 `DEFAULT_PARAMETERS`
2. **前端**：如需 UI 同步，改 `frontend/src/SettingsPage/views/ChatView/components/ModelModal.tsx` 或相关组件
3. **验证**：确认新参数能被正确保存和读取

### 常见陷阱

- **API Key 未加密落盘** -> `config.ts` 使用 `encryptApiKey`/`decryptApiKey`，不要直接明文写 `ai_config.json`
- **前后端类型不一致** -> 新增字段时，同时更新 `frontend/src/types/ai.ts` 和 `backend/src/ai/config.ts` 的 interface
- **模型列表硬编码** -> 前端不应写死模型列表，应从 `/api/providers` 动态获取
- **本地提供商不走代理** -> `backend/src/utils/proxy.ts` 中，本地提供商（ollama/lm-studio 等）默认跳过代理

### 验证方法

```bash
# 1. 后端类型检查
cd backend && npm run typecheck

# 2. 前端类型检查
cd frontend && npm run typecheck

# 3. 启动前后端，在设置面板测试 AI 配置保存/读取
npm run dev

# 4. 运行 AI 相关测试
cd backend && npm test -- --testPathPattern="ai|config"
```

---

## 国际化 (i18n)

### 问题背景

支持 4 种语言（zh-CN, en-US, zh-TW, ja-JP），新增功能时必须同步补充所有语言包，否则非中文用户会看到 key 名或英文回退。

### 涉及文件

**语言包（真相源）**：
- `frontend/src/locales/zh-CN.json` — 简体中文（默认/最全）
- `frontend/src/locales/en-US.json` — 英文
- `frontend/src/locales/zh-TW.json` — 繁体中文
- `frontend/src/locales/ja-JP.json` — 日文

**配置入口**：
- `frontend/src/i18n/index.ts` — i18n 初始化、资源注册、默认语言

**消费方**：
- 所有使用 `useTranslation()` 或 `t('key')` 的组件

### 正确做法

#### 新增翻译 key

1. **先在 `zh-CN.json` 添加**（作为基准）
2. **同步添加到其他 3 个文件**，优先英文，繁中/日文可先用机器翻译占位
3. **遵循命名空间**：按页面或功能模块组织 key，如 `aboutView.version`、`chatPanel.sendButton`

#### 修改现有翻译

1. **改 `zh-CN.json`**
2. **检查其他语言包**是否需同步调整语义
3. **不要改 key 名**除非全局替换，否则会导致所有引用处失效

### 常见陷阱

- **只改 zh-CN** -> 其他语言用户看到 key 名或英文回退，体验极差
- **key 命名冲突** -> 不同模块用相同 key，导致一处修改影响多处
- **动态插值变量不一致** -> 中文用 `{{version}}`，英文用 `{{ver}}`，会导致插值失败
- **RTL 语言预留** -> 当前不支持阿拉伯语/希伯来语，但 UI 组件应尽量避免硬编码左右方向（用 CSS `start`/`end`）

### 验证方法

```bash
# 1. 检查是否有遗漏 key（对比 zh-CN 和其他语言包）
node -e "const zh=require('./frontend/src/locales/zh-CN.json'), en=require('./frontend/src/locales/en-US.json'); const zhKeys=Object.keys(zh).sort(), enKeys=Object.keys(en).sort(); const missing=zhKeys.filter(k=>!enKeys.includes(k)); console.log(missing.length ? '英文缺失: ' + missing.join(', ') : '英文完整')"

# 2. 启动前端，切换语言检查
cd frontend && npm run dev
# 浏览器访问 http://localhost:5173，在设置中切换语言

# 3. 全局搜索硬编码中文
grep -r "[一-鿿]" frontend/src --include="*.tsx" --include="*.ts" | grep -v "locales" | grep -v "\.test\."
```

---

## 新增 API 路由

### 问题背景

后端使用 Fastify，路由按模块拆分。新增功能时，需要注册路由、实现业务逻辑、可能还需要数据库 Schema 支持。

### 涉及文件

**路由注册（必须）**：
- `backend/src/api/routes/<feature>.ts` — 新建路由文件，导出 Fastify 插件
- `backend/src/api/server.ts` — 在 `registerRoutes()` 中 `app.register()` 新路由

**业务逻辑（推荐）**：
- `backend/src/core/<feature>.ts` — 纯业务逻辑，UI 无关，便于测试

**数据层（如需）**：
- `backend/src/db/database.ts` — SQLite 操作（新增表/列）
- `backend/src/core/types.ts` — 数据类型定义

**类型共享（如需前端消费）**：
- `frontend/src/api.ts` — 前端 API 客户端，添加对应方法
- `frontend/src/types/*.ts` — 共享 TypeScript 类型

### 正确做法

1. **在 `backend/src/core/` 实现纯逻辑**（如果需要）
2. **在 `backend/src/api/routes/` 创建路由文件**，导出 `fastifyPlugin`
3. **在 `backend/src/api/server.ts` 注册路由**，注意 `prefix` 一致性
4. **在 `frontend/src/api.ts` 添加前端调用方法**
5. **补充测试**：`backend/tests/unit/` 或 `backend/tests/integration/`

### 路由文件模板

```typescript
// backend/src/api/routes/example.ts
import { FastifyInstance } from 'fastify';

export default async function exampleRoutes(app: FastifyInstance) {
  app.get('/', async (_request, reply) => {
    reply.send({ success: true, data: [] });
  });

  app.post('/', async (request, reply) => {
    const body = request.body as { name: string };
    reply.send({ success: true, id: 'uuid' });
  });
}
```

### 常见陷阱

- **忘记在 server.ts 注册** -> 路由写了但无法访问，404
- **前后端路径不一致** -> 后端用 `/api/cards`，前端调用 `/api/card`（少了个 s）
- **未处理 auth** -> Electron 模式下写接口需要 `PAPYRUS_AUTH_TOKEN`，读接口一般不需要
- **未校验请求体** -> 使用 Zod 或手动校验，避免非法数据入库
- **ES Module 后缀** -> 后端所有 import 必须带 `.js` 后缀

### 验证方法

```bash
# 1. 后端类型检查
cd backend && npm run typecheck

# 2. 启动后端，直接 curl 测试
cd backend && npm run dev
# 另开终端
curl http://localhost:8000/api/health
curl http://localhost:8000/api/your-new-route

# 3. 运行后端测试
cd backend && npm test
```

---

## 新增前端页面 / 组件

### 问题背景

前端是 React 19 + Arco Design + Tailwind CSS。新增页面需要在路由、导航栏、目录结构三处保持一致。

### 涉及文件

**页面组件**：
- `frontend/src/<PageName>/` — 页面目录，如 `StartPage/`, `ScrollPage/`
- `frontend/src/App.tsx` — 根路由注册
- `frontend/src/Sidebar.tsx` — 侧边栏导航入口

**公共组件**：
- `frontend/src/components/` — 跨页面复用组件

**自定义 Hooks**：
- `frontend/src/hooks/` — 以 `use` 前缀命名

**样式**：
- Tailwind CSS 类名带 `tw-` 前缀
- 页面级样式可放 `frontend/src/<PageName>/<PageName>.css`

### 正确做法

1. **在 `frontend/src/` 下新建页面目录**，如 `NewPage/`
2. **创建页面入口组件**，如 `NewPage/NewPage.tsx`
3. **在 `frontend/src/App.tsx` 添加路由**
4. **在 `frontend/src/Sidebar.tsx` 添加导航项**（如需）
5. **在 `frontend/src/locales/*.json` 补充翻译 key**（如需）
6. **如需全局状态**，使用 `frontend/src/contexts/` 或 React Context

### 目录结构示例

```
frontend/src/
├── NewPage/
│   ├── NewPage.tsx          # 页面入口
│   ├── components/          # 页面私有组件
│   ├── hooks/               # 页面私有 hooks
│   └── NewPage.css          # 页面级样式（可选）
├── App.tsx                  # 路由注册
├── Sidebar.tsx              # 导航栏
└── locales/
    └── zh-CN.json           # 翻译
```

### 常见陷阱

- **页面组件未以 `*Page` 结尾** -> 项目约定：StartPage, ScrollPage, NotesPage 等
- **路由路径和导航栏不一致** -> 用户点击侧边栏跳转到 404
- **忘记补充翻译** -> 新页面显示 key 名
- **Tailwind 类名忘加 `tw-` 前缀** -> 样式不生效（本项目配置 `prefix: 'tw-'`）
- **未处理响应式** -> Arco Design 组件自带部分响应式，但复杂布局需手动处理
- **未添加键盘导航** -> WCAG 要求，需确保 Tab 键可遍历，ARIA 标签完整

### 验证方法

```bash
# 1. 前端类型检查
cd frontend && npm run typecheck

# 2. 启动前端
cd frontend && npm run dev
# 浏览器访问 http://localhost:5173，检查新页面路由、导航栏、渲染

# 3. E2E 测试（如适用）
npx playwright test

# 4. 检查无障碍
# 浏览器 DevTools -> Lighthouse -> Accessibility
```

---

## 数据库 Schema 变更

### 问题背景

后端使用 SQLite (`node:sqlite`)，Schema 初始化在 `database.ts` 中。迁移策略是"启动时自动创建/升级"，没有传统 migration 文件。

### 涉及文件

- `backend/src/db/database.ts` — 数据库连接、Schema 初始化、所有 CRUD 操作
- `backend/src/core/types.ts` — 数据类型定义（Card, Note, Provider 等）
- `backend/src/utils/paths.ts` — 数据目录路径（`PapyrusData/`）

### 正确做法

#### 新增表

1. **在 `database.ts` 的 `initSchema()` 中添加 `CREATE TABLE IF NOT EXISTS`**
2. **在 `core/types.ts` 定义对应 TypeScript 类型**
3. **在 `database.ts` 添加 CRUD 函数**
4. **在 `api/routes/` 暴露 API**

#### 新增列（已有表）

1. **在 `initSchema()` 中使用 `ALTER TABLE ADD COLUMN IF NOT EXISTS`**（SQLite 3.35.0+ 支持）
2. **如果 SQLite 版本不支持 `IF NOT EXISTS`**，需先查询 `PRAGMA table_info(table_name)` 判断列是否存在
3. **更新 TypeScript 类型**
4. **更新 CRUD 函数**

### 常见陷阱

- **直接改 `CREATE TABLE` 不处理已有数据** -> 用户升级后数据丢失。必须用 `IF NOT EXISTS` 或显式迁移逻辑。
- **忘记 WAL 模式** -> `database.ts` 已设置 `PRAGMA journal_mode = WAL`，新连接需保持。
- **路径问题** -> 数据目录由 `PAPYRUS_DATA_DIR` 环境变量或默认 `~/PapyrusData` 决定，不要硬编码。
- **并发写入** -> SQLite 是文件级锁，`async-mutex` 已用于关键操作，新增写操作需评估是否需要加锁。
- **类型和 DB 不一致** -> `types.ts` 改了但 `database.ts` 没同步，导致运行时类型错误。

### 验证方法

```bash
# 1. 删除本地数据库，启动后端，确认 Schema 正确重建
rm ~/PapyrusData/papyrus.db
cd backend && npm run dev
# 观察控制台是否有 Schema 初始化日志

# 2. 检查表结构
sqlite3 ~/PapyrusData/papyrus.db ".schema"

# 3. 运行后端测试
cd backend && npm test

# 4. 确认数据持久化
# 通过应用创建数据，重启后端，确认数据仍在
```

---

## 构建与打包配置

### 问题背景

构建链路涉及 Vite（前端）、tsc（后端）、electron-builder（打包）。修改构建产物、打包行为、证书配置时需 touch 多处。

### 涉及文件

**前端构建**：
- `frontend/vite.config.js` — Vite 配置、代理、环境变量注入
- `frontend/tsconfig.json` — TypeScript 编译选项
- `frontend/tailwind.config.js` — Tailwind CSS 配置

**后端构建**：
- `backend/tsconfig.json` — TypeScript 编译选项（`strict: true`, `noUncheckedIndexedAccess: true`）
- `backend/jest.config.js` — 测试配置

**Electron 打包**：
- `.electron-builder.config.js` — electron-builder 配置（跨平台打包、签名、发布）
- `scripts/build-electron.js` — 自定义构建脚本（dev/build 模式切换）
- `electron/main.js` — 主进程入口
- `electron/preload.js` — 预加载脚本（安全上下文桥接）

**图标/资源**：
- `assets/icon.ico` — Windows 图标
- `assets/icon.icns` — macOS 图标
- `assets/icon.png` — Linux 图标 / 通用
- `tools/generate-icons.js` — 图标生成脚本

### 正确做法

#### 修改构建产物路径

1. **改 `frontend/vite.config.js`** — `build.outDir`
2. **改 `.electron-builder.config.js`** — `directories.output`, `files` 匹配规则
3. **改 `scripts/build-electron.js`** — 如有自定义 copy 逻辑

#### 新增平台支持

1. **改 `.electron-builder.config.js`** — 在 `win`/`mac`/`linux` 下新增 target
2. **确认图标格式** — 该平台需要的图标尺寸和格式
3. **CI 工作流** — `.github/workflows/release-optimized.yml` 中添加对应 runner

### 常见陷阱

- **前端构建产物未进入 electron 包** -> `.electron-builder.config.js` 的 `files` 数组必须包含 `frontend/dist`
- **环境变量未注入** -> Vite 的 `define` 只在构建时生效，Electron 主进程读 `process.env`
- **后端源码被打包进前端** -> `files` 中的 `!backend/**/*` 排除后端源码
- **证书路径** -> Windows 代码签名证书在 `~/.papyrus-certs/`，不在仓库内
- **asar 打包问题** -> `extraResources` 中的文件不会被 asar 化，适合放用户可替换的资源

### 验证方法

```bash
# 1. 前端构建
cd frontend && npm run build
# 检查 frontend/dist/ 产物

# 2. 后端构建
cd backend && npm run build
# 检查 backend/dist/ 产物

# 3. Electron 本地打包（不发布）
npm run electron:build:win
# 检查 dist-electron/ 产物

# 4. 测试安装包
# Windows: dist-electron/Papyrus Desktop Setup x.x.x.exe
```

---

## CI/CD 工作流

### 问题背景

使用 GitHub Actions，单工作流文件控制构建、测试、发布。触发条件复杂（分支、tag、手动）。

### 涉及文件

- `.github/workflows/release-optimized.yml` — 唯一工作流文件
- `package.json` — 脚本定义，CI 调用
- `.electron-builder.config.js` — CI 中调用 electron-builder

### 触发条件（当前配置）

| 事件 | 行为 |
|------|------|
| push 到 `release` 分支 | 构建校验（不发布） |
| push 到 `release/**` | 构建校验（不发布） |
| push 到 `BA*` / `codex/BA*` | 构建校验（不发布） |
| push `v*` tag | 构建 + 发布 Release |
| PR 到 `main` | 构建校验 |
| 手动触发 (workflow_dispatch) | 构建 + 可选发布 |

### 正确做法

#### 新增触发分支

1. **改 `.github/workflows/release-optimized.yml`** — 在 `on.push.branches` 下添加分支名模式
2. **确认分支命名** — 当前支持 `BA*` 和 `codex/BA*` 作为 beta 构建分支

#### 修改构建矩阵

1. **改 `strategy.matrix`** — 新增 `os` 和 `arch` 组合
2. **确认 runner 标签** — GitHub Actions 的 runner 名称（`windows-latest`, `macos-latest`, `ubuntu-latest`）
3. **确认产物上传** — `actions/upload-artifact` 和 `softprops/action-gh-release` 配置

### 常见陷阱

- **分支名写错** -> push 后工作流不触发，检查 Actions 标签页的过滤条件
- **权限不足** -> release 上传需要 `contents: write` 权限，已在 job 级别配置
- **缓存挤爆** -> 使用 `actions/setup-node` 内置缓存，避免手动缓存策略
- **Node 版本不匹配** -> 当前使用 Node 24+，若降级需同步改 `actions/setup-node` 的 `node-version`
- **secrets 未配置** -> 代码签名证书、GitHub Token 等需到 Settings -> Secrets 配置

### 验证方法

```bash
# 1. 本地 act 测试（如有安装）
act push --workflows .github/workflows/release-optimized.yml

# 2. 推送到触发分支，观察 GitHub Actions
# 访问 https://github.com/PapyrusOR/Papyrus_Desktop/actions

# 3. 检查产物
# 进入最新 workflow run -> Artifacts，下载检查
```

---

## 新增脚本工具

### 问题背景

项目根目录 `scripts/` 存放开发/构建辅助脚本。新增脚本时需遵循命名、测试、注册到 npm scripts 的规范。

### 涉及文件

**脚本目录**：
- `scripts/<tool-name>.js` — 脚本主体
- `scripts/__tests__/<tool-name>.test.js` — 对应测试（可选但推荐）
- `package.json` -> `scripts` — 注册 npm script 入口

**现有脚本清单**：

| 脚本 | 作用 | 测试 |
|------|------|------|
| `build-electron.js` | Electron 构建/开发模式切换 | 无 |
| `bump-version.js` | 版本 bump + 同步 + 打 tag | `bump-version.test.js` |
| `sync-version.js` | 从根版本同步到子包 | 无 |
| `set-version.js` | 直接设置版本号 | `set-version.test.js` |
| `verify-packaged-deps.js` | 检查打包依赖完整性 | 无 |
| `generate-release-notes.js` | 生成 Release Notes | 无 |
| `extract-changelog.js` | 从 CHANGELOG 提取内容 | 无 |

### 正确做法

1. **新建 `scripts/<tool-name>.js`**
   - 使用 CommonJS (`require`)
   - 文件头写清用途、用法、示例
   - CLI 入口用 `if (require.main === module)` 包裹
   - 核心逻辑导出为 `module.exports`，便于测试

2. **新建 `scripts/__tests__/<tool-name>.test.js`**
   - 使用 `node:test` 内置测试框架
   - 覆盖正常路径和错误路径
   - 文件/IO 操作使用临时目录（`os.tmpdir()`）

3. **在 `package.json` 的 `scripts` 中注册**
   - 命令格式：`"<command-name>": "node scripts/<tool-name>.js"`
   - 测试命令：`"test:<command-name>": "node scripts/__tests__/<tool-name>.test.js"`

4. **在 `package.json` 的 `devDependencies` 中声明新依赖**（如需）
   - 优先复用已有依赖（如 `semver`）
   - 若必须新增，说明理由

### 脚本模板

```javascript
#!/usr/bin/env node
/**
 * Tool Name
 *
 * 说明：这个脚本做什么。
 * 原因：为什么需要这个脚本。
 * 未使用其他方式：为什么不用现有工具/脚本。
 *
 * Usage:
 *   node scripts/tool-name.js <arg>
 */

const fs = require('fs');
const path = require('path');

class ToolError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ToolError';
  }
}

function main(argv) {
  // 解析参数
  // 执行业务逻辑
  // 输出结果
}

module.exports = { main, ToolError };

if (require.main === module) {
  try {
    main(process.argv);
  } catch (error) {
    if (error instanceof ToolError) {
      console.error(`错误: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}
```

### 常见陷阱

- **未处理 `require.main === module`** -> 无法被测试文件导入
- **未自定义 Error 类** -> 无法区分业务错误和代码错误，CLI 退出码混乱
- **硬编码路径** -> 使用 `path.resolve(__dirname, '..')` 定位项目根目录
- **未清理临时文件** -> 测试中使用 `fs.unlinkSync` 或 `fs.rmSync` 清理
- **未注册 npm script** -> 其他开发者不知道这个脚本存在
- **ES Module 混淆** -> 脚本目录统一用 CommonJS（`require`），后端源码用 ES Module（`import`）

### 验证方法

```bash
# 1. 直接运行脚本
node scripts/<tool-name>.js <args>

# 2. 通过 npm script 运行
npm run <command-name>

# 3. 运行测试
node scripts/__tests__/<tool-name>.test.js

# 4. 检查是否污染仓库
git status --short
```

---

## 测试

### 问题背景

三层测试：后端单元/集成测试（Jest）、前端类型检查（tsc）、E2E 测试（Playwright）。新增功能时需在正确层级补充测试。

### 涉及文件

**后端测试**：
- `backend/tests/unit/` — 单元测试（纯函数、工具类）
- `backend/tests/integration/` — 集成测试（API 路由、数据库操作）
- `backend/jest.config.js` — 测试配置
- `backend/package.json` -> `scripts.test` — `cross-env NODE_OPTIONS=--experimental-vm-modules jest`

**前端类型检查**：
- `frontend/tsconfig.json` — 严格模式配置
- `frontend/package.json` -> `scripts.typecheck` — `tsc -p tsconfig.json --noEmit`

**E2E 测试**：
- `e2e/playwright.config.ts` — Playwright 配置
- `e2e/*.spec.ts` — 测试用例
- `e2e/api.spec.ts` — API 集成测试

**脚本测试**：
- `scripts/__tests__/*.test.js` — 脚本工具测试

### 正确做法

#### 新增后端功能

1. **在 `backend/src/core/` 实现纯逻辑**
2. **在 `backend/tests/unit/` 写单元测试**
3. **在 `backend/tests/integration/` 写 API 测试**（如需）
4. **运行 `cd backend && npm test`**

#### 新增前端组件

1. **实现组件**
2. **运行 `cd frontend && npm run typecheck`**
3. **如需 E2E 覆盖**，在 `e2e/` 添加用例

### 测试覆盖率要求

- 阈值：80%（branches/functions/lines/statements）
- 配置位置：`backend/jest.config.js`

### 常见陷阱

- **未覆盖错误路径** -> 只测 happy path，异常分支未验证
- **测试依赖真实数据库** -> 使用临时数据目录或 mock `database.ts`
- **前后端同时改动只测一端** -> 修改 API 契约时，前后端测试都要跑
- **E2E 测试未等后端启动** -> `playwright.config.ts` 已配置自动启动后端
- **脚本测试未隔离** -> 使用 `os.tmpdir()`，不要读写真实项目文件
- **Jest 与 ES Module** -> 后端是 ES Module，测试需 `NODE_OPTIONS=--experimental-vm-modules`

### 验证方法

```bash
# 1. 后端测试
cd backend && npm test

# 2. 后端测试（监听模式）
cd backend && npm run test:watch

# 3. 前端类型检查
cd frontend && npm run typecheck

# 4. E2E 测试
npx playwright test

# 5. 全量验证（CI 等价）
npm run build:backend
npm run build:frontend
cd backend && npm test
npx playwright test
```

---

## 附录：环境变量速查

| 变量 | 作用 | 默认值 | 修改场景 |
|------|------|--------|----------|
| `PAPYRUS_PORT` | 后端监听端口 | `8000` | 端口冲突 |
| `PAPYRUS_DATA_DIR` | 用户数据目录 | `~/PapyrusData` | 自定义存储位置 |
| `PAPYRUS_AUTH_TOKEN` | API 认证 token | — | Electron 模式安全 |
| `PAPYRUS_DEBUG` | 调试模式 | — | 开发调试 |
| `NODE_ENV` | 运行环境 | — | `development`/`production` |
| `CI` | CI 环境标识 | — | GitHub Actions 自动设置 |

---

## 附录：项目约定速查

| 约定项 | 规则 |
|--------|------|
| 后端模块系统 | ES Module（`"type": "module"`），import 带 `.js` 后缀 |
| 前端模块系统 | ES Module，Vite 处理 |
| 脚本模块系统 | CommonJS（`require`） |
| TypeScript | `strict: true`，后端额外 `noUncheckedIndexedAccess: true` |
| 类型分工 | `type` 用于联合/交叉/条件类型；`interface` 用于对象结构 |
| 禁止 | 显式 `any`、非空断言 `!`、随意类型断言 `as` |
| CSS 前缀 | Tailwind 类名带 `tw-` 前缀 |
| 页面命名 | `*Page`（StartPage, ScrollPage 等） |
| Hook 命名 | `use` 前缀 |
| 注释规范 | 每个函数/复杂逻辑需说明：做什么、为什么、为什么不用其他方式 |

---

> **最后更新**：2026-05-28  
> **维护者**：任何改动本文件所述场景的开发者，请同步更新此文档。
