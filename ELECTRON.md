# Papyrus Electron 配置说明

本文档说明如何使用 Electron 打包 Papyrus 应用程序。

## 项目结构

```
Papyrus/
├── electron/                # Electron 主进程代码
│   ├── main.js              # 主进程入口（启动 Node 后端、创建窗口、托盘等）
│   └── preload.js           # 预加载脚本（安全桥接）
├── scripts/                 # 构建脚本
│   └── build-electron.js    # 统一构建脚本（dev / build / build:win / ...）
├── build/                   # 构建资源
│   ├── entitlements.mac.plist  # macOS 权限配置
│   └── installer.nsh        # Windows 安装脚本
├── frontend/                # React + Vite 前端
│   └── dist/                # 前端构建输出
├── backend/                 # Node.js TypeScript 后端
│   ├── src/                 # Fastify 服务源码
│   ├── dist/                # tsc 编译输出（运行入口：dist/api/server.js）
│   └── package.json
├── assets/                  # 应用图标等资源
├── package.json             # 根目录（Electron 主入口）
└── .electron-builder.config.js  # electron-builder 打包配置
```

## 快速开始

### 1. 安装依赖

```bash
# 在项目根目录执行；postinstall 会自动级联安装 frontend/ 和 backend/
npm install
```

### 2. 开发模式

```bash
# 一键启动前后端 + Electron
npm run electron:dev
```

或者手动启动各服务：

```bash
# 终端 1
cd frontend && npm run dev

# 终端 2
cd backend && npm run dev

# 终端 3
npx electron .
```

### 3. 构建应用

```bash
# 构建当前平台
npm run electron:build

# 仅构建 Windows
npm run electron:build:win

# 仅构建 macOS
npm run electron:build:mac

# 仅构建 Linux
npm run electron:build:linux
```

`scripts/build-electron.js` 在 build 时会依次执行：依赖检查 → 构建前端 (`frontend/dist/`) → 构建后端 (`backend/dist/`) → 调用 `electron-builder`。

## 配置说明

### 开发模式

- **前端**: `http://localhost:5173` (Vite 开发服务器)
- **后端**: `http://127.0.0.1:8000` (Fastify, 通过 `tsx watch` 热重载)
- **Electron**: 加载 `localhost:5173`，启用 DevTools

### 生产模式

- **前端**: 打包后的静态文件 (`frontend/dist/`)
- **后端**: 编译后的 JS (`backend/dist/api/server.js`)，由主进程通过 `child_process.spawn` 拉起 Node 子进程
- **Electron**: 加载本地文件，禁用 DevTools

## 平台支持

| 平台 | 架构 | 输出格式 |
|------|------|----------|
| Windows | x64 | NSIS 安装程序 (.exe), 便携版 (.exe) |
| macOS | arm64 | DMG (.dmg), ZIP (.zip) |
| Linux | x64 | AppImage, DEB (.deb), TAR.GZ |

## 关键文件说明

### electron/main.js

Electron 主进程，负责：
- 创建应用窗口
- 启动 / 停止 Node.js 后端子进程（`backend/dist/api/server.js`）
- 后端就绪轮询（轮询 `/api/health`）
- 系统托盘集成
- 平台适配

### electron/preload.js

预加载脚本，安全地暴露 Electron API 给前端：
- `window.electronAPI` - 主进程通信接口
- `window.electronEnv` - 环境信息

### scripts/build-electron.js

统一构建脚本：
- 检查依赖（root / frontend / backend）
- 构建前端
- 构建 Node 后端（`tsc` 输出到 `backend/dist/`）
- 调用 `electron-builder` 打包

### `.electron-builder.config.js`

打包配置（由 `scripts/build-electron.js` / `electron-builder --config` 引用）：
- 应用标识和元数据
- 平台特定配置（Windows NSIS、macOS DMG、Linux AppImage/DEB）
- 文件包含 / 排除规则（包含 `electron/**`、`frontend/dist/**`、`backend/dist/**`、`backend/package.json`）
- Electron 版本：41.x（与根 `package.json` 的 `electron` 依赖一致）

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `NODE_ENV` | 运行环境 | `production` |
| `ELECTRON_IS_DEV` | 开发模式标志 | 自动检测 |
| `PAPYRUS_PORT` | 后端监听端口 | `8000` |
| `PAPYRUS_DEBUG` | 后端启用详细错误响应 | 未设置 |

## 常见问题

### 1. 后端启动失败

检查：
- Node.js 24+ 是否安装
- 后端依赖是否安装：`cd backend && npm install`
- 后端是否可单独构建：`cd backend && npm run build`
- 端口 8000 是否被占用

### 2. 前端构建失败

检查：
- Node.js 24+ 是否安装
- 前端依赖是否安装：`cd frontend && npm install`

### 3. electron-builder 打包失败

检查：
- 是否先成功构建了 `frontend/dist/` 与 `backend/dist/`
- 是否有足够的磁盘空间
- Windows 上若涉及代码签名，确认 `package.json` 的 `win.publisherName` 与证书匹配

### 4. macOS 签名问题

如需代码签名，修改 `package.json` 中 `build.mac` 配置：
```json
"mac": {
  "codesignIdentity": "Developer ID Application: Your Name (TEAM_ID)"
}
```

## 调试

### 查看日志

- **Windows**: `%APPDATA%\Papyrus\logs\`
- **macOS**: `~/Library/Application Support/Papyrus/logs/`
- **Linux**: `~/.config/Papyrus/logs/`

### 开发工具

开发模式下自动打开 DevTools。生产模式下按 `Ctrl+Shift+I` (Windows/Linux) 或 `Cmd+Option+I` (macOS) 打开。

## 发布

1. 更新版本号 (`package.json`)
2. 在 `CHANGELOG.md` 中归档当前 `[Unreleased]` 内容到对应版本
3. 运行构建命令验证本地能产出安装包
4. 打 tag 并推送，GitHub Actions（`.github/workflows/release-optimized.yml`）会自动构建并发布到 Releases

```bash
# 本地构建所有平台（需对应宿主机器或交叉构建支持）
npm run electron:build:win
npm run electron:build:mac
npm run electron:build:linux
```

## Electron 41 说明

- 依赖版本：`electron@^41.1.0`（根 `package.json`）
- 开发模式通过 `npm run electron:dev` → `scripts/build-electron.js dev` 拉起
- 生产打包通过 `npm run electron:build[:win|:mac|:linux]`，配置文件为 `.electron-builder.config.js`
- 后端由主进程以 Node 子进程方式启动 `backend/dist/api/server.js`，就绪后轮询 `/api/health`
