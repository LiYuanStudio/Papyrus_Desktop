# Papyrus 版本信息

## 当前版本：v2.0.0-beta.12

### 🎉 主要更新

#### v2.0.0-beta.12 更新内容
- **设置**: 新增翻译模型选择
- **聊天**: 优化窄面板布局并丰富消息操作
- **安全**: 加固 API 认证、SSRF 防护与密钥暴露面
- **存储**: 主数据为 SQLite（`node:sqlite`，WAL）

#### v2.0.0-beta.11 更新内容
- **前端重构**: 更新图标资源并重构前端代码结构
- **笔记优化**: 优化笔记页面布局和功能，改进 Markdown 渲染
- **UI 改进**: 优化输入框和选择框焦点样式
- **构建优化**: 修改 Electron 构建配置，优化 CI 工作流
- **Bug 修复**: 修复 16 项 bug，优化国际化支持
- **清理**: 清理大量废弃测试文件与临时文档

#### v2.0.0-beta.10 更新内容
- **代理改善**: 改善代理弹性，统一品牌为 Papyrus Desktop
- **聊天增强**: 重新生成按钮可覆盖当前回答

#### v2.0.0-beta.7~beta.9 更新内容
- **品牌统一**: 统一应用品牌为 Papyrus Desktop
- **系统代理**: 添加系统代理自动检测
- **Bump 工具**: 自动化版本提升工具

#### v2.0.0-beta.5~beta.6 更新内容
- **CI 强化**: 强化后端依赖验证，修复 asarUnpack 配置
- **Release**: 启用分支推送时自动 draft release

#### v2.0.0-beta.4 更新内容
- **聊天修复**: 修复聊天框模型同步与前后端 API 协议对齐
- **AI 配置**: 修复 AIConfig 解析和 SSE 格式对齐

---

## 📦 安装说明

### 环境要求

| 组件 | 版本 |
|------|------|
| Node.js | 24+ |
| npm | 11+ |

### 基础功能
- SM-2 算法
- 卡片学习
- 数据管理

### AI 功能
无需额外依赖，在应用中配置 API Key 即可使用。

---

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

postinstall 会自动级联安装 frontend/ 和 backend/ 的依赖。

### 2. 启动程序

**开发模式（推荐）**
```bash
npm run dev
```

这会并发启动后端 (Fastify, tsx watch) 和前端 (Vite)。

**或通过 Electron 启动**
```bash
npm run electron:dev
```

访问 http://localhost:5173 查看应用。

### 3. 配置 AI（可选）
1. 访问设置页面
2. 在 "AI 配置" 标签页输入 API Key
3. 在 "模型管理" 标签页选择模型
4. 保存设置

### 4. 使用 AI 对话
直接在输入框输入问题：
- "帮我解释这道题"
- "创建一张关于递归的卡片"
- "搜索所有 Python 相关的题"

---

## 📊 数据格式

### 卡片数据
```json
{
  "id": "uuid-string",
  "q": "题目",
  "a": "答案",
  "next_review": 1234567890,
  "interval": 0,
  "ef": 2.5,
  "repetitions": 0,
  "tags": ["tag1"]
}
```

### 笔记数据
```json
{
  "id": "uuid-string",
  "title": "笔记标题",
  "folder": "文件夹",
  "content": "笔记内容",
  "tags": ["tag1", "tag2"],
  "created_at": 1234567890,
  "updated_at": 1234567890
}
```

---

## 🔧 技术架构

```
Papyrus/
├── backend/                 # Node.js + Fastify 后端
│   ├── src/
│   │   ├── api/             # Fastify 路由
│   │   ├── core/            # 核心业务逻辑
│   │   ├── ai/              # AI 功能模块
│   │   ├── db/              # SQLite（node:sqlite，WAL）
│   │   ├── cli/             # Desktop CLI 管理
│   │   └── utils/           # 工具函数
│   └── package.json
├── frontend/                # React + TypeScript 前端
│   ├── src/
│   │   ├── StartPage/       # 开始页面
│   │   ├── ScrollPage/      # 卷轴复习
│   │   ├── NotesPage/       # 笔记管理
│   │   ├── SettingsPage/    # 设置
│   │   ├── ChatPanel/       # AI 聊天
│   │   └── ...
│   └── package.json
└── electron/                # Electron 主进程
```

### 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Node.js 24, TypeScript 5, Fastify 5 |
| 前端 | React 19, TypeScript 5, Arco Design, Vite 8, Tailwind CSS |
| 桌面 | Electron 41, electron-builder |
| 算法 | SM-2 间隔重复 |
| 存储 | SQLite（`node:sqlite`，WAL），`$HOME/PapyrusData/papyrus.db` |

---

## 🌐 API 服务

### 启动后端
```bash
cd backend && npm run dev
```

### 端点
- Health: http://127.0.0.1:8000/api/health
- API: http://127.0.0.1:8000/api/*

---

## ⚠️ 已知问题

1. **Windows 控制台编码警告**
   - 不影响使用
   - 已在代码中处理

2. **Ollama 刷新功能**
   - 待完善
   - 可手动添加模型名称

---

## 🔮 未来计划

- [ ] 语音输入/输出（TTS/STT）
- [ ] 图片识别（拍照题目）
- [ ] 知识图谱可视化增强
- [ ] 学习进度统计面板
- [ ] 社区卡片分享
- [ ] 移动端支持
- [ ] 多用户协作

---

## 📝 更新日志

详细的版本历史请查看 [CHANGELOG.md](../../CHANGELOG.md)

---

## 💬 反馈与支持

- 问题反馈：[GitHub Issues](https://github.com/PapyrusOR/Papyrus_Desktop/issues)
- 功能建议：欢迎提交 Pull Request

---

## 📄 开源协议

MIT License

---

**Papyrus v2.0.0-beta.12** - 让学习更智能，让记忆更科学。
