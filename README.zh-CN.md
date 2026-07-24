# 📜 Papyrus(莎草纸)

[English](README.md) · **简体中文** · [日本語](README.ja.md)

> Papyrus Desktop **v2.0.0-beta.12** — TypeScript / Fastify 后端、React 19 前端、Electron 41 桌面壳。

![Version](https://img.shields.io/badge/version-v2.0.0--beta.12-blue)
![Node.js](https://img.shields.io/badge/Node.js-24-339933)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6)
![Fastify](https://img.shields.io/badge/Fastify-5-000000)
![React](https://img.shields.io/badge/React-19-61DAFB)
![Electron](https://img.shields.io/badge/Electron-41-47848F)
![License](https://img.shields.io/badge/License-MIT-yellow)
![AI-Assisted](https://img.shields.io/badge/Dev-AI--Assisted-blueviolet)
![Accessibility](https://img.shields.io/badge/a11y-WCAG%202.1%20AA%2FAAA-green)

**Papyrus** 是一款专注于高强度记忆训练的极简、全键盘驱动、AI Agent 加持的间隔重复(SRS)复习引擎。

> "大道至简。"

---

## ✨ 核心特性

- 🚀 **心流交互** — 全流程键盘驱动,复习时手不离键盘。
- 🧠 **可靠调度** — 内置 SM-2 间隔重复算法,按掌握程度自动安排下一次复习。
- 🤖 **AI Agent** — 支持 OpenAI / Anthropic / Ollama,带工具调用审批流(手动/自动)与调用历史。
- 📝 **笔记 + Obsidian 导入** — 直接接入现有 Vault,支持目录树、标签、关系图。
- 🕘 **版本历史与回滚** — 笔记/卡片每次编辑自动保存内容哈希版本;回滚生成新版本(无破坏性修改)。
- 🔐 **API Key 加密落盘** — AES-GCM,每个安装独立的主密钥、盐与认证标签。
- 🛡️ **默认安全** — 写接口强制 auth token,云端 AI base URL 启用 SSRF 防护,公开接口加 rate limiting,路径遍历用 `dev`+`ino` 容器化校验。
- ♿ **无障碍** — 全站 WCAG 2.1 AA,提供 AAA 级对比度方案、屏幕阅读器优化、减少动画模式。
- 🌐 **现代架构** — Node.js + TypeScript(Fastify)后端,React 19 + Vite + Arco Design 前端,Electron 41 桌面壳。
- 📦 **本地优先** — 数据本地存储;只有当你主动指向云端 AI 提供商时,数据才会出本机。

---

## 📥 下载

预构建安装包发布在 [Releases](https://github.com/PapyrusOR/Papyrus_Desktop/releases) 页面。

| 平台 | 架构 | 格式 |
| :--- | :--- | :--- |
| Windows | x64 | NSIS 安装程序(`.exe`)、便携版(`.exe`) |
| macOS | arm64 | DMG(`.dmg`)、ZIP(`.zip`) |
| Linux | x64 | AppImage、DEB(`.deb`)、TAR.GZ |

> ⚠️ `v2.0.0-beta.12` 是 beta 版本。数据结构已稳定,但 UI 与 API 在 `v2.0.0` 正式版前仍可能调整。

---

## ⌨️ 快捷键(心流模式)

| 按键 | 动作 | 效果 |
| :--- | :--- | :--- |
| **空格** | **揭晓答案** | 展开卷轴,查看"卷尾"内容 |
| **1** | **忘记** | 标记为不熟悉,短期内高频重现 |
| **2** | **模糊** | 标记为不确定,稍后再次复习 |
| **3** | **秒杀** | 记忆稳固,复习间隔线性翻倍 |
| **Tab** | **导航** | 在可交互元素间切换焦点 |
| **Ctrl + K** | **搜索** | 打开全局搜索 |

---

## 🚀 快速开始(从源码运行)

### 环境要求

- **Node.js** 24+
- **npm** 11+

### 安装依赖

```bash
# postinstall 会自动级联安装 frontend/ 和 backend/
npm install
```

### 启动开发模式

```bash
# 并发运行 backend(Fastify, tsx watch)+ frontend(Vite)
npm run dev

# 或者带上 Electron 一起拉起
npm run electron:dev
```

- 前端:<http://localhost:5173>
- 后端 API:<http://127.0.0.1:8000>
- 健康检查:<http://127.0.0.1:8000/api/health>

### 构建安装包

```bash
npm run electron:build          # 当前平台
npm run electron:build:win      # 仅 Windows
npm run electron:build:mac      # 仅 macOS
npm run electron:build:linux    # 仅 Linux
```

产物输出到 `dist-electron/`。

---

## 📥 批量导入卡片

准备一个 UTF-8 编码的 `.txt` 文件,格式如下:

```text
模型场景或问题 A === 核心扳机或答案 A

模型场景或问题 B === 核心扳机或答案 B
```

> 每组卡片用 `===` 分隔,组与组之间建议空一行以保持清晰。

---

## 🤖 AI 配置

### 1. 配置提供商

点击侧边栏的 **⚙️ 设置**,添加 API Key:

- **OpenAI** — 在 <https://platform.openai.com/api-keys> 获取
- **Anthropic** — 在 <https://console.anthropic.com/> 获取
- **Ollama** — 本地运行,无需 API Key
  ```bash
  # 下载: https://ollama.ai
  ollama pull llama2
  ```

API Key **加密落盘**(AES-GCM,每个安装独立主密钥)。

### 2. 选择模式

- **Agent 模式** — 模型可在工具调用审批流下使用工具(增/删/改卡片、搜索笔记等)。
- **Chat 模式** — 纯对话,无副作用。

### 3. 参数调整

- **Temperature** — 0~2,越高越随机。
- **Max Tokens** — 单次回复长度上限。
- **工具审批** — `manual`(队列审核)或 `auto`(白名单驱动)。

---

## ♿ 无障碍

Papyrus 致力于让所有人都能使用:

- **键盘导航** — 全页面 Tab 顺畅穿梭。
- **屏幕阅读器** — 语义化 ARIA 标签,状态变化有 live region 朗读。
- **对比度** — **设置 → 无障碍** 提供 AAA 级配色方案。
- **动画** — 减少动画模式跟随系统偏好。

---

## 🛠️ 技术架构

```
Papyrus/
├── backend/                  # Node.js + TypeScript(Fastify)
│   └── src/
│       ├── api/              # Fastify 路由与服务器入口(server.ts)
│       ├── core/             # 卡片、笔记、SM-2、版本管理、加密
│       ├── db/               # SQLite（node:sqlite，WAL）与 schema 初始化
│       ├── ai/               # 提供商抽象、工具管理器、LLM 缓存
│       ├── cli/              # Desktop CLI 管理辅助
│       ├── mcp/              # MCP REST 接口(笔记/Vault CRUD)
│       ├── integrations/     # Obsidian 导入、文件监听(chokidar)
│       └── utils/            # 通用工具
├── frontend/                 # React 19 + TypeScript(Vite)
│   └── src/
│       ├── StartPage/        # 首页(最近笔记、复习队列、节气主题)
│       ├── ScrollPage/       # 卷轴复习页
│       ├── NotesPage/        # 笔记管理与关系图
│       ├── FilesPage/        # 文件库
│       ├── ExtensionsPage/   # 扩展管理
│       ├── SettingsPage/     # 设置、AI 配置、无障碍
│       ├── ChartsPage/       # 统计与进度图表
│       └── ChatPanel/        # AI 聊天面板
├── electron/                 # Electron 41 主进程 + preload
├── scripts/                  # build-electron.js、extract-changelog.js
├── e2e/                      # Playwright 端到端测试
└── docs/                     # 项目文档
```

### 技术栈

- **后端** — Node.js 24、TypeScript 5、Fastify 5、Jest
- **前端** — React 19、TypeScript 5、Vite、Arco Design、Tailwind CSS
- **桌面** — Electron 41 + electron-builder
- **算法** — SM-2 间隔重复
- **存储** — SQLite（`node:sqlite`，WAL），内容哈希版本
- **CI/CD** — GitHub Actions 三平台矩阵(Windows x64、macOS arm64、Linux x64)

---

## 🔧 开发说明

### 后端

```bash
cd backend
npm run dev         # tsx watch 热重载 Fastify
npm run build       # 编译 TypeScript 到 dist/
npm run typecheck   # tsc --noEmit
npm test            # Jest 单元 + 集成测试
npm start           # 运行编译后的 dist/api/server.js
```

后端默认监听 `127.0.0.1:8000`,可通过 `PAPYRUS_PORT` 覆盖。

### 前端

```bash
cd frontend
npm run dev         # Vite 开发服务器(http://localhost:5173)
npm run build       # 生产构建到 dist/
npm run typecheck   # TypeScript 类型检查
```

### 发布流程

```bash
# 1. 把 CHANGELOG.md 中 [Unreleased] 的内容归档到新版本号下

# 2. (可选)预览将进入 GitHub Release 的 changelog 节
node scripts/extract-changelog.js v2.0.0

# 3. 提交
git add CHANGELOG.md
git commit -m "chore: release v2.0.0"

# 4. 打 tag 并推送 — GitHub Actions 会构建三平台、
#    提取对应版本的 CHANGELOG 节、上传安装包。
git tag v2.0.0
git push origin main --tags
```

---

## 📁 数据文件

默认情况下,用户数据存放在 `paths.dataDir`(默认值 `$HOME/PapyrusData`,可用 `PAPYRUS_DATA_DIR` 覆盖):

- `papyrus.db` — SQLite 数据库（WAL）：卡片、笔记、提供商、聊天、版本、文件、关系、扩展、进度、UI 设置
- `backups/` — 通过 `POST /api/backup` 生成的按需备份
- `logs/` — 应用日志
- 遗留 JSON（`data.json`、`ai_config.json`）仅作兼容；AI 配置会在启动时迁入数据库
- Electron 模式下写接口依赖 `PAPYRUS_AUTH_TOKEN` / 本地生成的 auth token

---

## ⚠️ 注意事项

1. **API 费用** — OpenAI 与 Anthropic 按调用量计费,建议在提供商侧设置预算。
2. **本地模型** — Ollama 完全免费,但需要较好硬件。
3. **网络** — 云端提供商需要稳定网络。
4. **隐私** — 本地模型留在本地;云端提供商会看到你发出的内容。
5. **并发** — 同一数据目录建议只跑一个应用实例；SQLite WAL 允许多读，但不支持多进程并发写。

---

## 📚 文档

### 用户指南
- [快速启动指南](docs/guides/QUICKSTART.md) — 5 分钟上手
- [无障碍设置](docs/guides/A11Y_SETTINGS.md)
- [版本信息](docs/guides/VERSION.md)
- [更新日志](CHANGELOG.md) — 自动同步到 GitHub Release

### 开发指南
- [项目结构](docs/PROJECT_STRUCTURE.md)
- [环境要求](docs/guides/ENVIRONMENT_REQUIREMENTS.md)
- [无障碍开发指南](docs/guides/ACCESSIBILITY_GUIDE.md)
- [UI 设计变量](docs/guides/UI_TOKENS.md)
- [REST API 参考](docs/API.md)
- [扩展开发指南](docs/EXTENSIONS.md) 与 [扩展模板](examples/extension-template/)
- [Electron 打包](ELECTRON.md)
- [开发环境](README-DEV.md)

### AI 功能
- [AI 概述](docs/AI_README.md)

---

## 💡 开发者说

其实这个作品的诞生过程没有那么理想和伟大。

为什么要做这个呢?有一天我在搞 AI 学习,下了个 Anki 准备背记知识点,下完发现这玩意要检查更新,更新要连服务器,我死活连不上。

这时候发现 Gemini 在旁边呢,让它给我写一个吧,然后写了写调了调,就拿去用了。

其实我本来没想发这个东西的,为啥还是发了呢?

昨天我用上好久没上的号给女朋友点 star,github 把我识别成机器人,把我的活动下了。我火大啊,我自己用 AI,我自己又不是 AI,为了证明我不是 AI,刚好手里有这个,就改了改放上来了。

小故事讲完了,今天都初六了,过会都天亮了。苦逼学生,哎,只能在这发发牢骚。

我很喜欢一句话:知识使人自由(Veritas vos liberabit),与各位大佬共勉,这是我的第一个开源项目,望大佬们多多海涵。

就当是拜个晚年吧。
**祝你在新的一年,手持知识之利刃,刺破黑夜之墟,直捣黎明之境。**

---

## 📄 开源协议

[MIT](LICENSE)

---

**Papyrus** — 让学习更智能,让记忆更科学。
