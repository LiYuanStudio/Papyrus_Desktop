# Papyrus 文档中心

欢迎来到 Papyrus 文档中心。这里包含使用与开发 Papyrus Desktop 所需的文档。

---

## 文档导航

### 新用户入门

| 文档 | 说明 |
|------|------|
| [快速启动指南](guides/QUICKSTART.md) | 5 分钟快速上手 |
| [版本信息](guides/VERSION.md) | 当前版本功能与安装说明 |
| [更新日志](../CHANGELOG.md) | 完整版本历史（仓库根目录） |

### 用户指南

| 文档 | 说明 |
|------|------|
| [无障碍设置](guides/A11Y_SETTINGS.md) | 辅助功能配置说明 |
| [AI 功能说明](AI_README.md) | AI 助手配置与使用 |

### 开发指南

| 文档 | 说明 |
|------|------|
| [项目结构](PROJECT_STRUCTURE.md) | 代码组织与架构 |
| [改动指南](CHANGE-GUIDE.md) | 常见改动入口（版本、i18n、schema、CI） |
| [环境要求](guides/ENVIRONMENT_REQUIREMENTS.md) | 开发环境与依赖版本 |
| [无障碍开发指南](guides/ACCESSIBILITY_GUIDE.md) | a11y 开发规范与验证清单 |
| [UI 设计变量](guides/UI_TOKENS.md) | 前端样式与设计规范 |
| [窗景设计指南](guides/SCENERY_DESIGN_GUIDE.md) | 窗景背景设计规范 |
| [Electron 打包](../ELECTRON.md) | Electron 开发与打包 |
| [开发环境启动](../README-DEV.md) | 本地前后端启动 |
| [扩展开发](EXTENSIONS.md) | 扩展 / MCP 开发 |
| [CLI 管理器设计](CLI_MANAGER_DESIGN.md) | Desktop CLI 管理器设计（`/api/cli` 已部分落地） |
| [踩坑记录](踩坑记录.md) | 已知生产问题与规避 |

### API 文档

| 文档 | 说明 |
|------|------|
| [API 文档](API.md) | REST API 完整参考 |

### 产品与发布

| 文档 | 说明 |
|------|------|
| [产品需求](PRD.md) | 产品需求文档 |
| [发布流程](guides/RELEASE.md) | Git tag 与 CI 发布 |
| [构建产物下载](guides/ARTIFACTS.md) | 通过 `gh` 下载 CI 产物 |

---

## 按场景查找

### 我是新用户

1. [快速启动指南](guides/QUICKSTART.md)
2. [版本信息](guides/VERSION.md)
3. 配置 [AI 功能](AI_README.md)

### 我想配置 AI

1. [AI 功能说明](AI_README.md)
2. [故障排除](guides/QUICKSTART.md#故障排除)

### 我需要无障碍支持

1. [无障碍设置](guides/A11Y_SETTINGS.md)
2. [无障碍开发指南](guides/ACCESSIBILITY_GUIDE.md)（开发者）

### 我是开发者

1. [项目结构](PROJECT_STRUCTURE.md)
2. [开发环境](guides/ENVIRONMENT_REQUIREMENTS.md) / [README-DEV](../README-DEV.md)
3. [改动指南](CHANGE-GUIDE.md)
4. [API 文档](API.md)

---

## 项目信息

### 版本

- **当前版本**: v2.0.0-beta.12
- **更新日期**: 2026-07

### 技术栈

- **后端**: Node.js 24+, TypeScript 5, Fastify 5
- **存储**: SQLite（`node:sqlite`，WAL），默认 `$HOME/PapyrusData/papyrus.db`
- **前端**: React 19, TypeScript 5, Vite 8, Arco Design, Tailwind CSS（`tw-` 前缀）
- **桌面壳**: Electron 41 + electron-builder
- **算法**: SM-2 间隔重复

### 仓库

- GitHub: https://github.com/PapyrusOR/Papyrus_Desktop
- Issues: https://github.com/PapyrusOR/Papyrus_Desktop/issues

---

## 需要帮助？

1. 查看 [快速启动指南](guides/QUICKSTART.md) 的故障排除部分
2. 在 GitHub Issues 提交问题
3. 参考 [更新日志](../CHANGELOG.md) 了解最新变更

---

**维护者**: Papyrus 开发团队  
**最后更新**: 2026-07-10
