# Papyrus 环境要求

## 目标

本文用于统一说明 Papyrus 当前开发与运行所需的环境版本。

---

## 1. Node.js 环境

### 必需版本

- Node.js: `24+`
- npm: `11+`

### 安装方式

```bash
# 使用官方安装包或 nvm
nvm install 24
nvm use 24
```

---

## 2. 前端环境

### 已确认版本

来自 `frontend/package.json`：

- react: `19.2.4`
- react-dom: `19.2.4`
- @arco-design/web-react: `2.66.14`
- vite: `^8.0.11`
- typescript: `^5.6.0`

### 安装方式

```bash
cd frontend
npm install
```

### 本地开发

```bash
cd frontend
npm run dev
```

默认前端开发服务使用：

- Vite dev server: `http://127.0.0.1:5173`

前端会将 `/api` 请求代理到：

- Backend API: `http://127.0.0.1:8000`

---

## 3. 后端环境

### 已确认版本

来自 `backend/package.json`：

- fastify: `^5.3.2`
- typescript: `^5.6.0`
- tsx: `^4.19.4`
- jest: `^29.7.0`
- openai: `^4.96.0`
- zod: `^3.25.76`

### 安装方式

```bash
cd backend
npm install
```

### 本地开发

```bash
cd backend
npm run dev         # tsx watch src/api/server.ts
```

后端服务：

- Fastify: `http://127.0.0.1:8000`
- 可通过 `PAPYRUS_PORT` 环境变量覆盖端口

---

## 4. Electron 环境

### 版本

- electron: `^41.1.0`
- electron-builder: `^26.8.1`

### 开发模式

```bash
npm run electron:dev
```

### 构建

```bash
npm run electron:build
```

---

## 5. 推荐启动顺序

### 一键启动前后端

```bash
npm run dev
```

### 分别启动

```bash
# 终端 1 - 后端
cd backend && npm run dev

# 终端 2 - 前端
cd frontend && npm run dev
```

### 带 Electron

```bash
npm run electron:dev
```

---

## 6. 版本基线总结

### 前端

- Node.js `24+`
- npm `11+`
- react `19.2.4`
- react-dom `19.2.4`
- @arco-design/web-react `2.66.14`
- vite `^8.0.11`
- typescript `^5.6.0`
- tailwindcss `^3.4.17`

### 后端

- Node.js `24+`
- fastify `^5.3.2`
- typescript `^5.6.0`
- tsx `^4.19.4`
- jest `^29.7.0`
- openai `^4.96.0`
- zod `^3.25.76`

### 桌面

- electron `^41.1.0`
- electron-builder `^26.8.1`

### 测试

- Jest `^29.7.0`
- ts-jest `^29.3.2`
- Playwright `^1.59.1`
