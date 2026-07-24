# Papyrus 开发环境启动指南

## 🚀 快速启动（推荐）

### 方式一：使用 launcher（最方便）

```bash
# 在项目根目录
npm install   # 首次运行，会级联安装 frontend/ 和 backend/ 依赖
npm run dev   # 一键并发启动前后端
```

这会同时启动：
- 后端 (Fastify, tsx watch): http://127.0.0.1:8000
- 前端 (Vite): http://localhost:5173

按 `Ctrl+C` 可以同时关闭两个服务。

---

### 方式二：使用批处理脚本（Windows）

双击运行项目根目录下的：

```
start-dev.bat
```

脚本会自动释放占用的 8000 / 5173 端口、检查并安装缺失的 Node 依赖，然后调用 `npm run dev`。

---

### 方式三：使用 PowerShell

```powershell
.\start-dev.ps1
```

行为同 `start-dev.bat`，但用 PowerShell 实现。

---

## 🔧 手动启动（开发调试）

如果你需要分别调试前后端：

**终端 1 - 后端：**
```bash
cd backend
npm run dev   # tsx watch src/api/server.ts
```

**终端 2 - 前端：**
```bash
cd frontend
npm run dev   # vite
```

---

## 📦 首次运行准备

### 安装 Node.js 依赖

在项目根目录执行一次即可（postinstall 会自动级联安装 frontend/ 和 backend/）：

```bash
npm install
```

如需单独安装：

```bash
cd frontend && npm install
cd ../backend && npm install
```

---

## 🎯 可用命令

### 根目录

| 命令 | 说明 |
|------|------|
| `npm run dev` | 并发启动后端 + 前端（推荐） |
| `npm run dev:frontend` | 只启动前端 |
| `npm run dev:backend` | 只启动后端 |
| `npm run electron:dev` | 启动前后端并拉起 Electron |
| `npm run build:frontend` | 构建前端到 `frontend/dist/` |
| `npm run build:backend` | 构建后端到 `backend/dist/` |
| `npm run electron:build` | 全平台构建（前端 + 后端 + electron-builder） |
| `npm run electron:build:win` | 仅构建 Windows |
| `npm run electron:build:mac` | 仅构建 macOS |
| `npm run electron:build:linux` | 仅构建 Linux |

### `backend/`

| 命令 | 说明 |
|------|------|
| `npm run dev` | tsx watch 启动 Fastify |
| `npm run build` | tsc 编译到 `dist/` |
| `npm test` | Jest 单元 + 集成测试 |
| `npm run typecheck` | tsc --noEmit |

### `frontend/`

| 命令 | 说明 |
|------|------|
| `npm run dev` | Vite 开发服务器 |
| `npm run build` | 生产构建 |
| `npm run typecheck` | TypeScript 类型检查 |

---

## 🔍 故障排除

### 问题：后端启动失败

**解决：**
```bash
# 检查 Node 版本（要求 24+）
node --version

# 重新安装后端依赖
cd backend
rm -rf node_modules
npm install

# 单独启动看真实报错
npm run dev
```

### 问题：前端启动失败

**解决：**
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
```

### 问题：端口被占用

后端默认 8000，前端默认 5173。

```bash
# Windows: 找占用 8000 端口的进程
netstat -ano | findstr :8000
taskkill /PID <PID> /F

# macOS / Linux:
lsof -ti :8000 | xargs kill -9
```

或通过环境变量改后端端口：

```bash
# Windows
set PAPYRUS_PORT=8080 && npm run dev:backend

# macOS / Linux
PAPYRUS_PORT=8080 npm run dev:backend
```

---

## 📝 技术栈

- **前端**: React 19 + TypeScript + Vite + Arco Design + Tailwind CSS
- **后端**: Node.js 24 + TypeScript 5 + Fastify 5
- **存储**: SQLite（`node:sqlite`，WAL），默认 `$HOME/PapyrusData/papyrus.db`（可用 `PAPYRUS_DATA_DIR` 覆盖）
- **桌面**: Electron 41 + electron-builder
- **测试**: Jest（后端）
- **通信**: REST API（端口 8000）

---

## 🎨 Tailwind CSS 使用

项目中已集成 Tailwind CSS，所有类名带 `tw-` 前缀：

```tsx
<div className="tw-flex tw-gap-4 tw-p-4 tw-bg-arco-bg-2">
  <span className="tw-text-primary">主色文字</span>
</div>
```

颜色与 Arco Design 主题同步，自动适配深色/浅色模式。
