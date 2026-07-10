# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

---

## [v2.0.0-beta.12] - 2026-07-10

### 🎉 New Features
- **Settings**: 设置中新增翻译模型选择
- **Chat**: 优化窄面板布局并丰富消息操作

### 🐛 Bug Fixes
- **Security**: 加固 API 认证、SSRF 防护与密钥暴露面
- **Frontend**: 修复 token 复用与 PDF 预览相关问题
- **CI**: 恢复完整的 release-optimized 工作流文件

### 💡 Improvements
- **UI**: 移除首页快捷卡片；优化搜索栏长度与 Agent 标志布局
- **Chat**: 将模型选择器移入 ChatToolbar；未拉起状态下隐藏 Agent 模式文案
- **Release**: 清理 mock 资源并修复 CI 工作流冲突

---

## [v2.0.0-beta.11] - 2026-05-13

### 🐛 Bug Fixes
- **Frontend**: 修复 16 项 UI bug，优化国际化支持
- **Backend**: 补全 updateNote 异步调用 await，修复 checkpointDb 导入
- **Build**: 添加 asarUnpack 以正确解包后端文件
- **Tests**: 修复 clearAllData 事务包装，恢复集成测试，移除废弃的 ChatPanel.tsx

### 💡 Improvements
- **UI**: 更新图标资源并重构前端代码结构
- **UI**: 优化输入框和选择框的焦点样式
- **UI**: 优化笔记页面布局和功能，改进 Markdown 渲染
- **Relations**: 优化关联关系功能与文件导航体验
- **Build**: 修改 Electron 构建配置，优化构建配置和 CI 工作流
- **CI**: 为 node_modules 添加缓存并优化依赖安装流程
- **CI**: 优化后端依赖处理流程
- **Cleanup**: 清理大量废弃测试文件与临时文档

---

## [v2.0.0-beta.10] - 2026-05-05

### 🎉 New Features
- **Proxy**: 改善代理弹性，统一品牌为 Papyrus Desktop
- **Chat**: 重新生成按钮可覆盖当前回答

### 💡 Improvements
- **UI**: 悬停预览等细节统一更换为 Papyrus Desktop

---

## [v2.0.0-beta.9] - 2026-05-05

### 🐛 Bug Fixes
- **Bump tool**: 使用 `refs/tags/` 前缀避免分支/tag 名称冲突

---

## [v2.0.0-beta.8] - 2026-05-05

### 🎉 New Features
- **Update**: 添加系统代理自动检测
- **Bump tool**: 自动化版本提升工具

### 💡 Improvements
- **About**: 更新 about 页面应用名

---

## [v2.0.0-beta.7] - 2026-05-05

### 🎉 New Features
- **Desktop**: 统一应用品牌为 Papyrus Desktop
- **Proxy**: 代理服务器匿名认证，发送 PapyrusDesktop User-Agent
- **AI**: 默认使用 liyuan-deepseek 并支持 V4PRO

### 🐛 Bug Fixes
- **Chat**: 修复无法切换模型和发送消息的问题
- **CI**: 修复工作流分支名和测试失败问题

---

## [v2.0.0-beta.6] - 2026-04-29

### 🎉 New Features
- **CI**: 启用 v2.0.0beta.6 分支推送时自动 draft release
- **CI**: 自动生成 release notes

### 🐛 Bug Fixes
- **i18n**: 修复组件外部 hook 作用域的 t 函数传递

---

## [v2.0.0-beta.5] - 2026-04-29

### 🔧 Refactor
- **Build**: 移除 Windows 安装包文件名中的版本号

### 🐛 Bug Fixes
- **CI**: 强化后端依赖验证
- **Build**: 修复 asarUnpack 配置和 electron-builder 文件配置语法

---

## [v2.0.0beta.4] - 2026-04-27

### 🐛 Bug Fixes
- **Chat panel model sync**: the model dropdown now loads live provider/model data from `/api/providers` instead of a hardcoded static list.
- **AIConfig parsing**: `ChatPanel` now correctly unwraps the `{ success, config }` envelope returned by `/api/config/ai`, fixing the permanent "AI 配置不完整" warning.
- **Chat API contract**: fixed the request URL (`/api/ai/chat/stream` → `/api/chat`) and request body to match the TypeScript/Fastify backend expectations.
- **SSE format alignment**: backend `/chat` streaming now emits `{ type, data }` shaped events that the frontend `handleSSEStream` parser expects.
- **Model override support**: backend `chatStream` accepts an optional `overrideModel` parameter so the user-selected model is actually used for the conversation.
- **File attachment fallback**: the frontend no longer attempts multipart uploads (unsupported by the current Fastify backend); file names are appended to the message text as placeholders.

### 🔧 Refactor
- Extracted shared AI types (`AIConfig`, `ProviderModel`) from `ChatPanel.tsx` into `frontend/src/types/ai.ts`.

---

## [v1.2.2] - 2026-03-13

### 🐛 Bug Fixes
- Fixed API Key encoding error with non-ASCII characters
- Added configuration validation mechanism
- Three-layer protection:
  - Config validation: `AIConfig.validate_config()`
  - UI layer: Settings window catches `ValueError`
  - Request fallback: `AIProvider` handles `UnicodeEncodeError`

### 💡 Improvements
- Better error messages indicating which provider/field has issues
- Prevent saving invalid configurations

---

## [v1.2.1] - 2026-03-11

### 🎉 New Features
#### SM-2 Algorithm
- Replaced simple algorithm with proven SM-2 spaced repetition
- Dynamic interval adjustment based on answer quality
- Per-card Easiness Factor
- Full backward compatibility

#### AI Assistant
- Modern conversation interface
- Pure chat mode: Natural language interaction
- Agent mode: Tool-based interactions

---

## [v1.2.0] - 2026-03-08

### 🎉 New Features
- Obsidian Vault import support
- File tree navigation
- Note relations and graph view
- Tag system

### 🐛 Bug Fixes
- Database migration improvements
- Better error handling for corrupted data

---

## [v1.1.0] - 2026-02-20

### 🎉 New Features
- Initial AI integration
- Chat interface
- Card generation from notes

### 🔧 Technical
- Python 3.14 migration
- FastAPI backend

---

## [v1.0.0] - 2026-01-15

### 🎉 Initial Release
- Basic flashcard functionality
- Simple spaced repetition
- Local data storage
- Electron desktop app

---

## Release Checklist

When creating a new release:

1. Update the `[Unreleased]` section with all changes
2. Move changes to a new version section
3. Update the version links at the bottom
4. Commit: `git add CHANGELOG.md && git commit -m "chore: update changelog for vX.X.X"`
5. Tag: `git tag vX.X.X`
6. Push: `git push && git push --tags`

---

[Unreleased]: https://github.com/PapyrusOR/Papyrus_Desktop/compare/v2.0.0-beta.12...HEAD
[v2.0.0-beta.12]: https://github.com/PapyrusOR/Papyrus_Desktop/compare/v2.0.0-beta.11...v2.0.0-beta.12
[v2.0.0-beta.11]: https://github.com/PapyrusOR/Papyrus_Desktop/compare/v2.0.0-beta.10...v2.0.0-beta.11
[v2.0.0-beta.10]: https://github.com/PapyrusOR/Papyrus_Desktop/compare/v2.0.0-beta.9...v2.0.0-beta.10
[v2.0.0-beta.9]: https://github.com/PapyrusOR/Papyrus_Desktop/compare/v2.0.0-beta.8...v2.0.0-beta.9
[v2.0.0-beta.8]: https://github.com/PapyrusOR/Papyrus_Desktop/compare/v2.0.0-beta.7...v2.0.0-beta.8
[v2.0.0-beta.7]: https://github.com/PapyrusOR/Papyrus_Desktop/compare/v2.0.0-beta.6...v2.0.0-beta.7
[v2.0.0-beta.6]: https://github.com/PapyrusOR/Papyrus_Desktop/compare/v2.0.0-beta.5...v2.0.0-beta.6
[v2.0.0-beta.5]: https://github.com/PapyrusOR/Papyrus_Desktop/compare/v2.0.0beta.4...v2.0.0-beta.5
[v2.0.0beta.4]: https://github.com/PapyrusOR/Papyrus_Desktop/compare/v1.2.2...v2.0.0beta.4
[v1.2.2]: https://github.com/PapyrusOR/Papyrus_Desktop/compare/v1.2.1...v1.2.2
[v1.2.1]: https://github.com/PapyrusOR/Papyrus_Desktop/compare/v1.2.0...v1.2.1
[v1.2.0]: https://github.com/PapyrusOR/Papyrus_Desktop/compare/v1.1.0...v1.2.0
[v1.1.0]: https://github.com/PapyrusOR/Papyrus_Desktop/compare/v1.0.0...v1.1.0
[v1.0.0]: https://github.com/PapyrusOR/Papyrus_Desktop/releases/tag/v1.0.0
